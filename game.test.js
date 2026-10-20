import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import "./engine.js";
import "./game-engine.js";
import "./search-ai.js";
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
    if (!moves.length) return globalThis.AzulSearch.evaluate(position, "rival", "me");
    const values = moves.map((m) => solve(E.applyMove(position, m, turn).state, G.other(turn)));
    return turn === "rival" ? Math.max(...values) : Math.min(...values);
  }
  const result = AI.chooseMove(p, "rival", "hard", { tokenOwner: "me", timeMs: 2000 });
  const value = solve(E.applyMove(p, result.move, "rival").state, "me");
  assert.equal(value, solve(p, "rival"));
  assert.equal(result.solved, true);
  assert.equal(result.depth, 2);
});

test("宗师压缩搜索在跨轮局面中保持合法且不改写输入", () => {
  const game = G.createGame({ seed: 16 });
  for (let i = 0; i < 32 && game.phase !== "finished"; i++) {
    if (game.phase === "roundEnd") { G.nextRound(game); continue; }
    if (i % 3 === 0) {
      const before = JSON.stringify(game.position);
      const result = AI.chooseMove(game.position, game.turn, "hard", { timeMs: 30, tokenOwner: game.tokenOwner });
      assert.ok(E.legalMoves(game.position, game.turn).some((m) => G.sameMove(m, result.move)));
      assert.equal(JSON.stringify(game.position), before);
    }
    G.playMove(game, AI.chooseMove(game.position, game.turn, "medium").move);
  }
});

test("宗师对三色轮末局面的完整搜索符合独立枚举", () => {
  const p = E.createState();
  p.center.blue = 2; p.center.red = 3; p.center.yellow = 1;
  p.me.lines[1] = { color: "blue", count: 1 };
  p.rival.lines[2] = { color: "red", count: 2 };
  p.me.floor = 1; p.rival.floor = 2;
  function solve(position, turn, owner) {
    const moves = E.legalMoves(position, turn);
    if (!moves.length) return globalThis.AzulSearch.evaluate(position, "rival", owner);
    const values = moves.map((move) => {
      const applied = E.applyMove(position, move, turn);
      return solve(applied.state, G.other(turn), applied.tookMarker ? turn : owner);
    });
    return turn === "rival" ? Math.max(...values) : Math.min(...values);
  }
  const result = AI.chooseMove(p, "rival", "hard", { timeMs: 2000, tokenOwner: "me" });
  const applied = E.applyMove(p, result.move, "rival");
  const got = solve(applied.state, "me", applied.tookMarker ? "rival" : "me");
  assert.equal(got, solve(p, "rival", "me"));
  assert.equal(result.solved, true);
});

test("压缩计分与原规则的终局胜负、地板和奖励保持一致", () => {
  const p = E.createState();
  p.me.wall[0] = [true, true, false, true, true];
  p.me.lines[0] = { color: "red", count: 1 };
  p.me.score = 12; p.me.floor = 3; p.rival.score = 14;
  assert.equal(globalThis.AzulSearch.evaluate(p, "me", "rival"), AI.evaluate(p, "me", "rival"));
  assert.equal(globalThis.AzulSearch.evaluate(p, "me", "rival"), 10001);
});

test("最后一手同分时，宗师会利用完整横行避免输掉破同分比较", () => {
  const p = E.createState();
  p.center.blue = 1; p.firstPlayerToken = false;
  p.me.wall[0] = Array(5).fill(true); p.me.score = 5;
  p.rival.wall[0] = [false, true, true, true, false];
  p.rival.wall[1][0] = true;
  p.rival.wall[2] = [true, true, false, true, true];
  p.rival.lines[2] = { color: "blue", count: 2 };
  const result = AI.chooseMove(p, "rival", "hard", { timeMs: 500 });
  assert.equal(result.move.row, 2);
  assert.equal(result.solved, true);
});

test("三个等级都只返回合法走法，大师遵守思考预算", () => {
  const game = G.createGame({ seed: 42 });
  for (const level of ["easy", "medium", "hard"]) {
    const result = AI.chooseMove(game.position, "me", level, { timeMs: 100, random: () => 0.5 });
    assert.ok(E.legalMoves(game.position).some((m) => G.sameMove(m, result.move)));
    assert.ok(result.elapsed < 800);
  }
});

test("发布的单文件 Worker 独立运行并返回合法落子", async () => {
  const source = await readFile(new URL("./ai-worker.js", import.meta.url), "utf8");
  const worker = new Worker('const {parentPort}=require("node:worker_threads"); globalThis.self=globalThis; self.postMessage=x=>parentPort.postMessage(x);\n' + source + '\nparentPort.on("message",data=>self.onmessage({data}));', { eval: true });
  try {
    const game = G.createGame({ seed: 45 });
    const response = new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); });
    worker.postMessage({ id: 7, position: game.position, player: "rival", level: "medium", tokenOwner: "me" });
    const data = await response;
    assert.equal(data.id, 7);
    assert.ok(E.legalMoves(game.position, "rival").some((move) => G.sameMove(move, data.result.move)));
  } finally { await worker.terminate(); }
});
