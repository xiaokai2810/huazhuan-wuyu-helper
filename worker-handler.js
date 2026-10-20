// 构建脚本将此处理器与规则、AI代码合并成独立 Worker。
self.onmessage = function (event) {
  const { id, position, player, level, tokenOwner, round } = event.data;
  try {
    const result = self.AzulAI.chooseMove(position, player, level, { tokenOwner, round });
    self.postMessage({ id, result });
  } catch (_) {
    self.postMessage({ id, error: "计算未完成" });
  }
};
