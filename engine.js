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
