// 同样的时间上限、固定发牌种子、交换算法所在座位，比较巅峰与宗师。
import "./engine.js";
import "./game-engine.js";
import "./search-ai.js";
import "./ai.js";
const G = globalThis.AzulGame, AI = globalThis.AzulAI;
const timeMs = Number(process.env.AI_MS || 150);
const seeds = (process.env.AI_SEEDS || "14,57,208").split(",").map(Number);
const records = [];
for (const seed of seeds) for (const expert of ["me", "rival"]) {
  const game = G.createGame({ seed, first: "me" });
  let moves = 0, expertMs = 0, hardMs = 0, expertMoves = 0, hardMoves = 0;
  while (game.phase !== "finished" && moves++ < 400) {
    if (game.phase === "roundEnd") G.nextRound(game);
    else {
      const advanced = game.turn === expert;
      const result = AI.chooseMove(game.position, game.turn, advanced ? "expert" : "hard", { timeMs, tokenOwner: game.tokenOwner, round: game.round });
      if (advanced) { expertMs += result.elapsed; expertMoves++; } else { hardMs += result.elapsed; hardMoves++; }
      G.playMove(game, result.move);
    }
  }
  if (game.phase !== "finished") throw new Error("Benchmark game did not finish");
  const row = { seed, expertSeat: expert, winner: game.winner === "tie" ? "tie" : game.winner === expert ? "expert" : "hard", expertScore: game.position[expert].score, hardScore: game.position[G.other(expert)].score, rounds: game.round, expertAvgMs: Math.round(expertMs / expertMoves), hardAvgMs: Math.round(hardMs / hardMoves) };
  records.push(row);
  console.log(JSON.stringify(row));
}
console.log(JSON.stringify({ games: records.length, expertWins: records.filter((r) => r.winner === "expert").length, ties: records.filter((r) => r.winner === "tie").length, meanMargin: records.reduce((v, r) => v + r.expertScore - r.hardScore, 0) / records.length, timeMs }));
