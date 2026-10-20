(function (root) {
  "use strict";
  // 共用矢量母版：花纹随砖格缩放，在线版和单文件版都不请求外部图片。
  const colors = ["blue", "yellow", "red", "black", "white"];
  const palettes = {
    blue: ["#52b7d4", "#197791"], yellow: ["#ffd574", "#f0ad45"],
    red: ["#ff7a66", "#ed4e4c"], black: ["#203a3c", "#102328"],
    white: ["#fcfff5", "#dfefdf"],
  };
  const rotate = (markup, angles) => angles.map(angle => `<g transform="rotate(${angle} 40 40)">${markup}</g>`).join("");
  function spiral(phase) {
    const points = Array.from({ length: 100 }, (_, i) => {
      const t = i / 99 * Math.PI * 2.7, radius = 1.6 * Math.exp(.35 * t);
      return `${(40 + radius * Math.cos(t + phase)).toFixed(2)},${(40 + radius * Math.sin(t + phase)).toFixed(2)}`;
    });
    return `<path d="M${points.join("L")}" fill="none" stroke="#a4e0e9" stroke-width="3.4" stroke-linecap="round"/>`;
  }
  const patterns = {
    blue: [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(spiral).join(""),
    yellow: `<g fill="none" stroke="#e4784c" stroke-width="1.8">${rotate('<ellipse cx="40" cy="29" rx="12" ry="20"/>', [0, 45, 90, 135, 180, 225, 270, 315])}<circle cx="40" cy="40" r="24"/><circle cx="40" cy="40" r="7"/></g>`,
    red: `<g fill="none" stroke="#ffe187" stroke-width="1.4">${rotate('<ellipse cx="40" cy="24" rx="6" ry="17"/>', Array.from({ length: 20 }, (_, i) => i * 18))}</g><circle cx="40" cy="40" r="13" fill="#f35b50" stroke="#ffe187" stroke-width="1.7"/><circle cx="40" cy="40" r="17" fill="none" stroke="#ffe187" stroke-width="1.2"/>`,
    black: `<g fill="none" stroke="#3d8c88" stroke-width="1.6" stroke-linejoin="round"><path d="M40 11C55 11 70 32 69 47C68 62 42 71 26 64C11 57 11 31 22 19C27 13 34 11 40 11Z"/><path d="M40 16C52 16 65 33 64 46C63 57 42 65 29 59C18 54 17 33 26 23C30 18 35 16 40 16Z"/><path d="M29 23Q48 17 60 38Q64 55 43 60Q23 61 21 42Q20 29 29 23Z"/><path d="M33 27Q49 20 57 38Q60 51 44 55Q28 57 26 42Q24 32 33 27Z"/><path d="M33 28L55 41L33 55Z"/><path d="M37 33L50 41L37 49Z"/></g>`,
    white: `${rotate('<path d="M40 9L49 27L44 36H36L31 27Z" fill="#35a5aa"/><path d="M40 18L44 28L40 34L36 28Z" fill="#eaf6e5"/>', [0, 60, 120, 180, 240, 300])}<path d="M40 26L45 34L54 32L51 41L57 48L47 49L43 58L38 50L28 52L31 43L24 36L34 35Z" fill="#eaf6e5"/><path d="M40 32L47 38L44 47L35 47L32 38Z" fill="#35a5aa"/><circle cx="40" cy="40" r="3" fill="#eaf6e5"/>`,
  };
  const tileSymbols = colors.map(color => {
    const [light, dark] = palettes[color];
    return `<linearGradient id="azul-glaze-${color}" x2=".8" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient><symbol id="azul-tile-${color}" viewBox="0 0 80 80"><rect x="1" y="1" width="78" height="78" rx="9" fill="url(#azul-glaze-${color})"/>${patterns[color]}<path d="M8 3h64a5 5 0 0 1 5 5v18C59 13 29 25 3 19V8a5 5 0 0 1 5-5Z" fill="url(#azul-shine)"/><rect x="2" y="2" width="76" height="76" rx="8" fill="none" stroke="#edf5d9" stroke-width="2.5" opacity=".75"/></symbol>`;
  }).join("");
  const platePetals = Array.from({ length: 12 }, (_, i) => `<g transform="rotate(${i * 30} 50 50)"><ellipse cx="50" cy="28" rx="9" ry="15" fill="none" stroke="#aeb6b9" stroke-width=".7"/><circle cx="50" cy="11" r="1.4" fill="#7c8f9e"/></g>`).join("");
  const avatarMe = '<circle cx="40" cy="40" r="38" fill="#ffc76f"/><path d="M17 31L19 10L35 25M46 25L62 10L64 33" fill="#ec8f4f" stroke="#9b613c" stroke-width="2"/><ellipse cx="40" cy="43" rx="27" ry="25" fill="#eea163"/><ellipse cx="40" cy="50" rx="19" ry="15" fill="#fff0ce"/><circle cx="29" cy="39" r="3.2" fill="#463f3b"/><circle cx="51" cy="39" r="3.2" fill="#463f3b"/><path d="M35 48Q40 44 45 48L40 53Z" fill="#69483b"/><path d="M30 55Q40 64 50 55" fill="none" stroke="#69483b" stroke-width="2.5" stroke-linecap="round"/><circle cx="20" cy="47" r="5" fill="#ef8867"/><circle cx="60" cy="47" r="5" fill="#ef8867"/>';
  const avatarRival = '<circle cx="40" cy="40" r="38" fill="#9dc6cd"/><path d="M40 10V20" stroke="#466c86" stroke-width="4"/><circle cx="40" cy="9" r="4" fill="#ffcf6b"/><rect x="14" y="23" width="52" height="43" rx="15" fill="#e7eee4" stroke="#5a8298" stroke-width="3"/><rect x="20" y="31" width="40" height="22" rx="8" fill="#336b83"/><circle cx="30" cy="41" r="4" fill="#9dedde"/><circle cx="50" cy="41" r="4" fill="#9dedde"/><path d="M32 59H48" stroke="#779b9f" stroke-width="3" stroke-linecap="round"/><path d="M8 36V50M72 36V50" stroke="#5d8d9f" stroke-width="5" stroke-linecap="round"/>';
  const definitions = `<svg class="azul-art-definitions" width="0" height="0" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>
    <linearGradient id="azul-shine" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="azul-porcelain" cx=".34" cy=".24" r=".8"><stop stop-color="#f3f1e5"/><stop offset=".7" stop-color="#d8ded7"/><stop offset="1" stop-color="#a1adb7"/></radialGradient>
    ${tileSymbols}
    <symbol id="azul-tile-empty" viewBox="0 0 80 80"><rect x="2" y="2" width="76" height="76" rx="9" fill="#d5d6d3"/><path d="M3 65v5a7 7 0 0 0 7 7h60a7 7 0 0 0 7-7v-5" fill="none" stroke="#a8afae" stroke-width="2"/><path d="M8 3h64a5 5 0 0 1 5 5v10" fill="none" stroke="#eeeeea" stroke-width="2.5"/></symbol>
    <symbol id="azul-plate" viewBox="0 0 100 100"><circle cx="50" cy="50" r="49" fill="url(#azul-porcelain)" stroke="#667d96" stroke-width="1.7"/><circle cx="50" cy="50" r="45.5" fill="none" stroke="#eef0e4" stroke-width="3"/><circle cx="50" cy="50" r="43" fill="none" stroke="#8d9caf" stroke-width="1"/><circle cx="50" cy="50" r="36" fill="none" stroke="#8196a8" stroke-width="1"/><circle cx="50" cy="50" r="32.5" fill="none" stroke="#b2bfc3" stroke-width=".7"/>${platePetals}<circle cx="50" cy="50" r="10" fill="none" stroke="#879baf" stroke-width="1.5"/><circle cx="50" cy="50" r="7" fill="none" stroke="#bdc9cb" stroke-width="1"/></symbol>
    <symbol id="azul-avatar-me" viewBox="0 0 80 80">${avatarMe}</symbol><symbol id="azul-avatar-rival" viewBox="0 0 80 80">${avatarRival}</symbol>
    <symbol id="azul-corner" viewBox="0 0 40 40"><path d="M3 37V3h34M7 32V7h25" fill="none" stroke="#476d85" stroke-width="1"/><path d="M9 9c16 1 20 6 15 12-1-8-8-9-9-4 7 3 6 8 1 8-5-1-8-6-7-16Z" fill="#718f9d"/><circle cx="8" cy="8" r="2" fill="#c4a566"/></symbol>
    <symbol id="azul-rosette" viewBox="0 0 80 80">${patterns.white}</symbol>
  </defs></svg>`;

  function svg(id, className) { return `<svg class="${className}" viewBox="0 0 ${id === "plate" ? "100 100" : id === "corner" ? "40 40" : "80 80"}" aria-hidden="true" focusable="false"><use href="#azul-${id}"/></svg>`; }
  function render(color, ghost = false) {
    const name = colors.includes(color) ? color : "empty";
    return `<span class="tile ${name}${ghost ? " ghost" : ""}" aria-hidden="true">${svg(`tile-${name}`, "tile-art")}</span>`;
  }
  function frame() { return `<span class="board-corners" aria-hidden="true">${["nw", "ne", "se", "sw"].map(corner => svg("corner", `board-corner ${corner}`)).join("")}</span>`; }
  root.AzulArt = { render, frame, plate: () => svg("plate", "plate-art"), rosette: () => svg("rosette", "rosette-art"), avatar: player => svg(`avatar-${player === "me" ? "me" : "rival"}`, "player-portrait") };
  document.body.insertAdjacentHTML("afterbegin", definitions);
  document.querySelectorAll(".hero-mark i").forEach((el, i) => { el.innerHTML = render(colors[[0, 1, 4, 2, 3, 0, 4, 1, 2][i]]); });
  document.querySelectorAll(".difficulty-symbol").forEach((el, i) => { el.innerHTML = render(["blue", "yellow", "white", "black"][i]); });
})(globalThis);
