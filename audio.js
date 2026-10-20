// 原创 BGM 播放控制：先有用户操作再播放，静音偏好跨刷新保留。
(function (root) {
  "use strict";
  const audio = document.querySelector("#background-music"), KEY = "azul-music-v1";
  if (!audio) return;
  let enabled = true, volume = 0.28, unlocked = false, pending = false, failed = false;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (typeof saved?.enabled === "boolean") enabled = saved.enabled;
    if (Number.isFinite(saved?.volume)) volume = Math.max(0, Math.min(1, saved.volume));
  } catch (_) { /* 无存储权限仍可播放 */ }
  audio.volume = volume;
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ enabled, volume })); } catch (_) { /* 偏好仅保留本页 */ } }
  function sync() {
    const playing = !audio.paused && enabled && !failed;
    document.querySelectorAll("[data-music-toggle]").forEach(button => {
      const compact = button.hasAttribute("data-music-compact");
      const text = failed ? "重试音乐" : playing ? (compact ? "音乐开" : "音乐已开启") : !enabled ? (compact ? "音乐关" : "音乐已关闭") : (compact ? "音乐" : "播放音乐");
      button.querySelector("[data-music-status]").textContent = text;
      button.setAttribute("aria-pressed", String(playing));
      button.setAttribute("aria-label", playing ? "关闭背景音乐" : "播放背景音乐");
      button.classList.toggle("is-playing", playing);
    });
    document.querySelectorAll("[data-music-volume]").forEach(input => { input.value = String(Math.round(volume * 100)); });
    document.querySelectorAll("[data-volume-value]").forEach(output => { output.textContent = `${Math.round(volume * 100)}%`; });
    document.querySelectorAll(".soundbar").forEach(bar => bar.classList.toggle("is-playing", playing));
  }
  async function play() {
    if (!enabled || pending || document.hidden) return;
    pending = true; failed = false;
    try {
      await audio.play();
      unlocked = true;
      // 异步加载期间关闭音乐或切到后台时，不让晚到的 play() 再发声。
      if (!enabled || document.hidden) audio.pause();
    } catch (error) {
      if (error.name !== "NotAllowedError" && error.name !== "AbortError") failed = true;
    } finally { pending = false; sync(); }
  }
  function toggle() {
    if (!audio.paused && enabled) { enabled = false; audio.pause(); }
    else if (pending && enabled) { enabled = false; audio.pause(); }
    else { enabled = true; play(); }
    save(); sync();
  }
  document.addEventListener("click", event => {
    if (event.target.closest("[data-music-toggle]")) toggle();
    else if (enabled && audio.paused) play();
  });
  document.addEventListener("input", event => {
    if (!event.target.matches("[data-music-volume]")) return;
    volume = Number(event.target.value) / 100;
    audio.volume = volume;
    save(); sync();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) audio.pause(); else if (enabled && unlocked) play();
    sync();
  });
  window.addEventListener("pagehide", () => audio.pause());
  window.addEventListener("pageshow", () => { if (enabled && unlocked) play(); });
  audio.addEventListener("playing", sync);
  audio.addEventListener("pause", sync);
  audio.addEventListener("error", () => { failed = true; sync(); });
  root.AzulAudio = { sync };
  sync();
})(globalThis);
