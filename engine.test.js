import test from "node:test";
import assert from "node:assert/strict";
import "./engine.js";

const E = globalThis.AzulEngine;

test("工厂取走同色砖，其他颜色进入中央区", () => {
  const state = E.createState();
  state.factories[0] = ["blue", "red", "blue", "yellow"];
  const result = E.applyMove(state, { kind: "factory", index: 0, color: "blue", row: 1 });
  assert.equal(result.count, 2);
  assert.equal(result.placed, 2);
  assert.equal(result.overflow, 0);
  assert.deepEqual(result.state.factories[0], [null, null, null, null]);
  assert.equal(result.state.center.red, 1);
  assert.equal(result.state.center.yellow, 1);
  assert.equal(state.center.red, 0, "原始局面保持不变");
});

test("首次从中央取砖会占用地板格，溢出按阶梯扣分", () => {
  const state = E.createState();
  state.center.blue = 4;
  const result = E.applyMove(state, { kind: "center", index: -1, color: "blue", row: 1 });
  assert.equal(result.tookMarker, true);
  assert.equal(result.placed, 2);
  assert.equal(result.overflow, 2);
  assert.equal(result.state.me.floor, 3);
  assert.equal(E.floorPenalty(result.state.me.floor), 4);
  assert.equal(result.state.firstPlayerToken, false);
});

test("横竖相连分别计分，新砖同时计入两个方向", () => {
  const board = E.createBoard();
  board.wall[2][1] = true;
  board.wall[2][3] = true;
  board.wall[1][2] = true;
  board.wall[3][2] = true;
  board.lines[2] = { color: "blue", count: 3 };
  const projected = E.projectBoard(board);
  assert.equal(projected.wallPoints, 6);
  assert.equal(projected.placements[0].points, 6);
});

test("墙上已有同色时，不再允许填对应图案线", () => {
  const state = E.createState();
  state.factories[0] = ["blue", null, null, null];
  state.me.wall[0][0] = true;
  const moves = E.legalMoves(state);
  assert.equal(moves.some((move) => move.color === "blue" && move.row === 0), false);
  assert.equal(moves.some((move) => move.color === "blue" && move.row === 1), true);
});

test("满墙终局加分为 95 分", () => {
  const wall = Array.from({ length: 5 }, () => Array(5).fill(true));
  assert.deepEqual(E.endBonuses(wall), { rows: 5, columns: 5, sets: 5, points: 95 });
});

test("简单开局优先无溢出地完成短线", () => {
  const state = E.createState();
  state.factories[0] = ["red", null, null, null];
  const best = E.recommend(state, 1)[0];
  assert.equal(best.move.row, 0);
  assert.equal(best.overflow, 0);
  assert.equal(best.wallGain, 1);
});
