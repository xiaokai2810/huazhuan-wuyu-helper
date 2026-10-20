// 固定发牌种子、轮换先手，以相同预算比较新宗师与上一版大师。
import "./engine.js";
import "./game-engine.js";
import "./search-ai.js";
import "./ai.js";
const E = globalThis.AzulEngine, G = globalThis.AzulGame, AI = globalThis.AzulAI;
const timeMs = Number(process.env.AI_MS || 180);
const records = [];
for (const seed of [14, 57, 208]) for (const first of ["me", "rival"]) {
  const game = G.createGame({ seed, first });
  let moves = 0;
  while (game.phase !== "finished" && moves++ < 400) {
    if (game.phase === "roundEnd") G.nextRound(game);
    else {
      const result = game.turn === "me" ? AI.chooseMove(game.position, game.turn, "hard", { timeMs, tokenOwner: game.tokenOwner }) : AI.chooseLegacyMove(game.position, game.turn, "hard", { timeMs, tokenOwner: game.tokenOwner });
      G.playMove(game, result.move);
    }
  }
  const row = { seed, first, winner: game.winner, grandmaster: game.position.me.score, previousMaster: game.position.rival.score, rounds: game.round };
  records.push(row);
  console.log(JSON.stringify(row));
}
console.log(JSON.stringify({ games: records.length, masterWins: records.filter((r) => r.winner === "me").length, ties: records.filter((r) => r.winner === "tie").length, timeMs }));
