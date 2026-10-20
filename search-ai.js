// 宗师 / 巅峰搜索器：压缩公开局面，迭代加深，计算完成即返回。
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
  // 巅峰评估：比较双方对同一来源的需求，识别先取和卡位的机会。
  // 墙面形状、长线占用、整列/同色目标与下一次拿砖的竞争一起估价。
  function strategicValue(s, side, p, ctx, supply, groups) {
    const w = p.wall, cols = [0, 0, 0, 0, 0], colors = [0, 0, 0, 0, 0];
    let value = p.score + bonus(w), opportunities = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (w[r] & (1 << c)) { cols[c]++; colors[(c - r + 5) % 5]++; }
    for (let c = 0; c < 5; c++) {
      if (cols[c] < 5) value += 7 * (cols[c] / 5) ** 2.6;
      if (colors[c] < 5) value += 10 * (colors[c] / 5) ** 2.6;
    }
    for (let r = 0; r < 5; r++) {
      const line = s.lines[side * 5 + r], held = line & 7, color = line >>> 3, capacity = r + 1;
      let bestFuture = 0;
      for (let c = 0; c < 5; c++) {
        const col = (c + r) % 5;
        if (w[r] & (1 << col)) continue;
        const gain = tileScore(w, r, col);
        // 已有墙砖会提高未来贴砖收益；优先保留有连片发展空间的行。
        bestFuture = Math.max(bestFuture, (gain - 1) / Math.sqrt(capacity));
        if (held >= capacity || (line !== EMPTY && color !== c)) continue;
        const need = capacity - held;
        const target = gain + (cols[col] === 4 ? 5.5 : cols[col] * 0.3) + (colors[c] === 4 ? 8 : colors[c] * 0.4);
        if (held) {
          const feasible = supply[c] >= need;
          value += (held / capacity) ** 1.3 * (target + 0.7) * (feasible ? 0.78 : 0.46);
          // 难以补齐的长线将占住整行，减少下一轮可用落点。
          if (!feasible) value -= (1 - held / capacity) * 0.45;
        }
        for (const group of groups[c]) {
          const placed = Math.min(need, group.count), extra = group.count - placed + Number(group.marker);
          const floor = side ? s.f1 : s.f0;
          const cost = Math.min(p.score, PENALTY[Math.min(7, floor + extra)] - PENALTY[floor]);
          const progress = (held + placed) / capacity;
          const before = held ? (held / capacity) ** 1.3 * 0.78 : 0;
          const utility = target * ((progress === 1 ? 1 : progress ** 1.3 * 0.78) - before) - cost;
          opportunities.push({ source: group.source, color: c, utility });
        }
      }
      value += bestFuture * 0.28;
    }
    // 每个来源颜色组只能拿一次；用最有价值的几个机会估计局面机动性。
    opportunities.sort((a, b) => b.utility - a.utility);
    const distinct = [], seen = new Set();
    for (const o of opportunities) {
      const id = o.source * 5 + o.color;
      if (seen.has(id)) continue;
      seen.add(id); distinct.push(o);
      if (distinct.length === 3) break;
    }
    return { value, opportunities: distinct };
  }
  function strategicEvaluation(s, a, b, ctx, supply, turn) {
    const groups = Array.from({ length: 5 }, () => []);
    for (let c = 0; c < 5; c++) {
      if (s.center[c]) groups[c].push({ source: -1, count: s.center[c], marker: s.marker });
      for (let i = 0; i < s.factories.length; i++) {
        const count = (s.factories[i] >>> (c * 3)) & 7;
        if (count) groups[c].push({ source: i, count, marker: false });
      }
    }
    const boards = [strategicValue(s, 0, a, ctx, supply, groups), strategicValue(s, 1, b, ctx, supply, groups)];
    let value = boards[0].value - boards[1].value;
    if (turn !== undefined) {
      const active = boards[turn].opportunities, passive = boards[1 - turn].opportunities;
      let initiative = (active[0]?.utility || 0) * 0.22 - (passive[0]?.utility || 0) * 0.14;
      // 对手最需要的组若同时也是自己的好落点，先取会直接切断其补线机会。
      if (active[0] && passive[0] && active[0].source === passive[0].source && active[0].color === passive[0].color) {
        initiative += Math.min(Math.max(0, active[0].utility), Math.max(0, passive[0].utility)) * 0.16;
      }
      value += turn ? -initiative : initiative;
    }
    if (!s.marker) value += s.owner ? -0.9 : 0.9;
    return value;
  }
  function evaluateCompact(s, perspective, ctx, isTerminal = false, turn) {
    const a = project(s, 0, ctx), b = project(s, 1, ctx);
    const ending = a.rows || b.rows;
    let value;
    if (ending) {
      value = a.score + bonus(a.wall) - b.score - bonus(b.wall);
      if (isTerminal) value += Math.sign(value || (a.rows - b.rows)) * 10000;
    } else {
      const supply = s.center.slice();
      for (const packed of s.factories) for (let c = 0; c < 5; c++) supply[c] += (packed >>> (c * 3)) & 7;
      if (ctx.strategic) value = strategicEvaluation(s, a, b, ctx, supply, turn);
      else {
        value = futureValue(s, 0, a, ctx, supply) - futureValue(s, 1, b, ctx, supply);
        if (!s.marker) value += s.owner ? -0.7 : 0.7;
      }
    }
    return Math.round(value * (perspective ? -100 : 100));
  }
  function evaluate(position, player, owner, options = {}) {
    const { s, context, player: side } = prepare(position, player, owner);
    context.strategic = options.strategic;
    return evaluateCompact(s, side, context, !remaining(s), options.turn === "me" ? 0 : options.turn === "rival" ? 1 : undefined) / 100;
  }
  function publicMove(m) { return { kind: m.source < 0 ? "center" : "factory", index: m.source, color: E.COLORS[m.color], row: m.row < 0 ? null : m.row, count: m.count }; }
  function chooseMove(position, player, options = {}) {
    const start = performance.now();
    const { s, context: ctx, player: side } = prepare(position, player, options.tokenOwner || player, options.round || 1);
    ctx.strategic = Boolean(options.strategic);
    const deadline = start + (options.timeMs ?? (ctx.strategic ? 1500 : 900)), maxNodes = options.maxNodes ?? 500000;
    const table = new Map(), STOP = Symbol("search budget");
    const count = remaining(s), exactRound = count <= 8;
    let nodes = 0, depthDone = 1, solved = count <= 1, best;
    function check() { if (nodes >= maxNodes || performance.now() >= deadline) throw STOP; }
    function ordered(state, turn, hint) {
      const candidates = generate(state, turn, ctx).map((move) => {
        const child = apply(state, move, turn);
        return { move, child, value: evaluateCompact(child, turn, ctx, !remaining(child), 1 - turn), hint: moveId(move) === hint ? 1 : 0 };
      });
      candidates.sort((a, b) => b.hint - a.hint || b.value - a.value);
      return candidates;
    }
    function search(state, turn, depth, alpha, beta) {
      nodes++;
      if (!(nodes & 63)) check();
      const rest = remaining(state);
      if (!rest || (depth <= 0 && !(ctx.strategic && rest <= 3))) return evaluateCompact(state, turn, ctx, !rest, turn);
      if (depth <= 0) depth = rest;
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
      if (rest > 8) children = children.slice(0, ctx.strategic ? 36 : 24);
      let value = -Infinity, chosen = children[0]?.move;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const finishes = child.move.row >= 0 && ((child.child.lines[turn * 5 + child.move.row] & 7) === child.move.row + 1);
        const reduction = !exactRound && rest > 8 && i >= (ctx.strategic ? 10 : 6) && depth >= 3 && !(ctx.strategic && finishes) ? 1 : 0;
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
