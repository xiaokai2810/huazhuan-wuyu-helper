// 固定发牌种子、轮换先手，比较搜索对手与单步对手。可用 AI_MS 调整每手预算。
import "./engine.js";
import "./game-engine.js";
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
      const result = AI.chooseMove(game.position, game.turn, game.turn === "me" ? "hard" : "medium", { timeMs, tokenOwner: game.tokenOwner });
      G.playMove(game, result.move);
    }
  }
  const row = { seed, first, winner: game.winner, master: game.position.me.score, medium: game.position.rival.score, rounds: game.round };
  records.push(row);
  console.log(JSON.stringify(row));
}
console.log(JSON.stringify({ games: records.length, masterWins: records.filter((r) => r.winner === "me").length, ties: records.filter((r) => r.winner === "tie").length, timeMs }));
