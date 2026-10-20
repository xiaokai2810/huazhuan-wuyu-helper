// 宗师搜索器：把公开棋盘压缩为数字状态，减少每一层搜索的复制与计分开销。
(function (root) {
  "use strict";
  const E = root.AzulEngine;
  const PENALTY = [0, 1, 2, 4, 6, 8, 11, 14];
  const EMPTY = 40;
  const pop = (n) => { n -= (n >>> 1) & 0x55; n = (n & 0x33) + ((n >>> 2) & 0x33); return (n + (n >>> 4)) & 15; };
  function prepare(position, player, owner, round = 1) {
    const walls = [], scores = [];
    for (const name of ["me", "rival"]) {
      walls.push(position[name].wall.map((row) => row.reduce((bits, filled, col) => bits | (filled ? 1 << col : 0), 0)));
      scores.push(position[name].score);
    }
    const s = {
      factories: position.factories.map((f) => f.reduce((bits, color) => color ? bits + (1 << (E.COLORS.indexOf(color) * 3)) : bits, 0)),
      center: E.COLORS.map((c) => position.center[c]),
      lines: [position.me, position.rival].flatMap((b) => b.lines.map((line) => line.color ? E.COLORS.indexOf(line.color) * 8 + line.count : EMPTY)),
      f0: position.me.floor, f1: position.rival.floor,
      marker: position.firstPlayerToken, owner: owner === "rival" ? 1 : 0,
    };
    return { s, context: { walls, scores, round }, player: player === "rival" ? 1 : 0 };
  }
  function remaining(s) {
    let count = s.center.filter(Boolean).length;
    for (const f of s.factories) for (let c = 0; c < 5; c++) if ((f >>> (c * 3)) & 7) count++;
    return count;
  }
  function key(s, turn) {
    return s.factories.join(".") + "/" + s.center.join(".") + "/" + s.lines.join(".") + "/" + s.f0 + "," + s.f1 + "," + Number(s.marker) + s.owner + turn;
  }
  function moveId(m) { return `${m.source}:${m.color}:${m.row}`; }
  function generate(s, turn, ctx) {
    const result = [], seen = new Set();
    function add(source, color, count) {
      for (let row = 0; row < 5; row++) {
        const line = s.lines[turn * 5 + row], held = line & 7, heldColor = line >>> 3;
        if (held >= row + 1 || (line !== EMPTY && heldColor !== color) || (ctx.walls[turn][row] & (1 << ((color + row) % 5)))) continue;
        result.push({ source, color, row, count });
      }
      result.push({ source, color, row: -1, count });
    }
    for (let i = 0; i < s.factories.length; i++) {
      const packed = s.factories[i];
      if (!packed || seen.has(packed)) continue;
      seen.add(packed);
      for (let c = 0; c < 5; c++) { const count = (packed >>> (c * 3)) & 7; if (count) add(i, c, count); }
    }
    for (let c = 0; c < 5; c++) if (s.center[c]) add(-1, c, s.center[c]);
    return result;
  }
  function apply(s, m, turn) {
    const n = { ...s, center: s.center.slice(), lines: s.lines.slice() };
    let extra = m.count;
    if (m.source < 0) {
      n.center[m.color] = 0;
      if (n.marker) { n.marker = false; n.owner = turn; if (turn) n.f1 = Math.min(7, n.f1 + 1); else n.f0 = Math.min(7, n.f0 + 1); }
    } else {
      n.factories = s.factories.slice();
      const packed = n.factories[m.source];
      n.factories[m.source] = 0;
      for (let c = 0; c < 5; c++) if (c !== m.color) n.center[c] += (packed >>> (c * 3)) & 7;
    }
    if (m.row >= 0) {
      const index = turn * 5 + m.row;
      const count = s.lines[index] & 7;
      const placed = Math.min(m.count, m.row + 1 - count);
      n.lines[index] = m.color * 8 + count + placed;
      extra -= placed;
    }
    if (turn) n.f1 = Math.min(7, n.f1 + extra); else n.f0 = Math.min(7, n.f0 + extra);
    return n;
  }
  function tileScore(w, row, col) {
    let h = 1, v = 1;
    for (let c = col - 1; c >= 0 && (w[row] & (1 << c)); c--) h++;
    for (let c = col + 1; c < 5 && (w[row] & (1 << c)); c++) h++;
    for (let r = row - 1; r >= 0 && (w[r] & (1 << col)); r--) v++;
    for (let r = row + 1; r < 5 && (w[r] & (1 << col)); r++) v++;
    return (h > 1 ? h : 0) + (v > 1 ? v : 0) || 1;
  }
  function project(s, side, ctx) {
    const wall = ctx.walls[side].slice();
    let points = 0;
    for (let r = 0; r < 5; r++) {
      const line = s.lines[side * 5 + r];
      if (line === EMPTY || (line & 7) !== r + 1) continue;
      const col = ((line >>> 3) + r) % 5;
      wall[r] |= 1 << col;
      points += tileScore(wall, r, col);
    }
    return { wall, score: Math.max(0, ctx.scores[side] + points - PENALTY[side ? s.f1 : s.f0]), rows: wall.filter((r) => r === 31).length };
  }
  function bonus(w) {
    let value = w.filter((r) => r === 31).length * 2;
    for (let c = 0; c < 5; c++) if (w.every((row) => row & (1 << c))) value += 7;
    for (let c = 0; c < 5; c++) if (w.every((row, r) => row & (1 << ((c + r) % 5)))) value += 10;
    return value;
  }
  function futureValue(s, side, projection, ctx, supply) {
    const w = projection.wall;
    let value = projection.score + bonus(w) * 0.92;
    // 越接近完整，纵列和同色集合的兑现价值越高；不会把分散的单砖当成奖励。
    for (let c = 0; c < 5; c++) {
      let column = 0, color = 0;
      for (let r = 0; r < 5; r++) {
        if (w[r] & (1 << c)) column++;
        if (w[r] & (1 << ((c + r) % 5))) color++;
      }
      if (column < 5) value += 4.8 * (column / 5) ** 3.4;
      if (color < 5) value += 6.4 * (color / 5) ** 3.4;
    }
    for (let r = 0; r < 5; r++) {
      const line = s.lines[side * 5 + r], count = line & 7, color = line >>> 3;
      if (line !== EMPTY && count < r + 1) {
        const needed = r + 1 - count;
        const feasible = supply[color] >= needed;
        const ratio = count / (r + 1);
        const gain = tileScore(w, r, (color + r) % 5);
        // 余砖不足以补满时，考虑图案线仍会占用下一轮的空间。
        value += ratio * (gain + 0.65) * (feasible ? 0.85 : 0.37);
      }
      value += pop(w[r] & (w[r] >>> 1)) * 0.16;
      if (r < 4) value += pop(w[r] & w[r + 1]) * 0.16;
    }
    return value;
  }
  function evaluateCompact(s, perspective, ctx, isTerminal = false) {
    const a = project(s, 0, ctx), b = project(s, 1, ctx);
    const ending = a.rows || b.rows;
    let value;
    if (ending) {
      value = a.score + bonus(a.wall) - b.score - bonus(b.wall);
      if (isTerminal) value += Math.sign(value || (a.rows - b.rows)) * 10000;
    } else {
      const supply = s.center.slice();
      for (const packed of s.factories) for (let c = 0; c < 5; c++) supply[c] += (packed >>> (c * 3)) & 7;
      value = futureValue(s, 0, a, ctx, supply) - futureValue(s, 1, b, ctx, supply);
      if (!s.marker) value += s.owner ? -0.7 : 0.7;
    }
    return Math.round(value * (perspective ? -100 : 100));
  }
  function evaluate(position, player, owner) {
    const { s, context, player: side } = prepare(position, player, owner);
    return evaluateCompact(s, side, context, !remaining(s)) / 100;
  }
  function publicMove(m) { return { kind: m.source < 0 ? "center" : "factory", index: m.source, color: E.COLORS[m.color], row: m.row < 0 ? null : m.row, count: m.count }; }
  function chooseMove(position, player, options = {}) {
    const start = performance.now();
    const { s, context: ctx, player: side } = prepare(position, player, options.tokenOwner || player, options.round || 1);
    const deadline = start + (options.timeMs ?? 7800), maxNodes = options.maxNodes ?? 3000000;
    const table = new Map(), STOP = Symbol("search budget");
    const count = remaining(s), exactRound = count <= 8;
    let nodes = 0, depthDone = 1, solved = count <= 1, best;
    function check() { if (nodes >= maxNodes || performance.now() >= deadline) throw STOP; }
    function ordered(state, turn, hint) {
      const candidates = generate(state, turn, ctx).map((move) => {
        const child = apply(state, move, turn);
        return { move, child, value: evaluateCompact(child, turn, ctx, !remaining(child)), hint: moveId(move) === hint ? 1 : 0 };
      });
      candidates.sort((a, b) => b.hint - a.hint || b.value - a.value);
      return candidates;
    }
    function search(state, turn, depth, alpha, beta) {
      nodes++;
      if (!(nodes & 63)) check();
      const rest = remaining(state);
      if (!rest || depth <= 0) return evaluateCompact(state, turn, ctx, !rest);
      const hash = key(state, turn), cached = table.get(hash);
      const a0 = alpha, b0 = beta;
      if (cached && cached.depth >= depth) {
        if (cached.flag === 0) return cached.value;
        if (cached.flag === 1) alpha = Math.max(alpha, cached.value); else beta = Math.min(beta, cached.value);
        if (alpha >= beta) return cached.value;
      }
      let children = ordered(state, turn, cached?.move);
      check();
      // 关键的轮末阶段完整展开。早期扩大候选范围，并用晚着缩减把时间留给主变例。
      if (rest > 8) children = children.slice(0, 24);
      let value = -Infinity, chosen = children[0]?.move;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const reduction = !exactRound && rest > 8 && i >= 6 && depth >= 3 ? 1 : 0;
        let result;
        if (!i) result = -search(child.child, 1 - turn, depth - 1, -beta, -alpha);
        else {
          result = -search(child.child, 1 - turn, depth - 1 - reduction, -alpha - 1, -alpha);
          if (result > alpha && (reduction || result < beta)) result = -search(child.child, 1 - turn, depth - 1, -beta, -alpha);
        }
        if (result > value) { value = result; chosen = child.move; }
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      if (table.size < 140000) table.set(hash, { depth, value, move: moveId(chosen), flag: value <= a0 ? 2 : value >= b0 ? 1 : 0 });
      return value;
    }
    let roots = ordered(s, side);
    if (!roots.length) return { move: null, nodes: 0, depth: 0, elapsed: performance.now() - start };
    best = roots[0];
    for (let depth = 2; depth <= (exactRound ? count : 12); depth++) {
      let iteration = best, value = -Infinity;
      try {
        roots.sort((a, b) => Number(b === best) - Number(a === best) || (b.searched ?? b.value) - (a.searched ?? a.value));
        for (let i = 0; i < roots.length; i++) {
          check();
          const child = roots[i];
          let score = i ? -search(child.child, 1 - side, depth - 1, -value - 1, -value) : -search(child.child, 1 - side, depth - 1, -Infinity, Infinity);
          if (i && score > value) score = -search(child.child, 1 - side, depth - 1, -Infinity, -value);
          child.searched = score;
          if (score > value) { value = score; iteration = child; }
        }
        best = iteration; depthDone = depth;
        if (depth >= count) { solved = exactRound; break; }
      } catch (error) { if (error !== STOP) throw error; break; }
    }
    return { move: publicMove(best.move), depth: depthDone, nodes, solved, elapsed: performance.now() - start };
  }
  root.AzulSearch = { chooseMove, evaluate };
})(globalThis);
