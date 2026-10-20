(function () {
  "use strict";
  const E = globalThis.AzulEngine, G = globalThis.AzulGame, AI = globalThis.AzulAI;
  const $ = (selector) => document.querySelector(selector);
  const KEY = "azul-match-v1";
  let game = load(), selection = null, pendingRow, overlay = null;
  let busy = false, worker = null, requestId = 0, watchdog = null, ticker = null, fallbackPending = false;
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved?.version === 1 && saved.position && AI.LEVELS[saved.level] && ["playing", "roundEnd", "finished"].includes(saved.phase)) return saved;
    } catch (_) { /* 浏览器禁止存储时仍可对战 */ }
    return null;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(game)); } catch (_) { /* 继续本局 */ } }
  function esc(text) { return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function tile(color, ghost = false) { return globalThis.AzulArt.render(color, ghost); }
  function localDuel() { return game?.opponent === "local"; }
  function humanPlayer() { return localDuel() ? game.turn : "me"; }
  function playerName(player) { return localDuel() ? G.playerName(game, player) : player === "me" ? "你" : AI.LEVELS[game.level].name; }
  function matchLabel() { return game.mode === "race" ? "双人满墙竞速" : `${AI.LEVELS[game.level].name} · 经典人机`; }
  function myTurn() { return game?.phase === "playing" && (localDuel() || game.turn === "me") && !busy; }
  function isSelected(kind, index, color) { return selection && selection.kind === kind && selection.index === index && selection.color === color; }
  function preview() {
    if (!selection || pendingRow === undefined) return null;
    const player = humanPlayer();
    const applied = E.applyMove(game.position, { ...selection, row: pendingRow }, player);
    const before = E.projectBoard(game.position[player]), after = E.projectBoard(applied.state[player]);
    return { ...applied, wallGain: after.wallPoints - before.wallPoints, cost: after.floorPoints - before.floorPoints };
  }
  function renderMarket() {
    const p = game.position;
    const factories = p.factories.map((factory, index) => `<div class="game-factory ${selection?.kind === "factory" && selection.index === index ? "plate-selected" : ""}">${globalThis.AzulArt.plate()}<span class="factory-index">${index + 1}</span><div class="game-factory-tiles">${factory.map((color) => `<button type="button" class="game-tile ${color ? "" : "void"} ${isSelected("factory", index, color) ? "chosen" : ""}" data-game-source="factory" data-game-index="${index}" data-game-color="${color || ""}" ${!myTurn() || !color ? "disabled" : ""} aria-label="从第${index + 1}工厂选择${color ? E.COLOR_NAMES[color] : "空"}砖">${tile(color)}</button>`).join("")}</div></div>`).join("");
    const center = E.COLORS.filter(color => p.center[color] > 0).map((color) => `<button type="button" class="center-pick ${isSelected("center", -1, color) ? "chosen" : ""}" data-game-source="center" data-game-index="-1" data-game-color="${color}" ${!myTurn() ? "disabled" : ""} aria-label="从中央区选择${E.COLOR_NAMES[color]}砖${p.center[color]}块">${tile(color)}<span class="count-prefix">×</span><b>${p.center[color]}</b></button>`).join("");
    return `<section class="game-market" aria-label="公共牌面">
      <div class="market-heading"><span>公共区</span><small>袋 ${game.bag.length} · 弃 ${game.discard.length} · ${p.firstPlayerToken ? "① 先取者获下轮先手" : `① 下轮${playerName(game.tokenOwner)}先手`}</small></div>
      <div class="market-time-gauge" aria-hidden="true"><span class="market-time-track"><i class="market-time-fill" style="height:0%"></i></span><b class="market-clock">${Math.ceil(G.remainingTime(game) / 1000)}</b><small>秒</small></div>
      <div class="game-factories">${factories}</div>
      <div class="pool-sidebar"><div class="game-center"><div class="center-heading"><span>公共牌堆</span></div><div class="center-colors">${center || '<p class="center-empty">圆盘余砖<br>会移到这里</p>'}</div></div><div class="pool-selection"><span>已选砖块</span><div>${selection ? `${tile(selection.color)}<b>×${selection.count}</b>` : '<small>等待选砖</small>'}</div></div></div>
      <div class="latest-move"><span>上一步</span>${esc(game.log[0] || "从一个圆盘或公共牌堆选择同色花砖。")}</div>
    </section>`;
  }
  function renderBoard(player) {
    const b = game.position[player], mine = player === "me", editable = humanPlayer() === player;
    const plan = editable ? preview() : null;
    const tally = G.roundScore(b);
    const rows = b.lines.map((line, row) => {
      const legal = editable && myTurn() && selection && E.canPlace(b, row, selection.color);
      const planned = legal && pendingRow === row;
      const fit = legal ? Math.min(selection.count, row + 1 - line.count) : 0;
      const target = legal ? E.wallColumn(row, selection.color) : -1;
      const cells = Array.from({ length: row + 1 }, (_, i) => tile(i < line.count ? line.color : planned && i < line.count + fit ? selection.color : null, planned && i >= line.count && i < line.count + fit)).join("");
      const inner = `<span class="line-number">${row + 1}</span><span class="line-cells">${cells}</span><span class="row-hint">${legal ? (planned ? "✓" : `+${fit}`) : line.count === row + 1 ? "✓" : "▸"}</span>`;
      const left = editable ? `<button type="button" class="battle-line ${legal ? "legal" : ""} ${planned ? "planned" : ""}" data-game-row="${row}" ${legal ? "" : "disabled"} aria-label="放入第${row + 1}行" aria-pressed="${Boolean(planned)}">${inner}</button>` : `<div class="battle-line">${inner}</div>`;
      const last = game.lastMove?.player === player && game.lastMove.row === row && game.phase === "playing";
      return `<div class="battle-row ${last ? "last-placement" : ""}">${left}<div class="battle-wall-row">${b.wall[row].map((filled, col) => `<span class="battle-wall-cell ${filled ? "filled" : ""} ${!filled && line.count === row + 1 && E.wallColumn(row, line.color) === col ? "pending-wall" : ""} ${col === target ? "target" : ""} ${planned && col === target ? "planned-target" : ""}" title="${E.COLOR_NAMES[E.WALL_PATTERN[row][col]]}${filled ? "，已贴" : "，未贴"}">${tile(E.WALL_PATTERN[row][col])}</span>`).join("")}</div></div>`;
    }).join("");
    const floor = game.floorTiles[player].slice();
    if (!game.position.firstPlayerToken && game.tokenOwner === player && game.markerSlot !== null) floor.splice(game.markerSlot, 0, "marker");
    const oldCount = b.floor;
    if (plan) { if (plan.tookMarker) floor.splice(oldCount, 0, "marker"); floor.push(...Array(plan.overflow).fill(selection.color)); }
    const floorHtml = E.FLOOR_COSTS.map((cost, i) => `<span class="floor-slot ${plan && i >= oldCount && floor[i] ? "floor-preview" : ""}">${floor[i] === "marker" ? '<span class="marker-tile">1</span>' : tile(floor[i], Boolean(plan && i >= oldCount && floor[i]))}<small>−${cost}</small></span>`).join("");
    const gain = game.phase === "playing" ? tally.gain : (game.summary?.[player]?.gain || 0) + (game.summary?.[player]?.bonus || 0);
    const floorSlots = `<div class="floor-slots">${floorHtml}</div>`;
    const floorZone = editable ? `<button class="floor-zone ${pendingRow === null ? "planned" : ""}" type="button" data-game-drop="true" ${myTurn() && selection ? "" : "disabled"} aria-label="全部放入地板" title="将所选花砖全部放入地板，当前扣 ${E.floorPenalty(b.floor)} 分">${floorSlots}</button>` : `<div class="floor-zone" aria-label="对手地板线，当前扣 ${E.floorPenalty(b.floor)} 分">${floorSlots}</div>`;
    return `<section class="battle-board ${mine ? "my-board" : "ai-board"} ${game.phase === "playing" && game.turn === player ? "active" : ""}" aria-label="${localDuel() ? `${playerName(player)}的棋盘` : mine ? "你的棋盘" : "对手棋盘"}">
      <div class="battle-board-header"><div><i class="board-avatar">${globalThis.AzulArt.avatar(player)}</i><h3>${playerName(player)}</h3></div><span class="board-round">贴墙 +${tally.wallPoints} · 地板 −${tally.floorPoints}</span></div>
      <div class="board-body"><div class="battle-board-legend"><span>图案线</span><span>花砖墙</span></div>${rows}<div class="battle-floor">${floorZone}<div class="board-score ${game.mode === "race" ? "race-progress" : ""}" aria-label="${playerName(player)}${game.mode === "race" ? `已完成 ${G.wallCount(b)} / 25 格` : `已结算 ${b.score} 分，本轮 ${signed(gain)}`} ${game.mode === "race" ? `，待贴 ${tally.placements.length} 格` : ""}"><span>${game.mode === "race" ? "▦" : "★"}</span><strong data-board-score-total="${player}">${game.mode === "race" ? `${G.wallCount(b)}<em>/25</em>` : b.score}</strong><small>${game.mode === "race" ? `待贴 ${tally.placements.length} 格` : `${game.phase === "playing" ? "待" : "本轮"}${signed(gain)}`}</small></div></div></div>
    </section>`;
  }
  function renderDock() {
    if (game.phase !== "playing") return "";
    if (!myTurn()) return `<div class="action-dock ai-thinking"><div class="dock-symbol"><span class="thinking-dot"></span></div><div class="dock-copy"><b>${AI.LEVELS[game.level].name}正在推演局面</b><span class="ai-clock">观察相邻、卡位与轮末余砖…</span></div><div class="thinking-bars"><i></i><i></i><i></i></div></div>`;
    if (!selection) return `<div class="action-dock"><div class="dock-symbol">✦</div><div class="dock-copy"><b>${localDuel() ? `${playerName(game.turn)} 回合，先选一组花砖` : "轮到你了，先选一组花砖"}</b><span>点击公共圆盘或中央区的任一颜色</span></div><span class="dock-step">01 / 选砖</span></div>`;
    const plan = preview();
    return `<div class="action-dock has-selection"><div class="dock-picked">${tile(selection.color)}<b>×${selection.count}</b></div><div class="dock-copy"><b>${pendingRow === undefined ? "选择一条高亮图案线" : pendingRow === null ? "全部放入地板" : `放入第 ${pendingRow + 1} 行`}</b><span>${plan ? `贴墙 +${plan.wallGain} · 地板 −${plan.cost}${plan.overflow ? ` · 溢出 ${plan.overflow} 块` : ""}` : "选好落点后，再确认落砖"}</span></div><button class="dock-cancel" type="button" data-game-cancel="true" aria-label="取消选择">×</button><button class="primary-button confirm-move" type="button" data-game-confirm="true" ${pendingRow === undefined ? "disabled" : ""}>确认落砖 <span>→</span></button></div>`;
  }
  function renderResults() {
    if (game.phase === "playing") return "";
    const finished = game.phase === "finished", race = game.mode === "race";
    const title = finished ? race ? game.winner === "tie" ? "双方完成满墙" : `${playerName(game.winner)}先铺满了整面墙` : game.winner === "tie" ? "平分秋色" : game.winner === "me" ? "这一局，你更胜一筹" : "好对手，值得再来一局" : `第 ${game.round} 轮 · 贴墙结算`;
    const scores = ["me", "rival"].map(p => `<div><span>${playerName(p)}</span><b>${race ? `${G.wallCount(game.position[p])}<small>/25</small>` : game.position[p].score}</b></div>`).join('<i>:</i>');
    const breakdown = ["me", "rival"].map(p => {
      const t = game.summary[p];
      return race ? `<div class="settled-player"><p><b>${playerName(p)}</b><strong>已铺满 ${G.wallCount(game.position[p])} 格</strong><em>本轮贴墙 ${t.placements?.length || 0} 格</em></p></div>` : `<div class="settled-player"><p><b>${playerName(p)}</b><strong>${t.before ?? game.position[p].score - t.gain - t.bonus} → ${game.position[p].score} 分</strong><em>本轮 ${signed(t.gain + t.bonus)}</em></p><p class="settled-detail"><span>贴墙 +${t.wallPoints}</span><span>地板 −${t.floorPoints}</span>${finished ? `<span>奖励 +${t.bonus}</span>` : ""}</p></div>`;
    }).join("");
    return `<div class="results-scrim"><section class="round-summary" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-emblem">${finished ? "✦" : "◇"}</div><span class="section-kicker">${race ? "满墙竞速" : finished ? "GAME COMPLETE" : "ROUND COMPLETE"}</span><h3 id="result-title">${title}</h3><div class="result-scores">${scores}</div><div class="result-breakdown">${breakdown}</div><p class="scoring-note">${race ? "不限轮次，先完成整面 25 格花砖墙者获胜，积分不影响胜负。" : "双方同时结算；未满的图案线留到下轮，总分最低为 0。"}</p>${finished ? `<button type="button" class="primary-button" data-game-restart="true">${race ? "同玩法再来一局" : "同一强度，再来一局"} ↗</button>` : `<button type="button" class="primary-button" data-game-next="true">进入第 ${game.round + 1} 轮 →</button>`}<button class="result-back" type="button" data-game-home="true">返回大厅</button></section></div>`;
  }
  function renderDrawer() {
    if (!overlay) return "";
    return `<div class="drawer-scrim"><section class="table-drawer" role="dialog" aria-modal="true" aria-label="${overlay === "log" ? "对局记录" : "玩法规则"}"><div class="drawer-heading"><h3>${overlay === "log" ? "对局记录" : "玩法规则"}</h3><button type="button" data-game-close="true" aria-label="关闭面板">×</button></div>${overlay === "log" ? `<ol class="match-history">${game.log.length ? game.log.map((line) => `<li>${esc(line)}</li>`).join("") : "<li>新对局已经准备好。</li>"}</ol>` : `<div class="quick-rules">${game.mode === "race" ? "<h4>双人满墙竞速</h4><p>同一部手机，两人轮流操作。先填满整面 25 格花砖墙者获胜，不限轮次。最后所需图案线完成时立即贴墙判胜，不必等公共池取完。</p>" : ""}<h4>01 选砖</h4><p>从一个圆盘或中央区，拿走全部同色花砖。取走圆盘里的一种颜色后，剩余花砖进入中央区。</p><h4>02 落砖</h4><p>一组砖只能放入一条图案线。图案线只收同色砖；对应墙行已有该颜色时不能再放。多余的砖进入地板扣分。</p><h4>03 贴墙</h4><p>双方在公共花砖取完后同时结算。完整图案线各贴一块到墙上，横、竖相连分别得分，再扣除地板分。总分最低为 0。不完整的图案线留到下一轮，不立即得分。棋盘底部“待”为本轮尚未入账的净分；竞速玩法显示待贴格数。</p><h4>04 倒计时</h4><p>每手限时 ${game.turnSeconds || 90} 秒，出手后重新计时。超时优先执行已选的合法落点；未选好时由本地算法代走一步。返回大厅暂停计时，刷新页面继续当前计时。</p><h4>05 胜负</h4><p>${game.mode === "race" ? "贴满一横行仍继续，直到一方先完成整面墙。积分仅作记录，不决定竞速胜负。" : "任一玩家贴满一横行，本轮结束后结算。每条完整横行 +2，纵列 +7，同色五块 +10。总分相同时，完整横行较多者胜。"}</p></div>`}</section></div>`;
  }
  function renderClock() {
    return game.phase === "playing" ? `<span class="turn-timer"><i aria-hidden="true">◷</i><time class="turn-clock" aria-label="本手剩余时间">${clockText()}</time></span><span class="turn-progress" aria-hidden="true"><i></i></span>` : '<span class="clock-settled">双方已结算</span>';
  }
  function clockText() {
    const seconds = Math.ceil(G.remainingTime(game) / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function updateClock() {
    if (!game || location.hash !== "#match" || game.phase !== "playing") return;
    const remaining = G.remainingTime(game), label = $(".turn-clock"), progress = $(".turn-progress i");
    if (label) label.textContent = clockText();
    const percent = Math.min(100, remaining / ((game.turnSeconds || 90) * 10));
    if (progress) progress.style.width = `${percent}%`;
    const gauge = $(".market-time-fill"), gaugeClock = $(".market-clock");
    if (gauge) gauge.style.height = `${percent}%`;
    if (gaugeClock) gaugeClock.textContent = String(Math.ceil(remaining / 1000));
    $(".duel-score")?.classList.toggle("clock-urgent", remaining <= 10000);
    $(".game-market")?.classList.toggle("clock-urgent", remaining <= 10000);
    if (!remaining && myTurn()) {
      const preferred = selection && pendingRow !== undefined ? { ...selection, row: pendingRow } : null;
      const player = humanPlayer();
      const move = E.legalMoves(game.position, player).find(candidate => preferred && G.sameMove(candidate, preferred)) || AI.chooseMove(game.position, player, "medium", { tokenOwner: game.tokenOwner }).move;
      if (move) commitHumanMove(move, true);
    }
  }
  function commitHumanMove(move, timedOut = false) {
    const player = humanPlayer();
    game.lastMove = { ...move, player };
    G.playMove(game, move);
    if (timedOut) {
      game.log.unshift(`${playerName(player)}本手倒计时结束，已自动执行合法落砖。`);
      game.log = game.log.slice(0, 40);
    }
    selection = null; pendingRow = undefined; save(); render();
  }
  function signed(n) { return `${n >= 0 ? "+" : "−"}${Math.abs(n)}`; }
  function renderScore(player) {
    const mine = player === "me", board = game.position[player];
    const score = G.roundScore(board), settled = game.phase !== "playing";
    if (game.mode === "race") return `<div class="duelist ${mine ? "mine" : "opponent"}" aria-label="${playerName(player)}满墙进度" aria-live="polite"><span class="duelist-avatar">${mine ? "1" : "2"}</span><div class="duelist-info"><b>${playerName(player)}进度</b><small class="score-pending">${settled ? "已贴墙" : `待贴 ${score.placements.length} 格`}</small></div><strong>${G.wallCount(board)}<small>/25</small></strong></div>`;
    const gain = settled ? (game.summary?.[player]?.gain || 0) + (game.summary?.[player]?.bonus || 0) : score.gain;
    return `<div class="duelist ${mine ? "mine" : "opponent"}" aria-label="${mine ? "你的计分" : "对手计分"}" aria-live="polite"><span class="duelist-avatar">${mine ? "你" : "机"}</span><div class="duelist-info"><b>${localDuel() ? `${playerName(player)}总分` : mine ? "你的总分" : "对手总分"}</b><small class="score-pending" title="${settled ? "本轮分数已计入总分" : `公共池取空后统一入账，当前预计总分 ${score.total}`}" data-score-pending="${player}">${settled ? "本轮" : "待结算"} <em>${signed(gain)}</em>${settled ? " · 已入账" : ""}</small></div><strong data-score-total="${player}">${board.score}<small>分</small></strong></div>`;
  }
  function render() {
    $("#resume-slot").innerHTML = game ? `<button type="button" class="resume-button" data-game-resume="true"><span><b>${game.phase === "finished" ? "查看上一局" : "继续上次对局"}</b><small>${matchLabel()} · 第 ${game.round} 轮 · ${game.mode === "race" ? `${G.wallCount(game.position.me)} : ${G.wallCount(game.position.rival)} 格` : `${game.position.me.score} : ${game.position.rival.score}`}</small></span><i>→</i></button>` : "";
    if (!game) { $("#match-content").innerHTML = ""; return; }
    const status = game.phase === "finished" ? "对局结束" : game.phase === "roundEnd" ? "本轮结算" : localDuel() ? `${playerName(game.turn)} 回合` : game.turn === "me" ? "轮到你了" : "对手思考中";
    $("#match-content").innerHTML = `<header class="table-topbar"><button type="button" data-game-home="true" class="table-back">← <span>大厅</span></button><div class="table-brand">${globalThis.AzulArt.rosette()}花砖物语 <small>AZUL</small></div><div class="table-tools"><button type="button" data-game-overlay="rules">规则</button><button type="button" data-game-overlay="log">记录</button></div></header><div class="duel-score">${renderScore("me")}<div class="duel-round"><small>第 ${game.round} 轮 · ${game.mode === "race" ? "满墙竞速" : AI.LEVELS[game.level].name}</small><b>${status}</b>${renderClock()}</div>${renderScore("rival")}</div><main class="table-stage">${renderBoard("me")}${renderMarket()}${renderBoard("rival")}</main>${renderDock()}${renderDrawer()}${renderResults()}`;
    updateClock();
    if (location.hash === "#match" && game.phase === "playing" && game.turn === "rival" && !localDuel() && !busy) runAI();
  }
  function cancelAI() {
    requestId++; clearTimeout(watchdog); clearInterval(ticker); fallbackPending = false;
    worker?.terminate(); worker = null; busy = false;
  }
  function start(replay = false) {
    const previous = game;
    cancelAI();
    const mode = replay ? previous?.mode || "standard" : document.querySelector('input[name="variant"]:checked').value;
    const level = replay && previous ? previous.level : document.querySelector('input[name="difficulty"]:checked').value;
    game = G.createGame({ level, mode, opponent: mode === "race" ? "local" : "ai", first: $("#game-first").value, turnSeconds: replay && previous?.turnSeconds ? previous.turnSeconds : Number($("#game-seconds").value) });
    selection = null; pendingRow = undefined; overlay = null;
    save(); location.hash = "match"; showMode(); render();
  }
  function syncSetup() {
    const race = document.querySelector('input[name="variant"]:checked').value === "race";
    $(".difficulty-options").classList.toggle("hidden", race);
    $("#race-note").classList.toggle("hidden", !race);
    $("#setup-kicker").textContent = race ? "WALL RACE / 满墙竞速" : "CLASSIC DUEL / 经典对局";
    $("#setup-heading").textContent = race ? "谁先铺满整面墙？" : "这一局，想挑战谁？";
    $("#setup-description").textContent = race ? "同机双人 · 不限轮次 · 先满 25 格获胜" : "本地算法对手 · 经典彩色墙 · 随时继续";
    $("#game-first").options[0].textContent = race ? "玩家 1 先手" : "我先手";
    $("#game-first").options[1].textContent = race ? "玩家 2 先手" : "人机先手";
    const level = document.querySelector('input[name="difficulty"]:checked').value;
    const tips = { easy: "带一点随机性，适合练习规则。", medium: "关注相邻得分、成墙机会与地板风险。", hard: "对抗搜索，争夺本轮主动权。", expert: "同时推演双方棋盘、公共余砖与终局目标。" };
    $("#setup-tip").innerHTML = race ? "两人轮流选砖、落砖。<br>完成一横行仍继续，最后所需图案线完成时，立即贴墙判胜。" : `${tips[level]}<br>算出即落子，不额外等待。<br>超时自动落砖，返回大厅暂停计时。`;
  }
  function completeAI(id, result) {
    if (id !== requestId || !game || localDuel() || game.turn !== "rival" || game.phase !== "playing") return;
    clearTimeout(watchdog); clearInterval(ticker); fallbackPending = false;
    worker?.terminate(); worker = null; busy = false;
    const legal = E.legalMoves(game.position, "rival");
    const move = legal.find((candidate) => result?.move && G.sameMove(candidate, result.move)) || AI.chooseMove(game.position, "rival", "medium", { tokenOwner: game.tokenOwner }).move;
    game.lastMove = { ...move, player: "rival" };
    G.playMove(game, move); save(); render();
  }
  function runAI() {
    busy = true;
    const id = ++requestId, started = Date.now();
    watchdog = setTimeout(() => fallback(id), 6000);
    ticker = setInterval(() => { const label = $(".ai-clock"); if (label) label.textContent = `正在思考 · ${Math.floor((Date.now() - started) / 1000)} 秒`; }, 1000);
    try {
      const inline = document.querySelector("#ai-worker-source");
      if (inline) {
        const url = URL.createObjectURL(new Blob([inline.textContent], { type: "application/javascript" }));
        worker = new Worker(url); URL.revokeObjectURL(url);
      } else worker = new Worker("ai-worker.js?v=15");
      worker.onmessage = (event) => event.data.error ? fallback(id) : completeAI(id, event.data.result);
      worker.onerror = () => fallback(id);
      // 仅发送公开局面；不发送牌袋顺序、种子或未来发牌。
      worker.postMessage({ id, position: game.position, player: "rival", level: game.level, tokenOwner: game.tokenOwner, round: game.round });
    } catch (_) { fallback(id); }
  }
  function fallback(id) {
    if (id !== requestId || !busy || fallbackPending) return;
    fallbackPending = true; clearTimeout(watchdog); worker?.terminate(); worker = null;
    setTimeout(() => { if (id === requestId && game) completeAI(id, AI.chooseMove(game.position, "rival", game.level, { tokenOwner: game.tokenOwner, timeMs: 250 })); }, 0);
  }
  function showMode() {
    const matching = location.hash === "#match" && Boolean(game), helping = location.hash === "#helper";
    $("#play-mode").classList.toggle("hidden", matching || helping);
    $("#helper-mode").classList.toggle("hidden", !helping);
    $("#match-screen").classList.toggle("hidden", !matching);
    document.body.classList.toggle("in-match", matching);
    $("#play-tab").setAttribute("aria-selected", String(!helping));
    $("#helper-tab").setAttribute("aria-selected", String(helping));
    if (game) {
      if (matching) G.resumeClock(game); else G.pauseClock(game);
      save();
    }
    if (!matching && busy) cancelAI();
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  $("#play-tab").addEventListener("click", () => { location.hash = "play"; });
  $("#helper-tab").addEventListener("click", () => { location.hash = "helper"; });
  window.addEventListener("hashchange", () => { showMode(); render(); });
  $("#new-match").addEventListener("click", () => start());
  document.querySelectorAll('input[name="variant"]').forEach(input => input.addEventListener("change", syncSetup));
  document.querySelectorAll('input[name="difficulty"]').forEach(input => input.addEventListener("change", syncSetup));
  $("#resume-slot").addEventListener("click", (event) => { if (event.target.closest("[data-game-resume]")) { location.hash = "match"; showMode(); render(); } });
  $("#match-content").addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.gameHome) { location.hash = "play"; return; }
    if (b.dataset.gameOverlay) { overlay = b.dataset.gameOverlay; render(); return; }
    if (b.dataset.gameClose) { overlay = null; render(); return; }
    if (b.dataset.gameRestart) { start(true); return; }
    if (b.dataset.gameNext) { G.nextRound(game); selection = null; pendingRow = undefined; save(); render(); return; }
    if (!myTurn()) return;
    if (b.dataset.gameCancel) { selection = null; pendingRow = undefined; render(); return; }
    if (b.dataset.gameSource) {
      const kind = b.dataset.gameSource, index = Number(b.dataset.gameIndex), color = b.dataset.gameColor;
      const count = kind === "center" ? game.position.center[color] : game.position.factories[index].filter((c) => c === color).length;
      selection = { kind, index, color, count }; pendingRow = undefined; render();
      return;
    }
    if (selection && (b.dataset.gameRow !== undefined || b.dataset.gameDrop)) { pendingRow = b.dataset.gameDrop ? null : Number(b.dataset.gameRow); render(); return; }
    if (selection && pendingRow !== undefined && b.dataset.gameConfirm) {
      commitHumanMove({ ...selection, row: pendingRow });
    }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && location.hash === "#match") { overlay = null; selection = null; pendingRow = undefined; render(); } });
  if (game) document.querySelector(`input[name="difficulty"][value="${game.level}"]`).checked = true;
  if (game?.turnSeconds) $("#game-seconds").value = String(game.turnSeconds);
  if (game?.mode === "race") document.querySelector('input[name="variant"][value="race"]').checked = true;
  syncSetup(); showMode(); render();
  setInterval(updateClock, 250);
})();
