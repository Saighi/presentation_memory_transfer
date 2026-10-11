// F_max tracking player: draws the run exported by talkviz/web_export.py (export_fmax) as an
// SVG animation, three clicks per new memory. The test of the hypothesis of the previous slides:
// replay climbs to the F_max state, then cortical learning lowers F_max.
//
// Usage (deck or any page):
//   <script src="media/interactive/fmax_tracking.data.js"></script>
//   <div class="fmax-player" data-fmax="fmax_tracking" data-theme="light"></div>
//   <script src="js/fmax-player.js"></script>      (before js/deck.js in the deck)
//
// Options (data attributes): data-theme="light|dark", data-speed="1" (multiplies the exported
// pacing; the speed slider overrides it and is remembered per browser), data-controls="none"
// (no sliders), data-ring="0.01" (F_max ring threshold, fraction of the peak; the ring slider
// overrides it and is remembered per browser), data-steps="none" (no reveal fragments, e.g. with data-autoplay), data-autoplay,
// data-title="none" (no slide title drawn in the SVG).
//
// Three steps per memory, each one invisible reveal fragment:
//   1. "next": the memory is added; its F_max state (green ring) appears;
//   2. "next": replay climbs to the ring with cortical plasticity OFF, then holds just before
//      plasticity resumes;
//   3. "next": plasticity resumes, the cortex learns, F_max falls, replay wanders; holds on the
//      last frame of the stage until the next memory.
// "Previous" goes back one step (to the previous held state).
//
// Layout (px of the deck canvas, 1920x1080; the SVG scales to the slide and stays sharp):
//   as the other results visualizations (sphere-player "gap"): title top left, sober activity
//   column left (the two networks' activity, already introduced: names and arrows only), memory
//   map centre, right column = status badge, F_max time plot (numbered memory arrivals, amber
//   plasticity-OFF bands), legend under a rule, speed slider.
// Colours: one per quantity, as in the rest of the deck. Free energy q / F_max = green (memory
// dots grey = learned -> green = new, ring, curve); hippocampus = blue; cortex = orange;
// plasticity OFF = amber; activity = greys (negative white, zero mid grey, positive black).

