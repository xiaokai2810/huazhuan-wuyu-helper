(function () {
  "use strict";
  const E = rootEngine(), G = globalThis.AzulGame, AI = globalThis.AzulAI;
  const $ = (selector) => document.querySelector(selector);
  const KEY = "azul-match-v1";
  let game = load(), selection = null, busy = false, worker = null, requestId = 0;
  function rootEngine() { return globalThis.AzulEngine; }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved?.version === 1 && saved.position && AI.LEVELS[saved.level] && ["playing", "roundEnd", "finished"].includes(saved.phase)) return saved;
    } catch (_) { /* 无存储权限时仍可对战 */ }
    return null;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(game)); } catch (_) { /* 可继续本局 */ } }
  function esc(text) { return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function tile(color) { return `<span class="tile ${color || "empty"}" aria-hidden="true"></span>`; }
  function myTurn() { return game?.phase === "playing" && game.turn === "me" && !busy; }
  function selected(kind, index, color) { return selection && selection.kind === kind && selection.index === index && selection.color === color; }
  function renderMarket() {
    const p = game.position;
    const factories = p.factories.map((factory, index) => `<div class="game-factory"><span>工厂 ${index + 1}</span><div class="game-factory-tiles">${factory.map((color) => `<button type="button" class="game-tile ${color ? "" : "void"} ${selected("factory", index, color) ? "chosen" : ""}" data-game-source="factory" data-game-index="${index}" data-game-color="${color || ""}" ${!myTurn() || !color ? "disabled" : ""} aria-label="从第${index + 1}工厂选择${color ? E.COLOR_NAMES[color] : "空"}砖">${tile(color)}</button>`).join("")}</div></div>`).join("");
    const center = E.COLORS.map((color) => `<button type="button" class="center-pick ${selected("center", -1, color) ? "chosen" : ""}" data-game-source="center" data-game-index="-1" data-game-color="${color}" ${!myTurn() || !p.center[color] ? "disabled" : ""} aria-label="从中央区选择${E.COLOR_NAMES[color]}砖${p.center[color]}块">${tile(color)}×${p.center[color]}</button>`).join("");
    const instruction = selection ? `已选${selection.kind === "center" ? "中央区" : `工厂${selection.index + 1}`}的 ${selection.count} 块${E.COLOR_NAMES[selection.color]}砖，点击你棋盘左侧的图案线放置。` : myTurn() ? "先点击工厂或中央区的一种颜色，再选图案线。每次会拿走该处全部同色砖。" : "轮到人机取砖，请稍候。";
    return `<section class="panel game-market"><div class="section-heading"><div><span class="section-kicker">公共牌面</span><h2>选砖，然后放入图案线</h2></div><span class="micro-note">袋中 ${game.bag.length} 块 · 弃砖 ${game.discard.length} 块</span></div><div class="game-factories">${factories}</div><div class="game-center"><span class="game-center-title">中央区</span>${center}<span class="token-badge">${p.firstPlayerToken ? "① 先手标记待领取" : `① 下轮${game.tokenOwner === "me" ? "你" : "人机"}先手`}</span></div>${game.phase === "playing" ? `<div class="selection-bar">${instruction}</div>` : ""}</section>`;
  }
  function renderBoard(player) {
    const b = game.position[player];
    const rows = b.lines.map((line, row) => {
      const legal = player === "me" && myTurn() && selection && E.canPlace(b, row, selection.color);
      const target = legal ? E.wallColumn(row, selection.color) : -1;
      const overflow = legal ? Math.max(0, selection.count - (row + 1 - line.count)) : 0;
      const cells = Array.from({ length: row + 1 }, (_, i) => tile(i < line.count ? line.color : null)).join("");
      const inner = `<span class="line-number">${row + 1}</span>${cells}`;
      const left = player === "me" ? `<button type="button" class="battle-line ${legal ? "legal" : ""}" data-game-row="${row}" ${legal ? "" : "disabled"} aria-label="放入第${row + 1}行" title="${legal ? `可放${Math.min(selection.count, row + 1 - line.count)}块，溢出${overflow}块` : "请先选择可放入此行的花砖"}">${inner}</button>` : `<div class="battle-line">${inner}</div>`;
      return `<div class="battle-row">${left}<div class="battle-wall-row">${b.wall[row].map((filled, col) => `<span class="battle-wall-cell ${filled ? "filled" : ""} ${col === target ? "target" : ""}" title="${E.COLOR_NAMES[E.WALL_PATTERN[row][col]]}${filled ? "，已贴" : "，未贴"}">${tile(E.WALL_PATTERN[row][col])}</span>`).join("")}</div></div>`;
    }).join("");
    const floor = game.floorTiles[player].slice();
    if (!game.position.firstPlayerToken && game.tokenOwner === player && game.markerSlot !== null) floor.splice(game.markerSlot, 0, "marker");
    const floorHtml = E.FLOOR_COSTS.map((cost, i) => `<span class="floor-slot">${floor[i] === "marker" ? '<span class="marker-tile">1</span>' : tile(floor[i])}<span>−${cost}</span></span>`).join("");
    return `<section class="panel battle-board ${game.phase === "playing" && game.turn === player ? "active" : ""} ${player === "rival" ? "ai-board" : ""}"><div class="battle-board-header"><div><h3>${player === "me" ? "你的棋盘" : `${AI.LEVELS[game.level].name}对手`}</h3><small>${player === "me" ? "先选砖，再点击左侧图案线" : AI.LEVELS[game.level].description}</small></div><div class="score-badge">${b.score}<span>分</span></div></div><div class="battle-board-legend"><span>图案线</span><span>花砖墙</span></div>${rows}<div class="battle-floor"><span class="floor-name">地板<br>−${E.floorPenalty(b.floor)}分</span>${floorHtml}</div>${player === "me" ? `<button class="floor-drop" type="button" data-game-drop="true" ${myTurn() && selection ? "" : "disabled"}>把这组砖全部放入地板</button>` : ""}</section>`;
  }
  function renderSummary() {
    if (game.phase === "playing") return "";
    const finished = game.phase === "finished";
    const title = finished ? game.winner === "tie" ? "平局，再来一局？" : game.winner === "me" ? "你赢了！" : `${AI.LEVELS[game.level].name}对手获胜` : `第 ${game.round} 轮结算`;
    const summary = ["me", "rival"].map((player) => {
      const s = game.summary[player];
      return `<p>${player === "me" ? "你" : "人机"}：成墙 +${s.wallPoints}，地板 −${s.floorPoints}${finished ? `，终局奖励 +${s.bonus}` : `，实际得分变化 ${s.gain >= 0 ? "+" : ""}${s.gain}`}</p>`;
    }).join("");
    return `<section class="round-summary" aria-live="polite"><h3>${title}</h3>${summary}${finished ? `<p>最终比分：${game.position.me.score} : ${game.position.rival.score}。同分时按完整横行数量比较。</p><button type="button" class="primary-button" data-game-restart="true">再来一局</button>` : `<button type="button" class="primary-button" data-game-next="true">进入第 ${game.round + 1} 轮</button>`}</section>`;
  }
  function render() {
    if (!game) {
      $("#match-content").innerHTML = `<div class="lobby"><div class="lobby-icon">✦</div><h2>你的第一块花砖，会放在哪里？</h2><p>选择人机等级和先手，点击“开始新局”。系统会自动发砖、记录双方分数，并在每轮结束后结算。</p><p>大师是本页最强等级，每手最多思考约 3 秒。</p></div>`;
      return;
    }
    let status = game.phase === "finished" ? "对局已结束" : game.phase === "roundEnd" ? "本轮已完成，查看计分后继续" : game.turn === "me" ? "轮到你了" : `${AI.LEVELS[game.level].name}对手正在思考`;
    $("#match-content").innerHTML = `<div class="match-grid"><div class="match-main"><div class="match-status" aria-live="polite"><div><strong>${busy ? '<span class="thinking-dot"></span>' : ""}${status}</strong><p>${AI.LEVELS[game.level].name} · 双人经典彩色墙 · 当前等级在新局开始时设置</p></div><span class="round-label">第 ${game.round} 轮</span></div>${renderSummary()}${renderMarket()}<div class="battle-boards">${renderBoard("me")}${renderBoard("rival")}</div></div><aside class="match-sidebar"><section class="note-panel quick-rules"><h3>一局怎么玩</h3>① 从一个工厂或中央拿走全部同色砖。<br>② 只能放入一条图案线，多余的进入地板扣分。<br>③ 本轮取完砖后，完整图案线各贴一块到墙上。<br>④ 任一玩家贴满一横行，本轮结算后比较总分。</section><section class="panel match-log"><h3>对局记录</h3><ol>${game.log.length ? game.log.slice(0, 16).map((text) => `<li>${esc(text)}</li>`).join("") : "<li>新对局已就绪，祝你有个好开局。</li>"}</ol></section></aside></div>`;
    if (game.phase === "playing" && game.turn === "rival" && !busy) runAI();
  }
  function cancelAI() {
    requestId++;
    worker?.terminate(); worker = null; busy = false;
  }
  function start() {
    cancelAI();
    const level = document.querySelector('input[name="difficulty"]:checked').value;
    game = G.createGame({ level, first: $("#game-first").value });
    selection = null;
    save(); render();
  }
  function completeAI(id, result) {
    if (id !== requestId || !game || game.turn !== "rival" || game.phase !== "playing") return;
    worker?.terminate(); worker = null; busy = false;
    const legal = E.legalMoves(game.position, "rival");
    const move = legal.find((candidate) => result?.move && G.sameMove(candidate, result.move)) || AI.chooseMove(game.position, "rival", "medium", { tokenOwner: game.tokenOwner }).move;
    G.playMove(game, move);
    save(); render();
  }
  function runAI() {
    busy = true;
    const id = ++requestId;
    // Worker 内只接收公开棋盘，不传牌袋或随机数种子。
    try {
      const inline = document.querySelector("#ai-worker-source");
      if (inline) {
        const url = URL.createObjectURL(new Blob([inline.textContent], { type: "application/javascript" }));
        worker = new Worker(url);
        URL.revokeObjectURL(url);
      } else worker = new Worker("ai-worker.js?v=3");
      worker.onmessage = (event) => {
        if (event.data.error) fallback(id);
        else completeAI(id, event.data.result);
      };
      worker.onerror = () => fallback(id);
      worker.postMessage({ id, position: game.position, player: "rival", level: game.level, tokenOwner: game.tokenOwner });
    } catch (_) { fallback(id); }
    const label = $("#match-content .match-status strong");
    if (label) label.innerHTML = `<span class="thinking-dot"></span>${AI.LEVELS[game.level].name}对手正在思考`;
  }
  function fallback(id) {
    worker?.terminate(); worker = null;
    setTimeout(() => {
      if (id !== requestId || !game) return;
      const result = AI.chooseMove(game.position, "rival", game.level, { tokenOwner: game.tokenOwner, timeMs: 1600 });
      completeAI(id, result);
    }, 30);
  }
  function showMode() {
    const playing = location.hash !== "#helper";
    $("#play-mode").classList.toggle("hidden", !playing);
    $("#helper-mode").classList.toggle("hidden", playing);
    $("#play-tab").setAttribute("aria-selected", String(playing));
    $("#helper-tab").setAttribute("aria-selected", String(!playing));
  }
  $("#play-tab").addEventListener("click", () => { location.hash = "play"; });
  $("#helper-tab").addEventListener("click", () => { location.hash = "helper"; });
  window.addEventListener("hashchange", showMode);
  $("#new-match").addEventListener("click", start);
  $("#match-content").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.dataset.gameRestart) { start(); return; }
    if (button.dataset.gameNext) { G.nextRound(game); selection = null; save(); render(); return; }
    if (!myTurn()) return;
    if (button.dataset.gameSource) {
      const kind = button.dataset.gameSource, index = Number(button.dataset.gameIndex), color = button.dataset.gameColor;
      const count = kind === "center" ? game.position.center[color] : game.position.factories[index].filter((c) => c === color).length;
      selection = { kind, index, color, count }; render(); return;
    }
    if (selection && (button.dataset.gameRow !== undefined || button.dataset.gameDrop)) {
      G.playMove(game, { ...selection, row: button.dataset.gameDrop ? null : Number(button.dataset.gameRow) });
      selection = null; save(); render();
    }
  });
  if (game) document.querySelector(`input[name="difficulty"][value="${game.level}"]`).checked = true;
  showMode(); render();
})();
