// Azul / 花砖物语经典彩色墙规则。纯本地运算，不访问小程序或网络。
(function (root) {
  "use strict";

  const COLORS = ["blue", "yellow", "red", "black", "white"];
  const COLOR_NAMES = { blue: "蓝", yellow: "黄", red: "红", black: "黑", white: "浅蓝" };
  const WALL_PATTERN = [
    ["blue", "yellow", "red", "black", "white"],
    ["white", "blue", "yellow", "red", "black"],
    ["black", "white", "blue", "yellow", "red"],
    ["red", "black", "white", "blue", "yellow"],
    ["yellow", "red", "black", "white", "blue"],
  ];
  const FLOOR_COSTS = [1, 1, 2, 2, 2, 3, 3];

  function createBoard() {
    return {
      wall: Array.from({ length: 5 }, () => Array(5).fill(false)),
      lines: Array.from({ length: 5 }, () => ({ color: null, count: 0 })),
      floor: 0,
      score: 0,
    };
  }

  function createState(playerCount = 2) {
    return {
      playerCount,
      factories: Array.from({ length: playerCount * 2 + 1 }, () => Array(4).fill(null)),
      center: Object.fromEntries(COLORS.map((color) => [color, 0])),
      firstPlayerToken: true,
      useRival: false,
      me: createBoard(),
      rival: createBoard(),
    };
  }

  function cloneState(state) {
    return {
      ...state,
      factories: state.factories.map((factory) => factory.slice()),
      center: { ...state.center },
      me: cloneBoard(state.me),
      rival: cloneBoard(state.rival),
    };
  }

  function cloneBoard(board) {
    return {
      ...board,
      wall: board.wall.map((row) => row.slice()),
      lines: board.lines.map((line) => ({ ...line })),
    };
  }

  function floorPenalty(count) {
    return FLOOR_COSTS.slice(0, Math.min(7, Math.max(0, count))).reduce((a, b) => a + b, 0);
  }

  function wallColumn(row, color) {
    return WALL_PATTERN[row].indexOf(color);
  }

  function canPlace(board, row, color) {
    const line = board.lines[row];
    return !board.wall[row][wallColumn(row, color)] && (!line.color || line.color === color) && line.count < row + 1;
  }

  function sources(state) {
    const result = [];
    for (let index = 0; index < state.factories.length; index += 1) {
      const counts = Object.fromEntries(COLORS.map((color) => [color, 0]));
      for (const color of state.factories[index]) if (color) counts[color] += 1;
      for (const color of COLORS) {
        if (counts[color]) result.push({ kind: "factory", index, color, count: counts[color] });
      }
    }
    for (const color of COLORS) {
      if (state.center[color] > 0) result.push({ kind: "center", index: -1, color, count: state.center[color] });
    }
    return result;
  }

  function legalMoves(state, player = "me") {
    const board = state[player];
    const moves = [];
    for (const source of sources(state)) {
      for (let row = 0; row < 5; row += 1) {
        if (canPlace(board, row, source.color)) moves.push({ ...source, row });
      }
      // 规则允许主动把所拿砖全部放到地板；常见于避免锁死图案线。
      moves.push({ ...source, row: null });
    }
    return moves;
  }

  function applyMove(state, move, player = "me") {
    const next = cloneState(state);
    const board = next[player];
    let count = 0;
    if (move.kind === "factory") {
      const factory = next.factories[move.index];
      for (const color of factory) {
        if (!color) continue;
        if (color === move.color) count += 1;
        else next.center[color] += 1;
      }
      next.factories[move.index] = [null, null, null, null];
    } else {
      count = next.center[move.color];
      next.center[move.color] = 0;
      if (next.firstPlayerToken) {
        board.floor = Math.min(7, board.floor + 1);
        next.firstPlayerToken = false;
      }
    }
    let placed = 0;
    if (move.row !== null) {
      const line = board.lines[move.row];
      placed = Math.min(count, move.row + 1 - line.count);
      line.color = move.color;
      line.count += placed;
    }
    const overflow = count - placed;
    board.floor = Math.min(7, board.floor + overflow);
    return { state: next, count, placed, overflow, tookMarker: move.kind === "center" && state.firstPlayerToken };
  }

  function placementScore(wall, row, col) {
    let horizontal = 1;
    let vertical = 1;
    for (let x = col - 1; x >= 0 && wall[row][x]; x -= 1) horizontal += 1;
    for (let x = col + 1; x < 5 && wall[row][x]; x += 1) horizontal += 1;
    for (let y = row - 1; y >= 0 && wall[y][col]; y -= 1) vertical += 1;
    for (let y = row + 1; y < 5 && wall[y][col]; y += 1) vertical += 1;
    return (horizontal > 1 ? horizontal : 0) + (vertical > 1 ? vertical : 0) || 1;
  }

  function projectBoard(board) {
    const wall = board.wall.map((row) => row.slice());
    let wallPoints = 0;
    const placements = [];
    for (let row = 0; row < 5; row += 1) {
      const line = board.lines[row];
      if (!line.color || line.count !== row + 1) continue;
      const col = wallColumn(row, line.color);
      if (wall[row][col]) continue;
      wall[row][col] = true;
      const points = placementScore(wall, row, col);
      wallPoints += points;
      placements.push({ row, col, color: line.color, points });
    }
    return { wall, wallPoints, floorPoints: floorPenalty(board.floor), net: wallPoints - floorPenalty(board.floor), placements };
  }

  function endBonuses(wall) {
    const rows = wall.filter((row) => row.every(Boolean)).length;
    let columns = 0;
    for (let col = 0; col < 5; col += 1) if (wall.every((row) => row[col])) columns += 1;
    let sets = 0;
    for (const color of COLORS) {
      if (WALL_PATTERN.every((row, rowIndex) => wall[rowIndex][row.indexOf(color)])) sets += 1;
    }
    return { rows, columns, sets, points: rows * 2 + columns * 7 + sets * 10 };
  }

  function potential(board) {
    const projected = projectBoard(board);
    let value = 0;
    for (let row = 0; row < 5; row += 1) {
      const line = board.lines[row];
      if (!line.color || !line.count || line.count === row + 1) continue;
      const col = wallColumn(row, line.color);
      if (projected.wall[row][col]) continue;
      const ratio = line.count / (row + 1);
      const connected = placementScore(projected.wall, row, col);
      value += 0.62 * ratio * Math.min(connected, 5);
    }
    return value;
  }

  function boardValue(board) {
    const projected = projectBoard(board);
    const bonus = endBonuses(projected.wall);
    return projected.net + potential(board) + bonus.points * 0.23;
  }

  function evaluateMove(state, move) {
    const applied = applyMove(state, move);
    const before = projectBoard(state.me);
    const after = projectBoard(applied.state.me);
    const floorCost = after.floorPoints - before.floorPoints;
    const wallGain = after.wallPoints - before.wallPoints;
    let score = boardValue(applied.state.me) - boardValue(state.me);
    let rivalBest = null;
    if (state.useRival) {
      const rivalBaseline = boardValue(state.rival);
      let bestGain = -Infinity;
      for (const reply of legalMoves(applied.state, "rival")) {
        const replyState = applyMove(applied.state, reply, "rival").state;
        const gain = boardValue(replyState.rival) - rivalBaseline;
        if (gain > bestGain) {
          bestGain = gain;
          rivalBest = reply;
        }
      }
      if (Number.isFinite(bestGain)) score -= bestGain * 0.72;
    }
    if (applied.tookMarker && !endBonuses(after.wall).rows) score += 0.55;
    return {
      move,
      score,
      count: applied.count,
      placed: applied.placed,
      overflow: applied.overflow,
      tookMarker: applied.tookMarker,
      wallGain,
      floorCost,
      rivalBest,
      state: applied.state,
    };
  }

  function recommend(state, limit = 5) {
    const moves = legalMoves(state);
    return moves.map((move) => evaluateMove(state, move))
      .sort((a, b) => b.score - a.score || a.overflow - b.overflow || b.wallGain - a.wallGain)
      .slice(0, limit);
  }

  root.AzulEngine = {
    COLORS, COLOR_NAMES, WALL_PATTERN, FLOOR_COSTS,
    createBoard, createState, cloneState, floorPenalty, wallColumn, canPlace,
    sources, legalMoves, applyMove, placementScore, projectBoard,
    endBonuses, potential, boardValue, evaluateMove, recommend,
  };
})(globalThis);

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

// 构建脚本将此处理器与规则、AI代码合并成独立 Worker。
self.onmessage = function (event) {
  const { id, position, player, level, tokenOwner } = event.data;
  try {
    const result = self.AzulAI.chooseMove(position, player, level, { tokenOwner });
    self.postMessage({ id, result });
  } catch (_) {
    self.postMessage({ id, error: "计算未完成" });
  }
};