(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const W = 1920, H = 1080;

  const THEMES = {
    light: {
      bg: "#FFFFFF", ink: "#23262D", soft: "#5F6670", axis: "#9AA0A6", rule: "#D9DDE3",
      teacher: "#378ADD", student: "#D85A30", drive: "#2A78C8", error: "#D4532A",
      fe: "#3A9A5C", feLow: "#B8BDC4", card: "#F4F5F7",
      badge: { add: ["#23262D", "#FFFFFF"], off: ["#E4B94F", "#23262D"], learn: ["#F2C4AE", "#23262D"] },
      off: "#E4B94F", offAlpha: 0.3, now: "#23262D", nowAlpha: 0.05,
      digit: ["#FFFFFF", "#D9D9D9", "#B0B0B0", "#8C8C8C", "#666666", "#383838", "#0A0A0A"],
      dotStroke: "#23262D", teacherStroke: "#FFFFFF",
    },
    dark: {
      bg: "#111316", ink: "#E8EAED", soft: "#A9AEB5", axis: "#5F6670", rule: "#2E333A",
      teacher: "#4A9BEA", student: "#EA6A3A", drive: "#4A9BEA", error: "#EA6A3A",
      fe: "#45B36B", feLow: "#5F6670", card: "#1C2026",
      badge: { add: ["#E8EAED", "#111316"], off: ["#E4B94F", "#111316"], learn: ["#7A3A22", "#E8EAED"] },
      off: "#E4B94F", offAlpha: 0.22, now: "#E8EAED", nowAlpha: 0.06,
      digit: ["#FFFFFF", "#D9D9D9", "#B0B0B0", "#8C8C8C", "#666666", "#383838", "#0A0A0A"],
      dotStroke: "#E8EAED", teacherStroke: "#111316",
    },
  };

  const FONT = '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const CAL = '"KaTeX_Caligraphic", "KaTeX_Main", serif';      // \mathcal F, as in the KaTeX slides
  const MAIN = '"KaTeX_Main", "Times New Roman", serif';

  const L = {
    title: { x: 80, y: 141 },
    badge: { x: 1640, y: 156, w: 400, h: 66 },                  // under the deck's slide tag
    panel: { x: 60, w: 170, img: 150, yS: 345, yT: 650 },       // activity (left)
    map: { x0: 290, x1: 1150, y0: 200, y1: 1010, pad: 0.12 },   // memory map (centre)
    plot: { x0: 1260, x1: 1860, y0: 340, y1: 565 },              // F_max over time (right)
    side: { x: 1180, right: 1860, y: 680 },                      // legend under the plot
    sizes: {
      mem: 22, teacher: 14, ring: 42, memLabel: 48, memLabelOff: 62,
      title: 60, badge: 32, panelLabel: 30, flow: 21,
      plotTitle: 34, tick: 26, axisLabel: 28, marker: 18,
      legend: 27, define: 23,
    },
  };

  // ---------- small helpers ----------
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // n colours evenly through equally spaced stops, as [r, g, b]
  function lutRgb(stops, n) {
    const rgb = stops.map(hexToRgb), out = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * (rgb.length - 1);
      const j = Math.min(Math.floor(t), rgb.length - 2), f = t - j;
      out[i] = rgb[j].map((v, m) => Math.round(v + (rgb[j + 1][m] - v) * f));
    }
    return out;
  }
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  function b64ToInt8(s) {
    const bin = atob(s), a = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = (bin.charCodeAt(i) << 24) >> 24;
    return a;
  }

  // "𝓕_max" (KaTeX caligraphic F, upright "max" subscript) inside a text element, then plain words
  function fmax(t, size, after) {
    el("tspan", { "font-family": CAL, "font-size": size * 1.12, "font-weight": 400 }, t).textContent = "F";
    const drop = Math.round(size * 0.24);
    el("tspan", { "font-family": MAIN, "font-size": Math.round(size * 0.7), "font-weight": 400, dy: drop }, t)
      .textContent = "max";
    if (after) el("tspan", { dy: -drop }, t).textContent = after;
    return t;
  }

  // vertical block arrow from y0 to y1
  function arrowPath(x, y0, y1, w, hw, hl) {
    const d = Math.sign(y1 - y0), yb = y1 - d * hl;
    return `M${x - w / 2},${y0} L${x + w / 2},${y0} L${x + w / 2},${yb} L${x + hw / 2},${yb} ` +
           `L${x},${y1} L${x - hw / 2},${yb} L${x - w / 2},${yb} Z`;
  }

  let instances = 0;
  // F_max ring threshold, fraction of the run's peak F_max (data-ring overrides, the slider too)
  const RING_DEFAULT = 0.01;

  // ======================================================================
  class FmaxPlayer {
    constructor(root, data, opts = {}) {
      this.root = root;
      this.d = data;
      this.id = `fp${instances++}`;
      this.opts = Object.assign({ theme: "light", speed: 1, ring: RING_DEFAULT, autoplay: false, loop: false,
                                  title: true, controls: true, blend: [160, 600, 1200], autoDelay: 1.5 }, opts);
      if (this.opts.controls) {   // speed and ring threshold set on the sliders in a previous session
        try {
          const s = parseFloat(localStorage.getItem("fmax-speed")); if (s > 0) this.opts.speed = s;
          const g = parseFloat(localStorage.getItem("fmax-ring")); if (g > 0) this.opts.ring = g;
        } catch (e) { /* no storage */ }
      }
      const r = data.rec, P = data.n_memories;
      this.P = P;
      this.N = data.n_records;
      this.xT = b64ToInt8(data.digits.x_T);
      this.xS = b64ToInt8(data.digits.x_S);
      // record range of each stage (records with `active` = s + 1 are contiguous)
      this.ranges = [];
      for (let s = 0; s < P; s++) this.ranges.push([r.active.indexOf(s + 1), r.active.lastIndexOf(s + 1)]);
      // per record, 0 (slow climb) .. 1 (fast-forwarded wandering): thick trail where the run
      // plays slowly, thin where it fast-forwards (else the noise scribbles)
      const sp = data.pacing.speeds, vlo = Math.min(...sp), vhi = Math.max(...sp);
      this.fast = new Float32Array(this.N);
      for (let i = 0; i < this.N; i++) {
        const rel = r.step[i] - r.step[this.ranges[r.active[i] - 1][0]];
        this.fast[i] = clamp(Math.log(this.speedAt(rel) / vlo) / Math.log(vhi / vlo), 0, 1);
      }
      this.steps = 3 * P;       // clicks per memory: add it, climb (plasticity OFF), learn
      this.pos = 0;
      this.k = 0;               // memories added so far (0..P); stage k - 1 is shown
      this.phase = "empty";     // empty | added | play | held | done
      this.stepNow = 0;
      this.phaseT = 0;
      this.addT = 0;            // seconds since the current memory was added (fade-ins)
      this.wall = 0;
      this.active = false;
      this.raf = null;
      this.lastDigit = -2;
      this.build();
      this.render();
    }

    // ---------- geometry ----------
    mapX(x) { return this.mcx + x * this.mscale; }
    mapY(y) { return this.mcy - y * this.mscale; }
    plotX(step) { const p = L.plot; return p.x0 + (step / this.d.n_steps) * (p.x1 - p.x0); }
    yF(F) { const p = L.plot; return p.y1 - (F / this.fTop) * (p.y1 - p.y0); }

    // ---------- DOM ----------
    build() {
      const T = (this.T = THEMES[this.opts.theme] || THEMES.light), id = this.id;
      this.root.innerHTML = "";
      this.root.dataset.theme = this.opts.theme;
      this.root.style.background = T.bg;
      const svg = (this.svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet",
                                          "font-family": FONT, role: "img",
                                          "aria-label": "Replay tracking the largest settled cortical free energy" },
                                 this.root));
      this.feLut = lutRgb([T.feLow, T.fe], 256);
      this.digLut = lutRgb(T.digit, 255);
      this.defs = el("defs", {}, svg);
      const fg = el("linearGradient", { id: `${id}-fe`, x1: 0, x2: 1, y1: 0, y2: 0 }, this.defs);
      el("stop", { offset: 0, "stop-color": T.feLow }, fg);
      el("stop", { offset: 1, "stop-color": T.fe }, fg);
      const ag = el("linearGradient", { id: `${id}-area`, x1: 0, x2: 0, y1: 0, y2: 1 }, this.defs);
      el("stop", { offset: 0, "stop-color": T.fe, "stop-opacity": 0.32 }, ag);
      el("stop", { offset: 1, "stop-color": T.fe, "stop-opacity": 0.03 }, ag);
      const clip = el("clipPath", { id: `${id}-clip` }, this.defs);
      this.clipRect = el("rect", { x: L.plot.x0 - 12, y: L.plot.y0 - 30, width: 0,
                                   height: L.plot.y1 - L.plot.y0 + 40 }, clip);

      el("rect", { x: 0, y: 0, width: W, height: H, fill: T.bg }, svg);
      if (this.opts.title) {
        const t = el("text", { x: L.title.x, y: L.title.y, fill: T.ink, "font-size": L.sizes.title,
                               "font-weight": 650, "letter-spacing": "-0.6" }, svg);
        el("tspan", {}, t).textContent = "Replay tracks ";
        fmax(t, L.sizes.title);
      }
      this.buildPanel(svg);
      this.buildMap(svg);
      this.buildPlot(svg);
      this.buildSide(svg);
      this.buildBadge(svg);
      if (this.opts.controls) this.buildControls();
    }

    // sliders (HTML over the SVG, bottom of the legend), faint until hovered, both on a log scale
    // and remembered per browser; double-click resets. Placed in cqw (1cqw = 19.2 canvas px) so
    // they scale with the SVG.
    //   speed: playback speed, 0.25x-4x
    //   ring:  F_max level (fraction of its peak over the run) under which the green ring and its
    //          link fade out, 0.1 %-30 %
    buildControls() {
      const T = this.T, root = this.root;
      root.style.setProperty("--fp-ink", T.ink);
      root.style.setProperty("--fp-soft", T.soft);
      root.style.setProperty("--fp-accent", T.teacher);
      this.showSpeed = this.slider("speed", 980, -2, 2, {
        get: () => Math.log2(this.opts.speed),
        set: (v) => { if (Math.abs(v) < 0.08) v = 0; this.setSpeed(2 ** v); },   // snap to 1x
        fmt: () => { const s = this.opts.speed; return `${s < 1 ? s.toFixed(2) : s.toFixed(1)}×`; },
        reset: 0, store: ["fmax-speed", () => this.opts.speed],
      });
      this.slider("ring", 1030, -3, Math.log10(0.3), {
        get: () => Math.log10(this.opts.ring),
        set: (v) => { this.opts.ring = 10 ** v; this.render(); },
        fmt: () => { const p = 100 * this.opts.ring; return `${p < 1 ? p.toFixed(1) : p.toFixed(0)} %`; },
        reset: Math.log10(RING_DEFAULT), store: ["fmax-ring", () => this.opts.ring],
      });
    }

    slider(label, y, min, max, o) {
      const box = document.createElement("div");
      box.className = "fp-speed";
      box.style.left = `${L.side.x / 19.2 - 0.9}cqw`;    // pill padding: text lines up with the legend
      box.style.top = `${y / 19.2}cqw`;
      box.innerHTML = `<span class="fp-speed-label">${label}</span>` +
        `<input type="range" min="${min}" max="${max}" step="0.01" tabindex="-1" aria-label="${label}">` +
        '<output class="fp-speed-value"></output>';
      this.root.appendChild(box);
      const input = box.querySelector("input"), out = box.querySelector("output");
      const show = () => {
        const v = o.get();
        input.value = v;
        input.style.setProperty("--fp-fill", `${((v - min) / (max - min)) * 100}%`);
        out.textContent = o.fmt();
      };
      input.addEventListener("input", () => {
        o.set(parseFloat(input.value));
        try { localStorage.setItem(o.store[0], String(o.store[1]())); } catch (e) { /* no storage */ }
        show();
      });
      input.addEventListener("dblclick", () => { input.value = o.reset; input.dispatchEvent(new Event("input")); });
      // give the arrow keys back to the slides as soon as the slider is released
      for (const ev of ["pointerup", "change"]) input.addEventListener(ev, () => input.blur());
      input.addEventListener("keydown", (e) => { input.blur(); e.preventDefault(); });
      show();
      return show;
    }

    // activity, sober (already introduced on the sphere slides): cortex (top) and hippocampus
    // (bottom) with their names, replay up and error down (error thickness = interface error)
    buildPanel(svg) {
      const T = this.T, S = L.sizes, p = L.panel, id = this.id;
      const g = el("g", {}, svg);
      const ix = p.x + (p.w - p.img) / 2, mid = p.x + p.w / 2;
      this.digits = {};
      for (const [role, y0, name, above] of [["student", p.yS, "cortex", true],
                                             ["teacher", p.yT, "hippocampus", false]]) {
        const cp = el("clipPath", { id: `${id}-${role}-img` }, this.defs);
        el("rect", { x: ix, y: y0, width: p.img, height: p.img, rx: 12 }, cp);
        const img = el("image", { x: ix, y: y0, width: p.img, height: p.img, preserveAspectRatio: "none",
                                  "clip-path": `url(#${id}-${role}-img)`,
                                  style: "image-rendering: pixelated; image-rendering: crisp-edges" }, g);
        el("rect", { x: ix, y: y0, width: p.img, height: p.img, rx: 12, fill: "none", stroke: T[role],
                     "stroke-width": 3.5 }, g);
        const yName = above ? y0 - 22 : y0 + p.img + 46;
        el("text", { x: mid, y: yName, fill: T.ink, "font-size": S.panelLabel, "font-weight": 800,
                     "text-anchor": "middle" }, g).textContent = name;
        this.digits[role] = img;
      }
      // slim arrows: replay up (hippocampus -> cortex), prediction error down
      this.arrowTop = p.yS + p.img + 18;
      this.arrowBot = p.yT - 18;
      this.xReplay = mid - 34;
      this.xError = mid + 34;
      this.replay = el("path", { fill: T.drive, d: arrowPath(this.xReplay, this.arrowBot, this.arrowTop, 6, 22, 20) }, g);
      this.error = el("path", { fill: T.error }, g);
    }

    paintDigit(img, arr, offset) {
      const n = this.d.side;
      if (!this.cv) {
        this.cv = document.createElement("canvas");
        this.cv.width = this.cv.height = n;
        this.ctx = this.cv.getContext("2d");
        this.imgData = this.ctx.createImageData(n, n);
      }
      const px = this.imgData.data;
      for (let c = 0; c < n * n; c++) {
        const rgb = this.digLut[arr ? arr[offset + c] + 127 : 127];
        px[4 * c] = rgb[0]; px[4 * c + 1] = rgb[1]; px[4 * c + 2] = rgb[2]; px[4 * c + 3] = 255;
      }
      this.ctx.putImageData(this.imgData, 0, 0);
      img.setAttribute("href", this.cv.toDataURL());
    }

    // the memory map: 2-D layout of the hippocampal memory sphere (SMACOF, distances approximate)
    buildMap(svg) {
      const T = this.T, S = L.sizes, m = L.map, d = this.d, P = this.P;
      const span = 2 * (1 + 2 * m.pad);
      this.mscale = Math.min(m.x1 - m.x0, m.y1 - m.y0) / span;
      this.mcx = (m.x0 + m.x1) / 2;
      this.mcy = (m.y0 + m.y1) / 2;
      const g = el("g", {}, svg);

      // this stage's climb, faint (the wandering after it would scribble over the map)
      this.past = el("polyline", { fill: "none", stroke: T.teacher, "stroke-width": 3, "stroke-opacity": 0.3,
                                   "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
      const tg = el("g", { "stroke-linecap": "round" }, g);
      this.trail = [];
      for (let n = 0; n < 220; n++) this.trail.push(el("line", { stroke: T.teacher, visibility: "hidden" }, tg));

      // memories: dot coloured by its free energy, number
      this.mem = [];
      const centre = d.map.centre;
      for (let j = 0; j < P; j++) {
        const [mx, my] = d.map.mem[j];
        const x = this.mapX(mx), y = this.mapY(my);
        let ux = mx - centre[0], uy = my - centre[1];
        const n = Math.hypot(ux, uy) || 1;
        ux /= n; uy /= n;
        const dot = el("circle", { cx: x, cy: y, r: S.mem, stroke: T.dotStroke, "stroke-width": 3.5, opacity: 0 }, g);
        const label = el("text", { x: x + S.memLabelOff * ux, y: y - S.memLabelOff * uy, fill: T.ink,
                                   "font-size": S.memLabel, "font-weight": 800, "text-anchor": "middle",
                                   "dominant-baseline": "central", opacity: 0 }, g);
        label.textContent = d.labels[j];
        this.mem.push({ x, y, dot, label });
      }

      // F_max state (ring) and replay's link to it, then replay itself on top
      this.link = el("line", { stroke: T.fe, "stroke-width": 4, "stroke-dasharray": "12 10",
                               "stroke-linecap": "round", opacity: 0 }, g);
      this.ring = el("circle", { r: S.ring, fill: T.fe, "fill-opacity": 0.12, stroke: T.fe,
                                 "stroke-width": 6, opacity: 0 }, g);
      this.teacher = el("circle", { r: S.teacher, fill: T.teacher, stroke: T.teacherStroke,
                                    "stroke-width": 3.5, opacity: 0 }, g);
    }

    // legend, right column under a rule (as the notes of the other results slides)
    buildSide(svg) {
      const T = this.T, S = L.sizes, x = L.side.x, id = this.id;
      const g = el("g", {}, svg);
      let y = L.side.y;
      el("line", { x1: x, x2: L.side.right, y1: y, y2: y, stroke: T.axis, "stroke-width": 1.5, "stroke-opacity": 0.5 }, g);
      y += 46;
      el("circle", { cx: x + 24, cy: y, r: S.teacher, fill: T.teacher, stroke: T.teacherStroke, "stroke-width": 3.5 }, g);
      el("text", { x: x + 62, y, fill: T.ink, "font-size": S.legend, "font-weight": 700,
                   "dominant-baseline": "central" }, g).textContent = "replay";
      y += 64;
      el("circle", { cx: x + 24, cy: y, r: 23, fill: T.fe, "fill-opacity": 0.12, stroke: T.fe, "stroke-width": 5 }, g);
      fmax(el("text", { x: x + 62, y: y + 8, fill: T.ink, "font-size": S.legend, "font-weight": 700 }, g),
           S.legend + 4, " state");
      el("text", { x: x + 62, y: y + 46, fill: T.soft, "font-size": S.define, "font-weight": 600 }, g)
        .textContent = "the pattern the cortex explains worst";
      y += 98;
      el("circle", { cx: x + 24, cy: y, r: S.mem - 4, fill: T.fe, stroke: T.dotStroke, "stroke-width": 3 }, g);
      const t = el("text", { x: x + 62, y, fill: T.ink, "font-size": S.legend, "font-weight": 700,
                             "dominant-baseline": "central" }, g);
      el("tspan", {}, t).textContent = "memory, by its free energy ";
      el("tspan", { "font-family": '"KaTeX_Math", "Times New Roman", serif', "font-style": "italic",
                    "font-size": S.legend + 4, "font-weight": 400 }, t).textContent = "q";
      const yb = y + 44, bw = 150;
      const l0 = el("text", { x: x + 62, y: yb, fill: T.soft, "font-size": S.define, "font-weight": 700,
                              "dominant-baseline": "central" }, g);
      l0.textContent = "learned";
      el("rect", { x: x + 168, y: yb - 7, width: bw, height: 14, rx: 7, fill: `url(#${id}-fe)` }, g);
      el("text", { x: x + 168 + bw + 14, y: yb, fill: T.soft, "font-size": S.define, "font-weight": 700,
                   "dominant-baseline": "central" }, g).textContent = "new";
    }

    // status, top right: memory being added / cortical plasticity OFF / cortex learning
    buildBadge(svg) {
      const S = L.sizes, b = L.badge, g = el("g", {}, svg);
      this.badgeRect = el("rect", { x: b.x - b.w / 2, y: b.y - b.h / 2, width: b.w, height: b.h, rx: b.h / 2,
                                    opacity: 0 }, g);
      this.badgeRect.style.transition = "fill 0.35s ease";
      this.badgeText = el("text", { x: b.x, y: b.y + 1, "font-size": S.badge, "font-weight": 800,
                                    "text-anchor": "middle", "dominant-baseline": "central", opacity: 0 }, g);
    }

    // F_max over the whole run (right, as the time plots of the other results slides), revealed as
    // it plays: numbered marker when each memory arrives (same numbers as the map), amber bands =
    // cortical plasticity OFF, current stage shaded
    buildPlot(svg) {
      const T = this.T, S = L.sizes, p = L.plot, d = this.d, r = d.rec, P = this.P, id = this.id;
      const g = el("g", {}, svg);
      this.fTop = d.F_peak * 1.1;
      const title = el("text", { x: L.side.x, y: p.y0 - 78, fill: T.ink, "font-size": S.plotTitle, "font-weight": 800 }, g);
      el("tspan", {}, title).textContent = "largest free energy ";
      fmax(title, S.plotTitle + 2);
      const starts = [0, ...d.events], ends = [...d.events, d.n_steps];
      this.chapters = [];
      for (let j = 0; j < P; j++) {
        const x0 = this.plotX(starts[j]), x1 = this.plotX(ends[j]);
        const bg = el("rect", { x: x0, y: p.y0 - 8, width: x1 - x0, height: p.y1 - p.y0 + 8, fill: T.now,
                                "fill-opacity": T.nowAlpha, opacity: 0 }, g);
        el("rect", { x: x0, y: p.y0 - 8, width: this.plotX(starts[j] + d.plasticity_off) - x0,
                     height: p.y1 - p.y0 + 8, fill: T.off, opacity: T.offAlpha }, g);
        el("line", { x1: x0, x2: x0, y1: p.y0 - 16, y2: p.y1, stroke: T.ink, "stroke-width": 2.5,
                     "stroke-dasharray": "2 7", "stroke-linecap": "round", "stroke-opacity": 0.6 }, g);
        const mk = el("g", { opacity: 0 }, g);
        el("circle", { cx: x0, cy: p.y0 - 32, r: 15, fill: T.ink }, mk);
        el("text", { x: x0, y: p.y0 - 31, fill: T.bg, "font-size": S.marker, "font-weight": 800,
                     "text-anchor": "middle", "dominant-baseline": "central" }, mk).textContent = d.labels[j];
        this.chapters.push({ bg, mk });
      }
      for (const v of [0, 0.1]) {
        const y = this.yF(v);
        if (v > 0) el("line", { x1: p.x0, x2: p.x1, y1: y, y2: y, stroke: T.axis, "stroke-width": 1.5, "stroke-opacity": 0.35 }, g);
        el("text", { x: p.x0 - 18, y, fill: T.soft, "font-size": S.tick, "font-weight": 700, "text-anchor": "end",
                     "dominant-baseline": "central" }, g).textContent = String(v);
      }
      for (let s = 0; s <= d.n_steps; s += 20000) {
        const x = this.plotX(s);
        el("line", { x1: x, x2: x, y1: p.y1, y2: p.y1 + 10, stroke: T.axis, "stroke-width": 3 }, g);
        el("text", { x, y: p.y1 + 44, fill: T.soft, "font-size": S.tick, "font-weight": 700,
                     "text-anchor": "middle" }, g).textContent = String(s / 1000);
      }
      const xl = el("text", { x: (p.x0 + p.x1) / 2, y: p.y1 + 88, fill: T.ink, "font-size": S.axisLabel,
                              "font-weight": 700, "text-anchor": "middle" }, g);
      xl.textContent = "time (×10";
      el("tspan", { "font-size": S.axisLabel * 0.65, dy: -12 }, xl).textContent = "3";
      el("tspan", { dy: 12 }, xl).textContent = ")";
      el("path", { d: `M${p.x0},${p.y0 - 10} L${p.x0},${p.y1} L${p.x1},${p.y1}`, fill: "none",
                   stroke: T.axis, "stroke-width": 3 }, g);

      // the curve, revealed up to now through the clip
      const cg = el("g", { "clip-path": `url(#${id}-clip)` }, g);
      let fl = "";
      for (let i = 0; i < this.N; i++) fl += `${i ? "L" : "M"}${this.plotX(r.step[i]).toFixed(1)},${this.yF(r.F[i]).toFixed(1)}`;
      el("path", { d: `${fl} L${this.plotX(r.step[this.N - 1])},${p.y1} L${p.x0},${p.y1} Z`,
                   fill: `url(#${id}-area)` }, cg);
      el("path", { d: fl, fill: "none", stroke: T.fe, "stroke-width": 4.5, "stroke-linejoin": "round" }, cg);
      this.cursor = el("line", { y1: p.y0 - 8, y2: p.y1, stroke: T.ink, "stroke-width": 2.5, opacity: 0 }, g);
      this.dotF = el("circle", { r: 10, fill: T.fe, stroke: T.bg, "stroke-width": 4, opacity: 0 }, g);
    }

    // ---------- playback ----------
    // simulation steps per second at `rel` steps after a memory was added (log-smoothed phases)
    speedAt(rel) {
      const { bounds, speeds } = this.d.pacing, w = this.opts.blend;
      let lg = Math.log(speeds[0]);
      for (let m = 0; m < bounds.length; m++) {
        const up = speeds[m + 1] > speeds[m];
        const c = bounds[m] + (up ? w[m] / 2 : -w[m] / 2);   // slow phases stay fully slow
        lg += (Math.log(speeds[m + 1]) - Math.log(speeds[m])) * smooth01((rel - c) / w[m] + 0.5);
      }
      return Math.exp(lg);
    }

    // step n: 0 empty; for memory k, 3k - 2 just added, 3k - 1 climb played up to the end of
    // plasticity OFF (holds there), 3k rest of the stage played with plasticity on
    goTo(n, animate) {
      n = clamp(n, 0, this.steps);
      const k = Math.ceil(n / 3), sub = n - 3 * (k - 1);   // sub 1 added, 2 climb, 3 learn
      this.pos = n;
      this.k = k;
      this.phaseT = 0;
      this.autoWait = 0;
      if (sub === 1 || !animate) this.addT = animate ? 0 : 1e3;   // playing keeps the add clock
      if (k === 0) {
        this.phase = "empty";
        this.stepNow = 0;
        return this.render();
      }
      const step = this.d.rec.step, [a, b] = this.ranges[k - 1];
      // just before plasticity resumes (the record at that step may already be plastic)
      const resume = step[a] + this.d.plasticity_off - 1;
      if (sub === 1) {
        this.phase = "added";
        this.stepNow = step[a];
      } else if (sub === 2) {
        this.phase = animate ? "play" : "held";
        this.stepNow = animate ? step[a] : resume;
        this.stopAt = resume;
      } else {
        this.phase = animate ? "play" : "done";
        this.stepNow = animate ? resume : step[b];
        this.stopAt = step[b];
      }
      this.render();
    }
    next() { if (this.pos < this.steps) this.goTo(this.pos + 1, true); }
    prev() { this.goTo(this.pos - 1, false); }
    reset() { this.goTo(0, false); }
    setSpeed(x) { this.opts.speed = clamp(x, 0.25, 4); if (this.showSpeed) this.showSpeed(); }
    setTheme(t) { this.opts.theme = t; this.lastDigit = -2; this.build(); this.render(); }
    setAutoplay(on) { this.opts.autoplay = on; this.autoWait = 0; if (on && this.phase === "empty") this.next(); }

    activate() {
      if (this.active) return;
      this.active = true;
      this.lastTs = null;
      const tick = (ts) => {
        if (!this.active) return;
        const dt = this.lastTs == null ? 0 : Math.min(0.05, (ts - this.lastTs) / 1000);
        this.lastTs = ts;
        this.advance(dt);
        this.render();
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
    deactivate() { this.active = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; }

    advance(dt) {
      this.wall += dt;
      this.addT += dt;
      this.phaseT += dt;
      const step = this.d.rec.step;
      if (this.phase === "play") {
        const start = step[this.ranges[this.k - 1][0]], end = this.stopAt;
        const ramp = 0.05 + 0.95 * smooth01(this.phaseT / 0.4);
        const tail = 0.15 + 0.85 * smooth01((end - this.stepNow) / 2500);
        const v = this.speedAt(this.stepNow - start) * ramp * tail;
        this.stepNow = Math.min(end, this.stepNow + v * this.opts.speed * dt);
        if (this.stepNow >= end) {
          this.phase = this.pos % 3 === 2 ? "held" : "done";
          this.phaseT = 0;
        }
      } else if (["added", "held", "done"].includes(this.phase) && this.opts.autoplay) {
        this.autoWait += dt;
        if (this.autoWait > this.opts.autoDelay) {
          if (this.pos < this.steps) this.next();
          else if (this.opts.loop && this.autoWait > this.opts.autoDelay + 3) this.goTo(1, true);
        }
      }
    }

    // last record index in [a, b] with step <= s
    locate(s, a, b) {
      const st = this.d.rec.step;
      let lo = a, hi = b;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (st[mid] <= s) lo = mid; else hi = mid - 1; }
      const j = Math.min(lo + 1, b);
      const f = j > lo && st[j] > st[lo] ? clamp((s - st[lo]) / (st[j] - st[lo]), 0, 1) : 0;
      return [lo, j, f];
    }

    // ---------- one frame ----------
    render() {
      const T = this.T, S = L.sizes, d = this.d, r = d.rec, P = this.P, k = this.k;
      const show = (e, o) => e.setAttribute("opacity", o);
      // plot chapters: current stage shaded; a memory's marker shows once it has arrived
      this.chapters.forEach((c, j) => {
        c.bg.setAttribute("opacity", j === k - 1 ? 1 : 0);
        c.mk.setAttribute("opacity", j < k ? 1 : 0.25);
      });

      if (k === 0) {
        for (const m of this.mem) { show(m.dot, 0); show(m.label, 0); }
        for (const e of [this.teacher, this.ring, this.link, this.past, this.cursor, this.dotF,
                         this.badgeRect, this.badgeText]) show(e, 0);
        for (const l of this.trail) l.setAttribute("visibility", "hidden");
        this.clipRect.setAttribute("width", 0);
        this.drawDigits(-1, 0);
        return;
      }

      const [a, b] = this.ranges[k - 1];
      const [i, j, f] = this.locate(this.stepNow, a, b);
      const lerp = (arr) => arr[i] + (arr[j] - arr[i]) * f;
      const peak = d.F_peak;

      // memories acquired so far, coloured by their free energy; the new one fades in
      for (let m = 0; m < P; m++) {
        const M = this.mem[m];
        if (m >= k) { show(M.dot, 0); show(M.label, 0); continue; }
        const q = clamp((r.q[i * P + m] + (r.q[j * P + m] - r.q[i * P + m]) * f) / peak, 0, 1);
        M.dot.setAttribute("fill", css(this.feLut[Math.round(q * 255)]));
        const inA = m === k - 1 ? smooth01(this.addT / 0.35) : 1;
        M.dot.setAttribute("r", (S.mem * (0.6 + 0.4 * inA)).toFixed(2));
        show(M.dot, inA.toFixed(3));
        show(M.label, inA.toFixed(3));
      }

      // replay: faint route of this stage's climb (plasticity OFF only), tapered trail, dot
      const tx = this.mapX(lerp(r.tx)), ty = this.mapY(lerp(r.ty));
      const climbEnd = this.locate(r.step[a] + d.plasticity_off, a, b)[0];
      let pts = "";
      for (let n = a; n <= Math.min(i, climbEnd); n++)
        pts += `${this.mapX(r.tx[n]).toFixed(1)},${this.mapY(r.ty[n]).toFixed(1)} `;
      this.past.setAttribute("points", i < climbEnd ? `${pts}${tx.toFixed(1)},${ty.toFixed(1)}` : pts);
      show(this.past, 1);
      const t0 = this.locate(this.stepNow - d.pacing.trail_steps, 0, i)[0];
      const xs = [], ys = [];
      for (let n = t0; n <= i; n++) { xs.push(this.mapX(r.tx[n])); ys.push(this.mapY(r.ty[n])); }
      xs.push(tx); ys.push(ty);
      const nseg = Math.min(xs.length - 1, this.trail.length);
      const off = xs.length - 1 - nseg;
      for (let n = 0; n < this.trail.length; n++) {
        const l = this.trail[n];
        if (n >= nseg) { l.setAttribute("visibility", "hidden"); continue; }
        const u = (n + 1) / nseg, fa = this.fast[Math.min(t0 + off + n + 1, i)];
        l.setAttribute("x1", xs[off + n]); l.setAttribute("y1", ys[off + n]);
        l.setAttribute("x2", xs[off + n + 1]); l.setAttribute("y2", ys[off + n + 1]);
        l.setAttribute("stroke-width", ((2 + 8 * u) * (1 - 0.72 * fa)).toFixed(2));
        l.setAttribute("stroke-opacity", ((0.04 + 0.8 * u * u) * (1 - 0.45 * fa)).toFixed(3));
        l.setAttribute("visibility", "visible");
      }
      this.teacher.setAttribute("cx", tx);
      this.teacher.setAttribute("cy", ty);
      show(this.teacher, 1);

      // F_max state and replay's link to it, fading as the cortex learns it
      // clearly visible above the threshold (lighter as F_max falls), fades out just above it
      const F = lerp(r.F), strength = clamp(F / peak, 0, 1), thr = this.opts.ring;
      let ringA = smooth01((strength - thr) / (0.5 * thr)) * (0.35 + 0.65 * strength);
      ringA *= smooth01(this.addT / 0.5);
      if (r.has_v[i] || r.has_v[j]) {
        const ia = r.has_v[i] ? i : j, ib = r.has_v[j] ? j : i;
        const vx = this.mapX(r.vx[ia] + (r.vx[ib] - r.vx[ia]) * f), vy = this.mapY(r.vy[ia] + (r.vy[ib] - r.vy[ia]) * f);
        const rr = S.ring * (0.85 + 0.2 * strength);
        this.ring.setAttribute("cx", vx); this.ring.setAttribute("cy", vy); this.ring.setAttribute("r", rr);
        // link stops at the ring's edge; dashes flow from replay towards the ring
        const dx = vx - tx, dy = vy - ty, dist = Math.hypot(dx, dy) || 1;
        const cut = Math.min(1, rr / dist);
        this.link.setAttribute("x1", tx); this.link.setAttribute("y1", ty);
        this.link.setAttribute("x2", vx - dx * cut); this.link.setAttribute("y2", vy - dy * cut);
        this.link.setAttribute("stroke-dashoffset", (-this.wall * 45).toFixed(1));
        show(this.ring, ringA.toFixed(3));
        show(this.link, (0.9 * ringA * smooth01((dist - rr) / 30)).toFixed(3));
      } else {
        show(this.ring, 0); show(this.link, 0);
      }

      // status badge
      const state = this.phase === "added" ? "add" : r.plastic[i] ? "learn" : "off";
      if (state !== this.badgeState || !this.badgeText.textContent) {
        this.badgeState = state;
        const [bg, ink] = T.badge[state];
        this.badgeRect.style.fill = bg;
        this.badgeText.setAttribute("fill", ink);
        this.badgeText.textContent = { add: "new memory", off: "cortex plasticity OFF", learn: "cortex learning" }[state];
      }
      show(this.badgeRect, 1); show(this.badgeText, 1);

      // plot revealed up to now, cursor and dot
      const cx = this.plotX(this.stepNow);
      this.clipRect.setAttribute("width", Math.max(0, cx - L.plot.x0 + 12));
      this.cursor.setAttribute("x1", cx); this.cursor.setAttribute("x2", cx);
      show(this.cursor, 0.45);
      this.dotF.setAttribute("cx", cx); this.dotF.setAttribute("cy", this.yF(F));
      show(this.dotF, 1);

      // digits and the error arrow (nearest record)
      this.drawDigits(f < 0.5 ? i : j, lerp(r.eps));
    }

    drawDigits(n, eps) {
      const e = clamp(eps, 0, 1);
      this.error.setAttribute("d", arrowPath(this.xError, this.arrowTop, this.arrowBot, 4 + 12 * e, 20 + 16 * e, 20 + 6 * e));
      this.error.setAttribute("opacity", n < 0 ? 0.25 : 1);
      this.replay.setAttribute("opacity", n < 0 ? 0.25 : 1);
      if (n === this.lastDigit) return;
      this.lastDigit = n;
      const sz = this.d.side * this.d.side;
      this.paintDigit(this.digits.teacher, n < 0 ? null : this.xT, n * sz);
      this.paintDigit(this.digits.student, n < 0 ? null : this.xS, n * sz);
    }
  }

  // ======================================================================
  // mounting + reveal.js integration

  function mount(elm) {
    if (elm._fmax) return elm._fmax;
    const name = elm.dataset.fmax || "fmax_tracking";
    const data = (window.TALK_DATA || {})[name];
    if (!data) {
      elm.textContent = `fmax-player: no data "${name}" (load media/interactive/${name}.data.js first)`;
      return null;
    }
    const player = new FmaxPlayer(elm, data, {
      theme: elm.dataset.theme || "light",
      speed: parseFloat(elm.dataset.speed || "1"),
      ring: parseFloat(elm.dataset.ring || String(RING_DEFAULT)),
      autoplay: "autoplay" in elm.dataset,
      loop: "loop" in elm.dataset,
      controls: elm.dataset.controls !== "none",
      title: elm.dataset.title !== "none",
    });
    elm._fmax = player;
    const section = elm.closest(".reveal section");
    if (section && elm.dataset.steps !== "none") {
      for (let n = 1; n <= player.steps; n++) {     // add memory, play its stage, ...
        const frag = document.createElement("span");
        frag.className = "fragment fmax-step";
        frag.dataset.fmaxStep = n;
        section.appendChild(frag);
      }
    } else if (!section) {
      player.activate();
      if (player.opts.autoplay) player.next();
    }
    return player;
  }

  function playersIn(slide) {
    return slide ? [...slide.querySelectorAll(".fmax-player")].map((e) => e._fmax).filter(Boolean) : [];
  }

  function hookReveal() {
    const R = window.Reveal;
    if (!R || !R.on || R._fmaxHooked) return;
    R._fmaxHooked = true;
    const enter = (slide) => {
      document.querySelectorAll(".fmax-player").forEach((e) => {
        if (e._fmax && !slide.contains(e)) e._fmax.deactivate();
      });
      for (const p of playersIn(slide)) {
        const shown = slide.querySelectorAll(".fmax-step.visible").length;
        p.goTo(shown, false);
        p.activate();
        if (p.opts.autoplay && shown === 0) p.next();
      }
    };
    R.on("ready", (e) => enter(e.currentSlide));
    R.on("slidechanged", (e) => enter(e.currentSlide));
    const step = (e, forward) => {
      for (const frag of e.fragments || [e.fragment]) {
        if (!frag || !frag.classList.contains("fmax-step")) continue;
        const n = +frag.dataset.fmaxStep;
        for (const p of playersIn(frag.closest("section"))) p.goTo(forward ? n : n - 1, forward);
      }
    };
    R.on("fragmentshown", (e) => step(e, true));
    R.on("fragmenthidden", (e) => step(e, false));
  }

  function mountAll() {
    document.querySelectorAll(".fmax-player").forEach(mount);
    hookReveal();
  }

  window.FmaxPlayer = FmaxPlayer;
  window.FmaxPlayer.mountAll = mountAll;

  // Mount what exists now (script at the end of <body>, before deck.js, so reveal sees the
  // fragments) and anything parsed later once the DOM is ready (mounting is idempotent).
  mountAll();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
})();
