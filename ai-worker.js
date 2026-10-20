if (!self.AzulEngine) importScripts("engine.js?v=3", "ai.js?v=3");
self.onmessage = function (event) {
  const { id, position, player, level, tokenOwner } = event.data;
  try {
    const result = self.AzulAI.chooseMove(position, player, level, { tokenOwner });
    self.postMessage({ id, result });
  } catch (_) {
    self.postMessage({ id, error: "计算未完成" });
  }
};
