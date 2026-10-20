(function (root) {
  "use strict";
  // 共用矢量母版：花纹随砖格缩放，在线版和单文件版都不请求外部图片。
  const colors = ["blue", "yellow", "red", "black", "white"];
  const palettes = {
    blue: ["#477dd3", "#174b94", "#f6efd4", "#8dc5ee"],
    yellow: ["#ffda75", "#e4a53d", "#89501e", "#fff6cc"],
    red: ["#eb8068", "#bd3d3d", "#fff0cd", "#8f2c35"],
    black: ["#29566d", "#102d43", "#f0c879", "#81b4b5"],
    white: ["#fffdf0", "#dedfc9", "#258c9b", "#1f5277"],
  };
  const rotate = (markup, angles) => angles.map(angle => `<g transform="rotate(${angle} 40 40)">${markup}</g>`).join("");
  const rim = (ink) => `<rect x="6" y="6" width="68" height="68" rx="5" fill="none" stroke="${ink}" stroke-width="1.5" opacity=".65"/>`;
  const corners = (ink) => rotate(`<path d="M12 27V13h14M16 22a6 6 0 0 1 6-6" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`, [0, 90, 180, 270]);
  const patterns = {
    blue: `${rim("#d9e5eb")}${corners("#c9e2ef")}${rotate('<path d="M40 39C24 36 22 21 40 12C58 21 56 36 40 39Z" fill="#f6efd4"/><path d="M40 32V20" stroke="#548bbd" stroke-width="2.2"/>', [0, 90, 180, 270])}<path d="M40 31l9 9-9 9-9-9Z" fill="#86bfd8" stroke="#f6efd4" stroke-width="2"/><circle cx="40" cy="40" r="3.5" fill="#164b8b"/>`,
    yellow: `${rim("#9b692c")}${corners("#fff1b5")}<path d="M40 12l8 17 19-1-11 15 7 18-19-6-15 12 1-20-17-9 18-7Z" fill="#8e571f"/><path d="M40 23l5 13 14 4-14 5-5 14-5-14-14-5 14-4Z" fill="#fff1bc"/>${rotate('<path d="M40 17l2 8h-4Z" fill="#f5ca64"/>', [0, 45, 90, 135, 180, 225, 270, 315])}<circle cx="40" cy="40" r="5" fill="#c5822d"/>`,
    red: `${rim("#ffe4ba")}${corners("#f7c7a5")}${rotate('<path d="M40 38C26 33 28 19 40 13C52 19 54 33 40 38Z" fill="#fff0d4"/><path d="M40 20v12" stroke="#d15d51" stroke-width="2"/>', [0, 45, 90, 135, 180, 225, 270, 315])}<circle cx="40" cy="40" r="9" fill="#92383c" stroke="#ffe4ba" stroke-width="2"/><path d="M40 34l6 6-6 6-6-6Z" fill="#f5c582"/>`,
    black: `${rim("#d1b879")}${corners("#7ca6af")}<path d="M40 11l8 17 18-2-7 17 9 16-19 1-9 17-9-17-19-1 9-16-7-17 18 2Z" fill="#e7bf72"/><path d="M40 23l6 12 14 5-14 6-6 13-6-13-14-6 14-5Z" fill="#1c4a61" stroke="#f7e1aa" stroke-width="1.7"/><path d="M40 31l9 9-9 9-9-9Z" fill="#85b5b3"/><circle cx="40" cy="40" r="3" fill="#f4d497"/>`,
    white: `${rim("#6097ac")}${corners("#275e82")}${rotate('<path d="M40 38C23 37 19 25 24 13C36 19 42 27 40 38Z" fill="#258f9d"/><path d="M27 20l9 12" stroke="#c2dfd6" stroke-width="2.2"/><path d="M40 29c-4-11 2-17 9-19 4 10 1 16-9 19Z" fill="#83c1bd"/>', [0, 90, 180, 270])}<path d="M40 30l10 10-10 10-10-10Z" fill="#f6f1d8" stroke="#286780" stroke-width="2"/><circle cx="40" cy="40" r="3.5" fill="#23677e"/>`,
  };
  const tileSymbols = colors.map(color => {
    const [light, dark] = palettes[color];
    return `<linearGradient id="azul-glaze-${color}" x2=".8" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient><symbol id="azul-tile-${color}" viewBox="0 0 80 80"><rect x="1" y="1" width="78" height="78" rx="7" fill="url(#azul-glaze-${color})"/>${patterns[color]}<path d="M8 3h64a5 5 0 0 1 5 5v18C59 13 29 25 3 19V8a5 5 0 0 1 5-5Z" fill="url(#azul-shine)"/><rect x="2" y="2" width="76" height="76" rx="6" fill="none" stroke="#fff8e0" stroke-width="2" opacity=".7"/></symbol>`;
  }).join("");
  const platePetals = Array.from({ length: 12 }, (_, i) => `<g transform="rotate(${i * 30} 50 50)"><path d="M48 6q-6 6 2 10 8-4 2-10l-2 5Z" fill="#32658c"/><circle cx="50" cy="18" r="1" fill="#a99564"/></g>`).join("");
  const definitions = `<svg class="azul-art-definitions" width="0" height="0" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>
    <linearGradient id="azul-shine" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="azul-porcelain" cx=".34" cy=".24" r=".8"><stop stop-color="#fffdf0"/><stop offset=".7" stop-color="#e8e7d3"/><stop offset="1" stop-color="#b6c6c6"/></radialGradient>
    ${tileSymbols}
    <symbol id="azul-tile-empty" viewBox="0 0 80 80"><rect x="3" y="3" width="74" height="74" rx="7" fill="#dfdfd0" stroke="#b9c0b6" stroke-width="2"/><rect x="8" y="8" width="64" height="64" rx="4" fill="none" stroke="#f8f6e4" stroke-width="2" opacity=".7"/><path d="M40 30q-12 4-10 10 4 12 10 10 12-4 10-10-4-12-10-10Z" fill="none" stroke="#aebcb3" stroke-width="1.8" opacity=".45"/></symbol>
    <symbol id="azul-plate" viewBox="0 0 100 100"><circle cx="50" cy="50" r="49" fill="url(#azul-porcelain)" stroke="#f6ead0" stroke-width="1.5"/><circle cx="50" cy="50" r="45" fill="none" stroke="#376e90" stroke-width="1.3"/>${platePetals}<circle cx="50" cy="50" r="30.5" fill="none" stroke="#a3b7ba" stroke-width="1"/><circle cx="50" cy="50" r="28" fill="#e4e8dc" stroke="#cbd3c6" stroke-width=".7"/><path d="M29 52q21-15 42 0M35 58q15-11 30 0" fill="none" stroke="#bacac6" stroke-width="1.3" opacity=".7"/></symbol>
    <symbol id="azul-corner" viewBox="0 0 40 40"><path d="M3 37V3h34M7 32V7h25" fill="none" stroke="#476d85" stroke-width="1"/><path d="M9 9c16 1 20 6 15 12-1-8-8-9-9-4 7 3 6 8 1 8-5-1-8-6-7-16Z" fill="#718f9d"/><circle cx="8" cy="8" r="2" fill="#c4a566"/></symbol>
    <symbol id="azul-rosette" viewBox="0 0 80 80">${patterns.white}</symbol>
  </defs></svg>`;

  function svg(id, className) { return `<svg class="${className}" viewBox="0 0 ${id === "plate" ? "100 100" : id === "corner" ? "40 40" : "80 80"}" aria-hidden="true" focusable="false"><use href="#azul-${id}"/></svg>`; }
  function render(color, ghost = false) {
    const name = colors.includes(color) ? color : "empty";
    return `<span class="tile ${name}${ghost ? " ghost" : ""}" aria-hidden="true">${svg(`tile-${name}`, "tile-art")}</span>`;
  }
  function frame() { return `<span class="board-corners" aria-hidden="true">${["nw", "ne", "se", "sw"].map(corner => svg("corner", `board-corner ${corner}`)).join("")}</span>`; }
  root.AzulArt = { render, frame, plate: () => svg("plate", "plate-art"), rosette: () => svg("rosette", "rosette-art") };
  document.body.insertAdjacentHTML("afterbegin", definitions);
  document.querySelectorAll(".hero-mark i").forEach((el, i) => { el.innerHTML = render(colors[[0, 1, 4, 2, 3, 0, 4, 1, 2][i]]); });
  document.querySelectorAll(".difficulty-symbol").forEach((el, i) => { el.innerHTML = render(["blue", "yellow", "black"][i]); });
})(globalThis);
