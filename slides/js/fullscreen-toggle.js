// Full-screen button for touch screens (iPad Safari has no keyboard for reveal's "F"): a small
// round button left of the theme toggle, same look, shown only on coarse pointers (css/talk.css)
// and only where the browser can put a page element in full screen (iPadOS can, iPhone cannot).
// Hidden while full screen; leaving full screen (Safari's own control) brings it back.
// Load after js/theme-toggle.js.

(function () {
  "use strict";

  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) return;
  const current = () => document.fullscreenElement || document.webkitFullscreenElement;

  const btn = document.createElement("button");
  btn.className = "fs-toggle";
  btn.type = "button";
  btn.tabIndex = -1;
  btn.title = "Full screen";
  btn.setAttribute("aria-label", btn.title);
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
  document.body.appendChild(btn);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    btn.blur();
    try {
      const p = request.call(root);
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* refused: stay as is */ }
  });
  const sync = () => btn.classList.toggle("is-hidden", !!current());
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
})();
