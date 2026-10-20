(function () {
  "use strict";
  const E = globalThis.AzulEngine;
  const STORAGE_KEY = "azul-helper-state-v1";
  const $ = (selector) => document.querySelector(selector);
  let state = loadState();
  let selectedColor = "blue";

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && [2, 3, 4].includes(saved.playerCount) && Array.isArray(saved.factories) && saved.factories.length === saved.playerCount * 2 + 1 && saved.me && saved.rival) return saved;
    } catch (_) { /* 浏览器禁用本地存储时仍可使用 */ }
    return E.createState(2);
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* 可继续临时使用 */ }
  }

  function tile(color) {
    return `<span class="tile ${color || "empty"}" aria-hidden="true"></span>`;
  }

  function renderPalette() {
    const buttons = E.COLORS.map((color, index) => `<button type="button" class="palette-button ${selectedColor === color ? "active" : ""}" data-palette="${color}" aria-pressed="${selectedColor === color}">${tile(color)}${E.COLOR_NAMES[color]} <span class="shortcut">${index + 1}</span></button>`);
    buttons.push(`<button type="button" class="palette-button ${selectedColor === null ? "active" : ""}" data-palette="clear" aria-pressed="${selectedColor === null}">${tile(null)}清除 <span class="shortcut">0</span></button>`);
    $("#palette").innerHTML = buttons.join("");
  }

  function renderMarket() {
    $("#factories").innerHTML = state.factories.map((factory, index) => `<div class="factory"><div class="factory-label">${index + 1}</div><div class="factory-tiles">${factory.map((color, slot) => `<button type="button" class="tile-button" data-factory="${index}" data-slot="${slot}" aria-label="第${index + 1}工厂第${slot + 1}格：${color ? E.COLOR_NAMES[color] : "空"}">${tile(color)}</button>`).join("")}</div></div>`).join("");
    $("#center-counts").innerHTML = E.COLORS.map((color) => `<div class="count-pill">${tile(color)}<button type="button" data-center="${color}" data-delta="-1" aria-label="减少${E.COLOR_NAMES[color]}">−</button><strong>${state.center[color] || 0}</strong><button type="button" data-center="${color}" data-delta="1" aria-label="增加${E.COLOR_NAMES[color]}">+</button></div>`).join("");
    $("#marker-toggle").checked = state.firstPlayerToken;
  }

  function renderBoard(player, target) {
    const board = state[player];
    const lines = board.lines.map((line, row) => {
      const cells = Array.from({ length: row + 1 }, (_, index) => `<button type="button" class="line-cell" data-player="${player}" data-row="${row}" data-line-count="${index + 1}" aria-label="第${row + 1}行已放${index + 1}块">${tile(index < line.count ? line.color : null)}</button>`).join("");
      return `<div class="pattern-row"><span class="row-label">${row + 1}</span>${cells}<button type="button" class="line-clear" data-player="${player}" data-clear-row="${row}" aria-label="清空第${row + 1}行">×</button></div>`;
    }).join("");
    const wall = board.wall.map((row, rowIndex) => row.map((filled, col) => `<button type="button" class="wall-button ${filled ? "filled" : ""}" data-player="${player}" data-wall-row="${rowIndex}" data-wall-col="${col}" aria-label="墙第${rowIndex + 1}行第${col + 1}列，${E.COLOR_NAMES[E.WALL_PATTERN[rowIndex][col]]}，${filled ? "已贴" : "未贴"}" aria-pressed="${filled}">${tile(E.WALL_PATTERN[rowIndex][col])}</button>`).join("")).join("");
    $(target).innerHTML = `<div class="board-layout"><div><div class="board-subhead">图案线 · 点击目标格数</div><div class="pattern-lines">${lines}</div></div><div><div class="board-subhead">花砖墙 · 点击已完成格</div><div class="wall-grid">${wall}</div></div></div><div class="floor-control"><span>地板线 <span class="floor-hint">当前扣 ${E.floorPenalty(board.floor)} 分</span></span><span class="floor-adjust"><button type="button" data-player="${player}" data-floor-delta="-1" aria-label="减少地板砖">−</button><strong>${board.floor}</strong><button type="button" data-player="${player}" data-floor-delta="1" aria-label="增加地板砖">+</button></span></div>`;
  }

  function sourceText(move) {
    return move.kind === "factory" ? `第 ${move.index + 1} 工厂` : "中央区";
  }

  function renderAnalysis() {
    const available = E.sources(state);
    if (!available.length) {
      $("#analysis").innerHTML = `<div class="empty-state">先在工厂或中央区录入可拿的花砖。<br>选中颜色后，点击左侧的空格即可。</div>`;
      return;
    }
    const recommendations = E.recommend(state, 5);
    $("#analysis").innerHTML = `<p class="analysis-intro">已比较 ${E.legalMoves(state).length} 种取砖与落点。录入越完整，建议越可靠。</p>` + recommendations.map((item, index) => {
      const move = item.move;
      const destination = move.row === null ? "全放地板" : `放第 ${move.row + 1} 行`;
      const flags = [];
      if (item.overflow) flags.push(`<span class="flag warn">溢出 ${item.overflow} 块</span>`);
      if (item.tookMarker) flags.push(`<span class="flag">取得下轮先手</span>`);
      if (!item.overflow && !item.floorCost) flags.push(`<span class="flag">零新增扣分</span>`);
      const rivalText = item.rivalBest ? `；对手可接着拿${sourceText(item.rivalBest)}的${E.COLOR_NAMES[item.rivalBest.color]}` : "";
      return `<article class="recommendation ${index === 0 ? "best" : ""}"><div class="rec-top"><span class="rec-rank">${index === 0 ? "首选" : `备选 0${index + 1}`}</span><span class="rec-score">评估 ${item.score >= 0 ? "+" : ""}${item.score.toFixed(1)}</span></div><div class="rec-main">${tile(move.color)}${sourceText(move)}拿 ${item.count} 块${E.COLOR_NAMES[move.color]}，${destination}</div><div class="rec-detail">本轮成墙新增 <span class="rec-strong">+${item.wallGain}</span> 分，地板新增 <span class="rec-strong">−${item.floorCost}</span> 分；图案线可放 ${item.placed} 块${rivalText}</div><div class="rec-flags">${flags.join("")}</div></article>`;
    }).join("");
  }

  function render() {
    $("#player-count").value = String(state.playerCount);
    $("#rival-toggle").checked = Boolean(state.useRival);
    $("#rival-section").classList.toggle("hidden", !state.useRival);
    renderPalette();
    renderMarket();
    renderBoard("me", "#my-board");
    renderBoard("rival", "#rival-board");
    renderAnalysis();
  }

  function update() { saveState(); render(); }

  function sampleState() {
    const sample = E.createState(2);
    sample.factories = [
      ["blue", "yellow", "red", "red"],
      ["black", "white", "yellow", "blue"],
      ["blue", "blue", "black", "red"],
      ["yellow", "yellow", "white", "red"],
      ["black", "white", "white", "blue"],
    ];
    sample.center.red = 1;
    sample.center.yellow = 1;
    sample.me.wall[0][0] = true;
    sample.me.wall[1][1] = true;
    sample.me.lines[2] = { color: "red", count: 1 };
    sample.rival.wall[0][1] = true;
    sample.rival.lines[1] = { color: "red", count: 1 };
    return sample;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.palette !== undefined) {
      selectedColor = button.dataset.palette === "clear" ? null : button.dataset.palette;
      renderPalette();
      return;
    }
    if (button.dataset.factory !== undefined) {
      const factory = Number(button.dataset.factory), slot = Number(button.dataset.slot);
      state.factories[factory][slot] = state.factories[factory][slot] === selectedColor ? null : selectedColor;
      update(); return;
    }
    if (button.dataset.center) {
      const color = button.dataset.center;
      state.center[color] = Math.max(0, (state.center[color] || 0) + Number(button.dataset.delta));
      update(); return;
    }
    if (button.dataset.lineCount) {
      const player = button.dataset.player, row = Number(button.dataset.row), count = Number(button.dataset.lineCount);
      state[player].lines[row] = selectedColor ? { color: selectedColor, count } : { color: null, count: 0 };
      update(); return;
    }
    if (button.dataset.clearRow !== undefined) {
      state[button.dataset.player].lines[Number(button.dataset.clearRow)] = { color: null, count: 0 };
      update(); return;
    }
    if (button.dataset.wallRow !== undefined) {
      const row = Number(button.dataset.wallRow), col = Number(button.dataset.wallCol);
      state[button.dataset.player].wall[row][col] = !state[button.dataset.player].wall[row][col];
      update(); return;
    }
    if (button.dataset.floorDelta) {
      const board = state[button.dataset.player];
      board.floor = Math.max(0, Math.min(7, board.floor + Number(button.dataset.floorDelta)));
      update(); return;
    }
  });

  document.addEventListener("contextmenu", (event) => {
    const button = event.target.closest("[data-factory]");
    if (!button) return;
    event.preventDefault();
    state.factories[Number(button.dataset.factory)][Number(button.dataset.slot)] = null;
    update();
  });

  document.addEventListener("keydown", (event) => {
    if (document.querySelector("#helper-mode").classList.contains("hidden")) return;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (event.key >= "1" && event.key <= "5") { selectedColor = E.COLORS[Number(event.key) - 1]; renderPalette(); }
    if (event.key === "0") { selectedColor = null; renderPalette(); }
  });

  $("#player-count").addEventListener("change", (event) => {
    const count = Number(event.target.value);
    state.playerCount = count;
    const needed = count * 2 + 1;
    state.factories = state.factories.slice(0, needed);
    while (state.factories.length < needed) state.factories.push([null, null, null, null]);
    update();
  });
  $("#rival-toggle").addEventListener("change", (event) => { state.useRival = event.target.checked; update(); });
  $("#marker-toggle").addEventListener("change", (event) => { state.firstPlayerToken = event.target.checked; update(); });
  $("#sample").addEventListener("click", () => { state = sampleState(); selectedColor = "blue"; update(); });
  $("#reset").addEventListener("click", () => { state = E.createState(state.playerCount); update(); });
  render();
})();
