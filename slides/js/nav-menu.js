// Contents menu: jump to the start, the end of the talk, a part (the top-level sections and their
// data-part names) or any slide. A faint round button bottom-right (next to the theme toggle) and
// the "M" key open it; tap outside, Escape or a choice closes it. Built for the iPad (no keyboard),
// works the same with a mouse. Slide names: the slide's h2 (KaTeX copies removed), else its
// data-menu attribute, else a name from its player layout. "End" = last slide before Supplementary.
// Load after js/deck.js.

(function () {
  "use strict";

  const LAYOUT_NAMES = {
    network: "Transfer, live", drive: "Selection drive", dW: "Cortical weight change",
    gap: "Transfer gap per mode", mixtures: "What does replay track?",
  };

  function slideName(s) {
    if (s.dataset.menu) return s.dataset.menu;
    const h = s.querySelector("h1, h2");
    if (h) {
      const c = h.cloneNode(true);
      c.querySelectorAll(".katex-mathml, annotation").forEach((e) => e.remove());
      const t = c.textContent.replace(/\s+/g, " ").trim();
      if (t) return t;
    }
    const sp = s.querySelector(".sphere-player");
    if (sp) return sp.dataset.title ? `${LAYOUT_NAMES[sp.dataset.layout] || "Transfer"}: ${sp.dataset.title}`
                                    : LAYOUT_NAMES[sp.dataset.layout] || "Transfer";
    if (s.querySelector(".fmax-player")) return "Replay tracks F_max";
    return "Slide";
  }

  // the deck's structure: parts (top-level sections) and their slides, with reveal indices
  function structure() {
    const parts = [];
    [...document.querySelectorAll(".reveal .slides > section")].forEach((top, h) => {
      const kids = [...top.querySelectorAll(":scope > section")];
      if (!kids.length) { parts.push({ name: null, h, slides: [{ h, v: 0, name: slideName(top), el: top }] }); return; }
      parts.push({ name: top.dataset.part || slideName(kids[0]), h,
                   slides: kids.map((s, v) => ({ h, v, name: slideName(s), el: s, divider: s.matches(".divider") })) });
    });
    return parts;
  }

  const btn = document.createElement("button");
  btn.className = "nav-toggle";
  btn.type = "button";
  btn.tabIndex = -1;
  btn.title = "Contents (M)";
  btn.setAttribute("aria-label", btn.title);
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
  document.body.appendChild(btn);

  const overlay = document.createElement("div");
  overlay.className = "nav-menu";
  overlay.hidden = true;
  document.body.appendChild(overlay);

  function go(h, v) { close(); Reveal.slide(h, v, 0); }

  function build() {
    const parts = structure();
    const cur = Reveal.getIndices();
    const named = parts.filter((p) => p.name);
    const sup = named.find((p) => /supplement/i.test(p.name));
    const lastMain = named.filter((p) => p !== sup).pop();
    const end = lastMain ? lastMain.slides[lastMain.slides.length - 1] : null;

    overlay.innerHTML = "";
    const card = document.createElement("div");
    card.className = "nav-card";
    const top = document.createElement("div");
    top.className = "nav-top";
    const mk = (label, h, v, cls) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.textContent = label;
      b.addEventListener("click", (e) => { e.stopPropagation(); go(h, v); });
      return b;
    };
    top.appendChild(mk("Start", 0, 0, "nav-big"));
    if (end) top.appendChild(mk("End", end.h, end.v, "nav-big"));
    card.appendChild(top);

    const grid = document.createElement("div");
    grid.className = "nav-grid";
    let n = 0;                                   // running slide number, as on the slide tag
    for (const p of parts) {
      if (!p.name) { n += p.slides.length; continue; }
      const col = document.createElement("div");
      col.className = "nav-col";
      col.appendChild(mk(p.name, p.h, 0, "nav-part" + (cur.h === p.h ? " is-current" : "")));
      for (const s of p.slides) {
        n += 1;
        if (s.divider) continue;
        const b = mk("", s.h, s.v, "nav-slide" + (cur.h === s.h && cur.v === s.v ? " is-current" : ""));
        b.innerHTML = `<span class="nav-num">${n}</span><span class="nav-name"></span>`;
        b.lastChild.textContent = s.name;
        col.appendChild(b);
      }
      grid.appendChild(col);
    }
    card.appendChild(grid);
    // display readout (to compare Safari and the home-screen app): window size in CSS px, zoom, deck scale
    const info = document.createElement("div");
    info.className = "nav-info";
    const app = window.navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    info.textContent = `${app ? "home-screen app" : "browser"} · window ${innerWidth}×${innerHeight} · ` +
      `pixel ratio ${devicePixelRatio} · slide scale ${Reveal.getScale().toFixed(3)}`;
    card.appendChild(info);
    overlay.appendChild(card);
    card.addEventListener("click", (e) => e.stopPropagation());
  }

  function open() { build(); overlay.hidden = false; }
  function close() { overlay.hidden = true; }
  const toggle = () => (overlay.hidden ? open() : close());

  btn.addEventListener("click", (e) => { e.stopPropagation(); btn.blur(); toggle(); });
  overlay.addEventListener("click", close);
  // keys: M toggles, Escape closes (capture phase, so reveal does not also open its overview)
  document.addEventListener("keydown", (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) return;
    if ((e.key === "m" || e.key === "M") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); e.stopPropagation(); toggle();
    } else if (e.key === "Escape" && !overlay.hidden) {
      e.preventDefault(); e.stopPropagation(); close();
    }
  }, true);
  // swipes and taps on the menu must not move the slides behind it
  ["touchstart", "touchmove", "touchend", "pointerdown"].forEach((t) =>
    overlay.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
})();
