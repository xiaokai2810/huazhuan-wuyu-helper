import test from "node:test";
import assert from "node:assert/strict";
import "./engine.js";
import "./game-engine.js";
import "./ai.js";
const E = globalThis.AzulEngine, G = globalThis.AzulGame, AI = globalThis.AzulAI;

function conserve(game) {
  assert.deepEqual(G.inventory(game), { blue: 20, yellow: 20, red: 20, black: 20, white: 20 });
}

test("固定种子重现发牌，初始100块花砖守恒", () => {
  const a = G.createGame({ seed: 13 }), b = G.createGame({ seed: 13 });
  assert.deepEqual(a.position.factories, b.position.factories);
  assert.equal(a.bag.length, 80);
  conserve(a);
});

test("非法操作被拒绝且不改变局面", () => {
  const game = G.createGame({ seed: 9 });
  const before = JSON.stringify(game);
  assert.throws(() => G.playMove(game, { kind: "center", index: -1, color: "blue", row: 0 }));
  assert.equal(JSON.stringify(game), before);
});

test("整局完成，含补袋与跨轮图案线，始终保持花砖守恒", () => {
  for (const seed of [8, 32, 91]) {
    const game = G.createGame({ seed, first: "random" });
    let turns = 0;
    while (game.phase !== "finished" && turns++ < 400) {
      if (game.phase === "roundEnd") G.nextRound(game);
      else {
        const result = AI.chooseMove(game.position, game.turn, "medium", { tokenOwner: game.tokenOwner });
        G.playMove(game, result.move);
      }
      conserve(game);
    }
    assert.equal(game.phase, "finished");
    assert.ok(game.round >= 5);
    assert.ok(["me", "rival", "tie"].includes(game.winner));
  }
});

test("先手标记的位置与下轮先手正确交接", () => {
  const game = G.createGame({ seed: 123 });
  const first = E.legalMoves(game.position).find((m) => m.kind === "factory" && game.position.factories[m.index].some((c) => c !== m.color));
  G.playMove(game, first);
  const center = E.legalMoves(game.position, "rival").find((m) => m.kind === "center");
  G.playMove(game, center);
  assert.equal(game.tokenOwner, "rival");
  assert.equal(game.position.firstPlayerToken, false);
  assert.equal(game.markerSlot, 0);
  while (game.phase === "playing") G.playMove(game, AI.chooseMove(game.position, game.turn, "medium").move);
  G.nextRound(game);
  assert.equal(game.turn, "rival");
  assert.equal(game.position.firstPlayerToken, true);
});

test("终局不再发牌，计入终局奖励并按完整横行破同分", () => {
  const game = G.createGame();
  game.position.me.wall[0] = Array(5).fill(true);
  game.position.rival.wall[0] = [true, true, true, true, false];
  game.position.me.score = 8;
  game.position.rival.score = 10;
  G.settleRound(game);
  assert.equal(game.phase, "finished");
  assert.equal(game.position.me.score, 10);
  assert.equal(game.winner, "me");
  assert.throws(() => G.nextRound(game));
});

test("大师轮末搜索与独立完全枚举的最优值一致", () => {
  const p = E.createState();
  p.center.red = 3; p.center.blue = 1;
  p.firstPlayerToken = false;
  p.me.lines[2] = { color: "red", count: 1 };
  p.rival.lines[1] = { color: "blue", count: 1 };
  function solve(position, turn) {
    const moves = E.legalMoves(position, turn);
    if (!moves.length) return AI.evaluate(position, "rival", "me");
    const values = moves.map((m) => solve(E.applyMove(position, m, turn).state, G.other(turn)));
    return turn === "rival" ? Math.max(...values) : Math.min(...values);
  }
  const result = AI.chooseMove(p, "rival", "hard", { tokenOwner: "me", timeMs: 2000 });
  const value = solve(E.applyMove(p, result.move, "rival").state, "me");
  assert.equal(value, solve(p, "rival"));
  assert.equal(result.solved, true);
  assert.equal(result.depth, 2);
});

test("三个等级都只返回合法走法，大师遵守思考预算", () => {
  const game = G.createGame({ seed: 42 });
  for (const level of ["easy", "medium", "hard"]) {
    const result = AI.chooseMove(game.position, "me", level, { timeMs: 100, random: () => 0.5 });
    assert.ok(E.legalMoves(game.position).some((m) => G.sameMove(m, result.move)));
    assert.ok(result.elapsed < 800);
  }
});
