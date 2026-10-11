// Light / dark switch for the whole deck: a small sun/moon button in the bottom-right corner
// (faint until hovered) and the "D" key. Sets <html data-theme="dark|light"> (colours in
// css/talk.css) and switches the animation players (sphere-player, fmax-player) to match.
// The choice is remembered per browser; "?theme=dark" in the URL forces it (for screenshots).
// Load after the player scripts, before js/deck.js.

(function () {
  "use strict";

  const KEY = "talk-theme";
  const root = document.documentElement;

  const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/>' +
    '<path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';

  const players = () => [...document.querySelectorAll(".sphere-player, .fmax-player")]
    .map((e) => e._sphere || e._fmax).filter(Boolean);

  const btn = document.createElement("button");
  btn.className = "theme-toggle";
  btn.type = "button";
  btn.tabIndex = -1;                        // keep the arrow keys / space with the slides
  document.body.appendChild(btn);

  function apply(theme, save) {
    root.dataset.theme = theme;
    for (const p of players()) if (p.opts.theme !== theme) p.setTheme(theme);
    const dark = theme === "dark";
    btn.innerHTML = dark ? SUN : MOON;      // the icon shows what a click switches to
    btn.title = dark ? "Light theme (D)" : "Dark theme (D)";
    btn.setAttribute("aria-label", btn.title);
    if (save) { try { localStorage.setItem(KEY, theme); } catch (e) { /* no storage */ } }
  }
  const toggle = () => apply(root.dataset.theme === "dark" ? "light" : "dark", true);

  btn.addEventListener("click", (e) => { toggle(); btn.blur(); e.stopPropagation(); });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "d" || e.key === "D") && !e.ctrlKey && !e.metaKey && !e.altKey &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) toggle();
  });

  let start = new URLSearchParams(location.search).get("theme");
  if (start !== "dark" && start !== "light") {
    try { start = localStorage.getItem(KEY); } catch (e) { start = null; }
  }
  apply(start === "dark" ? "dark" : "light", false);
})();
