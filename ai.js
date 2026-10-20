(function (root) {
  "use strict";
  const E = root.AzulEngine;
  const other = (player) => player === "me" ? "rival" : "me";
  const LEVELS = {
    easy: { name: "入门", description: "练习规则，出手保留随机性" },
    medium: { name: "进阶", description: "重视相邻得分、完成率和地板风险" },
    hard: { name: "大师", description: "多步对抗搜索，争夺关键砖与轮末主动权" },
  };
  function boardValue(board, projection, ending, supply) {
    let value = Math.max(0, board.score + projection.net);
    const bonus = E.endBonuses(projection.wall);
    if (ending) return value + bonus.points;
    value += bonus.points * 0.9;
    for (let col = 0; col < 5; col++) {
      const n = projection.wall.filter((row) => row[col]).length;
      if (n < 5) value += 7 * Math.pow(n / 5, 3) * 0.7;
    }
    for (const color of E.COLORS) {
      const n = E.WALL_PATTERN.filter((row, r) => projection.wall[r][row.indexOf(color)]).length;
      if (n < 5) value += 10 * Math.pow(n / 5, 3) * 0.65;
    }
    for (let row = 0; row < 5; row++) {
      const line = board.lines[row];
      if (!line.color || line.count === row + 1) continue;
      const ratio = line.count / (row + 1);
      const canComplete = supply[line.color] + line.count >= row + 1;
      value += ratio * (E.placementScore(projection.wall, row, E.wallColumn(row, line.color)) + 0.5) * (canComplete ? 0.8 : 0.35);
    }
    // 相邻墙格会提高后续落砖得分，不能只贪本轮短线。
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      if (!projection.wall[r][c]) continue;
      if (r < 4 && projection.wall[r + 1][c]) value += 0.13;
      if (c < 4 && projection.wall[r][c + 1]) value += 0.13;
    }
    return value;
  }
  function evaluate(position, perspective, tokenOwner) {
    const a = E.projectBoard(position.me), b = E.projectBoard(position.rival);
    const ending = a.wall.some((row) => row.every(Boolean)) || b.wall.some((row) => row.every(Boolean));
    const supply = { ...position.center };
    position.factories.flat().forEach((c) => { if (c) supply[c]++; });
    let value = boardValue(position.me, a, ending, supply) - boardValue(position.rival, b, ending, supply);
    if (ending && !E.sources(position).length) {
      const rows = E.endBonuses(a.wall).rows - E.endBonuses(b.wall).rows;
      value += Math.sign(value || rows) * 10000;
    } else if (!ending && !position.firstPlayerToken) {
      value += tokenOwner === "me" ? 0.65 : -0.65;
    }
    return perspective === "me" ? value : -value;
  }
  function positionKey(p, turn, owner) {
    const factories = p.factories.map((f) => E.COLORS.map((c) => f.filter((t) => t === c).length).join("")).sort().join(".");
    const boards = [p.me, p.rival].map((b) => b.lines.map((l) => `${l.color ? E.COLORS.indexOf(l.color) : 5}${l.count}`).join("") + b.floor).join("/");
    return `${factories}|${E.COLORS.map((c) => p.center[c]).join(",")}|${boards}|${p.firstPlayerToken ? 1 : 0}${turn}${owner}`;
  }
  function successors(position, turn, owner, perspective) {
    const seen = new Set(), children = [];
    for (const move of E.legalMoves(position, turn)) {
      const applied = E.applyMove(position, move, turn);
      const token = applied.tookMarker ? turn : owner;
      const key = positionKey(applied.state, other(turn), token);
      if (seen.has(key)) continue;
      seen.add(key);
      children.push({ move, position: applied.state, owner: token, key, value: evaluate(applied.state, perspective, token) });
    }
    children.sort((a, b) => turn === perspective ? b.value - a.value : a.value - b.value);
    return children;
  }
  function chooseMove(position, player, level = "medium", options = {}) {
    const rng = options.random || Math.random;
    const owner = options.tokenOwner || player;
    const started = performance.now();
    const roots = successors(position, player, owner, player);
    if (!roots.length) return { move: null, depth: 0, nodes: 0, elapsed: 0 };
    if (level === "easy") {
      // 初级通常选择能放下的砖，偶尔随机，明显区别于更高等级。
      const safe = roots.filter((x) => x.move.row !== null);
      const pool = safe.length ? safe : roots;
      const chosen = rng() < 0.25 ? roots[0] : pool[Math.floor(rng() * pool.length)];
      return { move: chosen.move, depth: 1, nodes: roots.length, elapsed: performance.now() - started };
    }
    if (level !== "hard") return { move: roots[0].move, depth: 1, nodes: roots.length, elapsed: performance.now() - started };

    const deadline = started + (options.timeMs ?? 2600);
    const maxNodes = options.maxNodes ?? 180000;
    const table = new Map();
    const STOP = Symbol("time budget");
    let nodes = 0, depthDone = 1, best = roots[0], solved = false;
    function check() {
      if (nodes >= maxNodes || performance.now() >= deadline) throw STOP;
    }
    function search(p, turn, token, depth, alpha, beta) {
      nodes++;
      if (!(nodes % 32)) check();
      if (!depth || !E.sources(p).length) return evaluate(p, player, token);
      const key = positionKey(p, turn, token);
      const cached = table.get(key);
      const initialAlpha = alpha, initialBeta = beta;
      if (cached && cached.depth >= depth) {
        if (cached.bound === "exact") return cached.value;
        if (cached.bound === "lower") alpha = Math.max(alpha, cached.value);
        else beta = Math.min(beta, cached.value);
        if (alpha >= beta) return cached.value;
      }
      let children = successors(p, turn, token, player);
      check();
      // 轮末逐步枚举全部分支；早期保留高价值候选，保证浏览器内的思考时限。
      if (E.sources(p).length > 6) children = children.slice(0, depth > 3 ? 10 : 14);
      const maximizing = turn === player;
      let value = maximizing ? -Infinity : Infinity;
      for (const child of children) {
        const score = search(child.position, other(turn), child.owner, depth - 1, alpha, beta);
        if (maximizing) { value = Math.max(value, score); alpha = Math.max(alpha, value); }
        else { value = Math.min(value, score); beta = Math.min(beta, value); }
        if (alpha >= beta) break;
      }
      const bound = value <= initialAlpha ? "upper" : value >= initialBeta ? "lower" : "exact";
      table.set(key, { depth, value, bound });
      return value;
    }
    const remaining = E.sources(position).length;
    const maxDepth = remaining <= 6 ? remaining : 7;
    for (let depth = 2; depth <= maxDepth; depth++) {
      let iterationBest = roots[0], iterationValue = -Infinity;
      try {
        roots.sort((a, b) => (b.searchValue ?? b.value) - (a.searchValue ?? a.value));
        for (const child of roots) {
          check();
          const value = search(child.position, other(player), child.owner, depth - 1, iterationValue, Infinity);
          child.searchValue = value;
          if (value > iterationValue) { iterationValue = value; iterationBest = child; }
        }
        best = iterationBest;
        depthDone = depth;
        if (depth >= remaining) { solved = true; break; }
      } catch (error) { if (error !== STOP) throw error; break; }
    }
    return { move: best.move, depth: depthDone, nodes, solved, elapsed: performance.now() - started };
  }
  root.AzulAI = { LEVELS, chooseMove, evaluate };
})(globalThis);
