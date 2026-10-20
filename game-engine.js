(function (root) {
  "use strict";
  const E = root.AzulEngine;
  const other = (player) => player === "me" ? "rival" : "me";
  function remainingTime(game, now = Date.now()) {
    if (game.phase !== "playing") return 0;
    const duration = (game.turnSeconds === 60 ? 60 : 90) * 1000;
    return Math.max(0, Number.isFinite(game.turnDeadline) ? game.turnDeadline - now : game.turnRemainingMs ?? duration);
  }
  function restartClock(game, now = Date.now()) {
    game.turnRemainingMs = null;
    game.turnDeadline = game.phase === "playing" ? now + (game.turnSeconds === 60 ? 60 : 90) * 1000 : null;
  }
  function pauseClock(game, now = Date.now()) {
    game.turnRemainingMs = game.phase === "playing" ? remainingTime(game, now) : null;
    game.turnDeadline = null;
  }
  function resumeClock(game, now = Date.now()) {
    if (game.phase !== "playing" || Number.isFinite(game.turnDeadline)) return;
    game.turnSeconds = game.turnSeconds === 60 ? 60 : 90;
    game.turnDeadline = now + remainingTime(game, now);
    game.turnRemainingMs = null;
  }
  function random(game) {
    game.rng = (game.rng + 0x6D2B79F5) >>> 0;
    let n = game.rng;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(game, tiles) {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(random(game) * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    return tiles;
  }
  function refill(game) {
    game.position.factories = Array.from({ length: 5 }, () => {
      const tiles = [];
      for (let i = 0; i < 4; i++) {
        if (!game.bag.length) game.bag = shuffle(game, game.discard.splice(0));
        tiles.push(game.bag.pop() || null);
      }
      return tiles;
    });
    game.position.firstPlayerToken = true;
    game.turn = game.tokenOwner;
    game.phase = "playing";
    restartClock(game);
  }
  function createGame({ level = "medium", first = "me", seed = Date.now(), turnSeconds = 90 } = {}) {
    const game = {
      version: 1, position: E.createState(2), bag: [], discard: [],
      floorTiles: { me: [], rival: [] }, rng: seed >>> 0, round: 1,
      phase: "playing", turn: first, tokenOwner: first,
      level, log: [], summary: null, winner: null, markerSlot: null,
      turnSeconds: turnSeconds === 60 ? 60 : 90, turnDeadline: null, turnRemainingMs: null,
    };
    game.bag = shuffle(game, E.COLORS.flatMap((color) => Array(20).fill(color)));
    if (first === "random") game.turn = game.tokenOwner = random(game) < 0.5 ? "me" : "rival";
    refill(game);
    return game;
  }
  function sameMove(a, b) {
    return a.kind === b.kind && a.index === b.index && a.color === b.color && a.row === b.row;
  }
  function describeMove(move) {
    return `${move.kind === "center" ? "中央区" : `第${move.index + 1}工厂`}取${move.count}块${E.COLOR_NAMES[move.color]}，${move.row === null ? "放入地板" : `放第${move.row + 1}行`}`;
  }
  function addLog(game, text) {
    game.log.unshift(text);
    game.log = game.log.slice(0, 40);
  }
  function roundScore(board) {
    const projection = E.projectBoard(board);
    const total = Math.max(0, board.score + projection.net);
    return { ...projection, before: board.score, total, gain: total - board.score };
  }
  function settleRound(game) {
    if (game.phase !== "playing") return game.summary;
    const summary = {};
    for (const player of ["me", "rival"]) {
      const board = game.position[player];
      const projection = roundScore(board);
      const before = board.score;
      board.wall = projection.wall;
      board.score = projection.total;
      board.lines.forEach((line, row) => {
        if (line.count !== row + 1) return;
        game.discard.push(...Array(row).fill(line.color));
        board.lines[row] = { color: null, count: 0 };
      });
      game.discard.push(...game.floorTiles[player]);
      game.floorTiles[player] = [];
      board.floor = 0;
      summary[player] = { before, total: board.score, wallPoints: projection.wallPoints, floorPoints: projection.floorPoints, gain: board.score - before, bonus: 0, placements: projection.placements };
    }
    const bonuses = { me: E.endBonuses(game.position.me.wall), rival: E.endBonuses(game.position.rival.wall) };
    game.summary = summary;
    game.markerSlot = null;
    game.turnDeadline = null;
    game.turnRemainingMs = null;
    if (bonuses.me.rows || bonuses.rival.rows) {
      for (const player of ["me", "rival"]) {
        summary[player].bonus = bonuses[player].points;
        game.position[player].score += bonuses[player].points;
        summary[player].total = game.position[player].score;
      }
      const diff = game.position.me.score - game.position.rival.score;
      const rowDiff = bonuses.me.rows - bonuses.rival.rows;
      game.winner = diff ? (diff > 0 ? "me" : "rival") : rowDiff ? (rowDiff > 0 ? "me" : "rival") : "tie";
      game.phase = "finished";
      addLog(game, `对局结束：你 ${summary.me.total} 分，人机 ${summary.rival.total} 分，已计入横行、纵列与同色奖励。`);
    } else {
      game.phase = "roundEnd";
      addLog(game, `第${game.round}轮结算：你 ${beforeAfter(summary.me)}；人机 ${beforeAfter(summary.rival)}。`);
    }
    return summary;
  }
  function beforeAfter(score) { return `${score.before} → ${score.total} 分（贴墙 +${score.wallPoints}，地板 −${score.floorPoints}）`; }
  function playMove(game, move) {
    if (game.phase !== "playing") throw new Error("本轮已结束");
    const legal = E.legalMoves(game.position, game.turn).find((candidate) => sameMove(candidate, move));
    if (!legal) throw new Error("这一步不符合规则");
    const player = game.turn;
    const markerSlot = game.position[player].floor;
    const result = E.applyMove(game.position, legal, player);
    game.position = result.state;
    if (result.tookMarker) { game.tokenOwner = player; game.markerSlot = markerSlot; }
    game.floorTiles[player].push(...Array(result.overflow).fill(legal.color));
    addLog(game, `${player === "me" ? "你" : "人机"}从${describeMove(legal)}${result.tookMarker ? "，取得先手" : ""}。`);
    game.turn = other(player);
    if (!E.sources(game.position).length) settleRound(game);
    else restartClock(game);
    return game;
  }
  function nextRound(game) {
    if (game.phase !== "roundEnd") throw new Error("当前不能进入下一轮");
    game.round++;
    game.summary = null;
    refill(game);
    return game;
  }
  function inventory(game) {
    const counts = Object.fromEntries(E.COLORS.map((color) => [color, 0]));
    const add = (color, count = 1) => { if (color) counts[color] += count; };
    game.bag.forEach((c) => add(c)); game.discard.forEach((c) => add(c));
    game.position.factories.flat().forEach((c) => add(c));
    E.COLORS.forEach((c) => add(c, game.position.center[c]));
    for (const player of ["me", "rival"]) {
      game.floorTiles[player].forEach((c) => add(c));
      game.position[player].lines.forEach((line) => add(line.color, line.count));
      game.position[player].wall.forEach((row, r) => row.forEach((filled, c) => { if (filled) add(E.WALL_PATTERN[r][c]); }));
    }
    return counts;
  }
  root.AzulGame = { createGame, playMove, nextRound, settleRound, roundScore, inventory, describeMove, sameMove, other, remainingTime, restartClock, pauseClock, resumeClock };
})(globalThis);
