// Laser pointer, switched by a round button bottom-right (left of the contents button) or the "L"
// key. While on: a red dot follows the finger (iPad) or the mouse; finger swipes no longer change
// slides (reveal's touch navigation is off) and touches on the slides do not reach the players, so
// pointing never moves anything, and Safari's own touch gestures are suppressed as far as a page
// can (see the touch listeners). Keyboard, contents menu and the bottom buttons still work.
// Off: the deck behaves as before. Load after js/deck.js.

(function () {
  "use strict";

  const dot = document.createElement("div");
  dot.className = "laser-dot";
  document.body.appendChild(dot);

  const btn = document.createElement("button");
  btn.className = "laser-toggle";
  btn.type = "button";
  btn.tabIndex = -1;
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/>' +
    '<path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>';
  document.body.appendChild(btn);

  let on = false, hideTimer = null;
  function set(v) {
    on = v;
    btn.classList.toggle("is-on", on);
    btn.title = on ? "Laser pointer on: swipes do not change slides (L)" : "Laser pointer (L)";
    btn.setAttribute("aria-label", btn.title);
    document.documentElement.classList.toggle("laser-on", on);
    if (window.Reveal && Reveal.configure) Reveal.configure({ touch: !on });
    if (!on) { clearTimeout(hideTimer); dot.classList.remove("on"); }
  }

  function show(e) {
    clearTimeout(hideTimer);
    dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    dot.classList.add("on");
  }
  const hideSoon = (ms) => { clearTimeout(hideTimer); hideTimer = setTimeout(() => dot.classList.remove("on"), ms); };

  // the bottom buttons and the contents menu stay usable while the laser is on
  const isUi = (t) => t && t.closest && t.closest(".laser-toggle, .nav-toggle, .fs-toggle, .theme-toggle, .nav-menu");

  window.addEventListener("pointerdown", (e) => {
    if (!on || isUi(e.target)) return;
    show(e);
    e.stopPropagation();                       // players (sphere drag, buttons) do not react
  }, true);
  window.addEventListener("pointermove", (e) => {
    if (!on || isUi(e.target)) return;
    if (e.pointerType === "mouse" || e.buttons || e.pressure > 0) show(e);
    e.stopPropagation();
  }, true);
  window.addEventListener("pointerup", (e) => { if (on && e.pointerType !== "mouse") hideSoon(600); }, true);
  window.addEventListener("pointercancel", () => { if (on) hideSoon(600); }, true);
  document.addEventListener("mouseleave", () => { if (on) hideSoon(200); });
  // no touch reaches reveal or the players while pointing, and every touch on the slides is claimed
  // (preventDefault, non-passive) so Safari does not turn a slip of the finger into one of its own
  // gestures (scroll, bounce, swipe out of full screen); pointer events still fire, so the dot follows.
  // html.laser-on also sets touch-action: none (css/talk.css), the same request in CSS.
  for (const type of ["touchstart", "touchmove", "touchend"])
    window.addEventListener(type, (e) => {
      if (!on || isUi(e.target)) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    }, { capture: true, passive: false });
  document.addEventListener("gesturestart", (e) => { if (on) e.preventDefault(); });   // Safari pinch
  window.addEventListener("click", (e) => { if (on && !isUi(e.target)) { e.stopPropagation(); e.preventDefault(); } }, true);

  btn.addEventListener("click", (e) => { e.stopPropagation(); btn.blur(); set(!on); });
  // "L" is reveal's "next slide" key: taken here first (capture) so it only toggles the laser
  window.addEventListener("keydown", (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) return;
    if ((e.key === "l" || e.key === "L") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); e.stopPropagation(); set(!on);
    }
  }, true);
  set(false);
})();
