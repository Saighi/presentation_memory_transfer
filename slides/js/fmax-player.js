// F_max tracking player: draws the run exported by talkviz/web_export.py (export_fmax) as an
// SVG animation, three clicks per new memory.
//
// Usage (deck or any page):
//   <script src="media/interactive/fmax_tracking.data.js"></script>
//   <div class="fmax-player" data-fmax="fmax_tracking" data-theme="dark"></div>
//   <script src="js/fmax-player.js"></script>      (before js/deck.js in the deck)
//
// Options (data attributes): data-theme="dark|light", data-speed="1" (multiplies the exported
// pacing; the speed slider overrides it and is remembered per browser), data-controls="none"
// (no slider), data-steps="none" (no reveal fragments, e.g. with data-autoplay), data-autoplay.
//
// Three steps per memory, each one invisible reveal fragment:
//   1. "next": the memory is added, frozen, with its new F_max state (ring) shown;
//   2. "next": the teacher climbs to F_max with student plasticity OFF, then holds just before
//      plasticity resumes;
//   3. "next": plasticity resumes, the student learns, the teacher wanders; holds on the last
//      frame of the stage until the next memory.
// "Previous" goes back one step (to the previous held state).
//
// Layout is in px of the deck canvas (1920x1080); the SVG scales to the slide and stays sharp.
// Colours mirror css/talk.css and talkviz/style.py (dark variants are slightly brighter).

(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const W = 1920, H = 1080;

  const THEMES = {
    dark: {
      bg: "#111316", ink: "#E8EAED", soft: "#A9AEB5", axis: "#5F6670",
      teacher: "#4A9BEA", student: "#EA6A3A", transfer: "#45B36B",
      badge: {
        add:   ["#D2402A", "#FFFFFF"],
        off:   ["#E4B94F", "#111316"],
        learn: ["#45B36B", "#111316"],
      },
      offBand: "#E4B94F", offBandAlpha: 0.2,
      memScale: ["#8E949C", "#EA6A3A"],   // stored grey -> new = the F_max trace orange
      memStroke: "#E8EAED",
      digit: ["#C9E4FF", "#5AA3F0", "#24548F", "#1A1D22", "#8F2F1E", "#E5603C", "#FFC2A6"],
      teacherStroke: "#FFFFFF",
    },
    light: {
      bg: "#FFFFFF", ink: "#23262D", soft: "#5F6670", axis: "#9AA0A6",
      teacher: "#378ADD", student: "#D85A30", transfer: "#3A9A5C",
      badge: {
        add:   ["#7A1F0E", "#FFFFFF"],
        off:   ["#E4B94F", "#23262D"],
        learn: ["#BFE3CB", "#23262D"],
      },
      offBand: "#E4B94F", offBandAlpha: 0.35,
      memScale: ["#9AA0A6", "#D85A30"],
      memStroke: "#23262D",
      digit: ["#053061", "#2166AC", "#92C5DE", "#F7F7F7", "#F4A582", "#B2182B", "#67001F"],
      teacherStroke: "#FFFFFF",
    },
  };

  const FONT = '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

  // layout, px at 1920x1080
  const L = {
    panel: { x: 30, w: 300, img: 232, yS: 128, yT: 640 },       // digit images (left)
    map: { x0: 380, x1: 1340, y0: 48, y1: 812, pad: 0.13 },     // main display
    side: { x: 1420 },                                           // right column: badge, legend
    badge: { x: 1640, y: 92, w: 460, h: 76 },
    plot: { x0: 440, x1: 1870, y0: 880, y1: 1000 },              // F_max timeline (y1 = axis)
    sizes: {
      mem: 19, teacher: 12, ring: 38, memLabel: 50, memLabelOff: 62,
      badge: 38, panelLabel: 38, title: 30, titleMath: 40, chapter: 30,
      tick: 28, legend: 29, legendMath: 36, cbarLabel: 28, define: 25,
    },
  };

  // ---------- small helpers ----------
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOutBack = (t) => { t = clamp(t, 0, 1); const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

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

  // n colours evenly through equally spaced stops
  function lut(stops, n) {
    const rgb = stops.map(hexToRgb), out = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * (rgb.length - 1);
      const j = Math.min(Math.floor(t), rgb.length - 2), f = t - j;
      const c = rgb[j].map((v, m) => Math.round(v + (rgb[j + 1][m] - v) * f));
      out[i] = `rgb(${c[0]},${c[1]},${c[2]})`;
    }
    return out;
  }

  function b64ToInt8(s) {
    const bin = atob(s), a = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = (bin.charCodeAt(i) << 24) >> 24;
    return a;
  }

  // "F_max" as italic F + subscript, optionally followed by plain words
  function fmaxText(parent, x, y, size, mathSize, color, anchor, before, after) {
    const t = el("text", { x, y, fill: color, "font-size": size, "font-weight": 700,
                           "text-anchor": anchor }, parent);
    if (before) el("tspan", {}, t).textContent = before;
    el("tspan", { "font-size": mathSize, "font-style": "italic" }, t).textContent = "F";
    const sub = Math.round(mathSize * 0.62), drop = Math.round(mathSize * 0.22);
    el("tspan", { "font-size": sub, dy: drop }, t).textContent = "max";
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

  // ======================================================================
  class FmaxPlayer {
    constructor(root, data, opts = {}) {
      this.root = root;
      this.d = data;
      this.id = `fp${instances++}`;
      this.opts = Object.assign({ theme: "dark", speed: 1, autoplay: false, loop: false,
                                  controls: true, blend: [160, 600, 1200], autoDelay: 1.5 }, opts);
      if (this.opts.controls) {   // speed set on the slider in a previous session
        try { const s = parseFloat(localStorage.getItem("fmax-speed")); if (s > 0) this.opts.speed = s; } catch (e) { /* no storage */ }
      }
      const r = data.rec, P = data.n_memories;
      this.P = P;
      this.N = data.n_records;
      this.xT = b64ToInt8(data.digits.x_T);
      this.xS = b64ToInt8(data.digits.x_S);
      // record range of each stage (records with `active` = s + 1 are contiguous)
      this.ranges = [];
      for (let s = 0; s < P; s++) {
        const a = r.active.indexOf(s + 1), b = r.active.lastIndexOf(s + 1);
        this.ranges.push([a, b]);
      }
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
      this.phase = "empty";     // empty | added (frozen) | play | done
      this.stepNow = 0;
      this.phaseT = 0;
      this.addT = 0;            // seconds since the current memory was added (pop-in, ring fade-in)
      this.wall = 0;
      this.active = false;
      this.raf = null;
      this.lastDigit = -1;
      this.build();
      this.render();
    }

    // ---------- geometry ----------
    mapX(x) { return this.mcx + x * this.mscale; }
    mapY(y) { return this.mcy - y * this.mscale; }
    plotX(step) { const p = L.plot; return p.x0 + (step / this.xMax) * (p.x1 - p.x0); }
    plotY(F) { const p = L.plot; return p.y1 - (F / (this.d.F_peak * 1.1)) * (p.y1 - p.y0); }

    // ---------- DOM ----------
    build() {
      const T = (this.T = THEMES[this.opts.theme] || THEMES.dark), d = this.d, S = L.sizes;
      const id = this.id, P = this.P;
      this.root.innerHTML = "";
      this.root.dataset.theme = this.opts.theme;
      this.root.style.background = T.bg;
      const svg = (this.svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet",
                                          "font-family": FONT, role: "img",
                                          "aria-label": "Teacher activity tracking the largest student free energy" },
                                 this.root));
      this.memLut = lut(T.memScale, 256);
      this.digLut = lut(T.digit, 255);

      // ---- defs ----
      const defs = el("defs", {}, svg);
      for (const [name, sd] of [["soft", 5]]) {
        const f = el("filter", { id: `${id}-${name}`, x: "-150%", y: "-150%", width: "400%", height: "400%" }, defs);
        el("feGaussianBlur", { stdDeviation: sd }, f);
      }
      const cg = el("linearGradient", { id: `${id}-cbar`, x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
      T.memScale.forEach((c, i) => el("stop", { offset: i / (T.memScale.length - 1), "stop-color": c }, cg));
      const ag = el("linearGradient", { id: `${id}-area`, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
      el("stop", { offset: 0, "stop-color": T.student, "stop-opacity": 0.45 }, ag);
      el("stop", { offset: 1, "stop-color": T.student, "stop-opacity": 0.02 }, ag);
      const clip = el("clipPath", { id: `${id}-clip` }, defs);
      this.clipRect = el("rect", { x: L.plot.x0 - 12, y: L.plot.y0 - 60, width: 0, height: L.plot.y1 - L.plot.y0 + 70 }, clip);

      el("rect", { x: 0, y: 0, width: W, height: H, fill: T.bg }, svg);

      this.buildPanel(svg);
      this.buildMap(svg);
      this.buildSide(svg);
      this.buildTimeline(svg);
      if (this.opts.controls) this.buildControls();
    }

    // speed slider (HTML over the SVG, right column under the legend): faint until hovered,
    // log scale 0.25x-4x. Placed in cqw (1cqw = 19.2 canvas px) so it scales with the SVG.
    buildControls() {
      const T = this.T, root = this.root;
      root.style.setProperty("--fp-ink", T.ink);
      root.style.setProperty("--fp-soft", T.soft);
      root.style.setProperty("--fp-accent", T.teacher);
      const box = document.createElement("div");
      box.className = "fp-speed";
      box.style.left = `${L.side.x / 19.2 - 0.9}cqw`;    // pill padding: text lines up with the legend
      box.style.top = `${750 / 19.2}cqw`;
      box.innerHTML = '<span class="fp-speed-label">speed</span>' +
        '<input type="range" min="-2" max="2" step="0.01" tabindex="-1" aria-label="animation speed">' +
        '<output class="fp-speed-value"></output>';
      root.appendChild(box);
      const input = box.querySelector("input"), out = box.querySelector("output");
      const show = () => {
        const s = this.opts.speed;
        input.value = Math.log2(s);
        input.style.setProperty("--fp-fill", `${((Math.log2(s) + 2) / 4) * 100}%`);
        out.textContent = `${s < 1 ? s.toFixed(2) : s.toFixed(1)}×`;
      };
      input.addEventListener("input", () => {
        let v = parseFloat(input.value);
        if (Math.abs(v) < 0.08) v = 0;                  // snap to 1x
        this.setSpeed(2 ** v);
        try { localStorage.setItem("fmax-speed", String(this.opts.speed)); } catch (e) { /* no storage */ }
        show();
      });
      input.addEventListener("dblclick", () => { input.value = 0; input.dispatchEvent(new Event("input")); });
      // give the arrow keys back to the slides as soon as the slider is released
      for (const ev of ["pointerup", "change"]) input.addEventListener(ev, () => input.blur());
      input.addEventListener("keydown", (e) => { input.blur(); e.preventDefault(); });
      this.showSpeed = show;
      show();
    }

    buildPanel(svg) {
      const T = this.T, S = L.sizes, p = L.panel, side = this.d.side;
      const g = el("g", {}, svg);
      const ix = p.x + (p.w - p.img) / 2, cell = p.img / side;
      this.digits = {};
      for (const [role, y0, words, above] of [["student", p.yS, ["cortex", "(student)"], true],
                                              ["teacher", p.yT, ["hippocampus", "(teacher)"], false]]) {
        const cells = [];
        for (let r = 0; r < side; r++)
          for (let c = 0; c < side; c++)
            cells.push(el("rect", { x: ix + c * cell, y: y0 + r * cell, width: cell + 0.6, height: cell + 0.6,
                                    fill: this.digLut[127] }, g));
        const frame = el("rect", { x: ix - 4, y: y0 - 4, width: p.img + 8, height: p.img + 8, rx: 6,
                                   fill: "none", stroke: T[role], "stroke-width": 8 }, g);
        const lh = S.panelLabel * 1.1;
        const ly = above ? y0 - 22 - lh : y0 + p.img + 22 + S.panelLabel * 0.8;
        words.forEach((w, n) => {
          el("text", { x: p.x + p.w / 2, y: ly + n * lh, fill: T[role], "font-size": S.panelLabel,
                       "font-weight": 700, "text-anchor": "middle" }, g).textContent = w;
        });
        this.digits[role] = { cells, frame };
      }
      // replay (teacher -> student) and prediction error (student -> teacher) arrows
      this.arrowTop = p.yS + p.img + 30;
      this.arrowBot = p.yT - 30;
      this.replay = el("path", { fill: T.teacher,
                                 d: arrowPath(p.x + p.w * 0.3, this.arrowBot, this.arrowTop, 12, 40, 36) }, g);
      this.error = el("path", { fill: T.student }, g);
    }

    buildMap(svg) {
      const T = this.T, S = L.sizes, m = L.map, d = this.d, P = this.P, id = this.id;
      // fit [-1, 1] plus room for the labels into the map box, equal aspect
      const span = 2 * (1 + 2 * m.pad);
      this.mscale = Math.min(m.x1 - m.x0, m.y1 - m.y0) / span;
      this.mcx = (m.x0 + m.x1) / 2;
      this.mcy = (m.y0 + m.y1) / 2;
      const g = (this.mapG = el("g", {}, svg));

      this.past = el("polyline", { fill: "none", stroke: T.teacher, "stroke-width": 3, "stroke-opacity": 0.28,
                                   "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
      const tg = el("g", { "stroke-linecap": "round" }, g);
      this.trail = [];
      for (let n = 0; n < 220; n++) this.trail.push(el("line", { stroke: T.teacher, visibility: "hidden" }, tg));

      // memories: dot, label
      this.mem = [];
      const centre = d.map.centre;
      for (let j = 0; j < P; j++) {
        const [mx, my] = d.map.mem[j];
        const x = this.mapX(mx), y = this.mapY(my);
        let ux = mx - centre[0], uy = my - centre[1];
        const n = Math.hypot(ux, uy) || 1;
        ux /= n; uy /= n;
        const dot = el("circle", { cx: x, cy: y, r: S.mem, stroke: T.memStroke, "stroke-width": 3,
                                   fill: this.memLut[0], opacity: 0 }, g);
        const label = el("text", { x: x + S.memLabelOff * ux, y: y - S.memLabelOff * uy, fill: T.ink,
                                   "font-size": S.memLabel, "font-weight": 800, "text-anchor": "middle",
                                   "dominant-baseline": "central", opacity: 0 }, g);
        label.textContent = d.labels[j];
        this.mem.push({ x, y, dot, label });
      }

      // F_max state, the teacher's link to it, and the teacher
      this.link = el("line", { stroke: T.transfer, "stroke-width": 5, "stroke-dasharray": "16 12",
                               "stroke-linecap": "round", opacity: 0 }, g);
      this.ringGlow = el("circle", { r: S.ring, fill: "none", stroke: T.transfer, "stroke-width": 14,
                                     filter: `url(#${id}-soft)`, opacity: 0 }, g);
      this.ring = el("circle", { r: S.ring, fill: T.transfer, "fill-opacity": 0.1, stroke: T.transfer,
                                 "stroke-width": 8, opacity: 0 }, g);
      // smaller than a memory dot, so the memory stays visible around it when the teacher sits on it
      this.teacher = el("circle", { r: S.teacher, fill: T.teacher, stroke: T.teacherStroke,
                                    "stroke-width": 3, opacity: 0 }, g);
    }

    // right column: status badge, then the legend of the map, then the map's caveat
    buildSide(svg) {
      const T = this.T, S = L.sizes, c = L.side, b = L.badge, id = this.id;
      const g = el("g", {}, svg);
      this.badgeRect = el("rect", { x: b.x - b.w / 2, y: b.y - b.h / 2, width: b.w, height: b.h, rx: 24,
                                    opacity: 0 }, g);
      this.badgeRect.style.transition = "fill 0.35s ease";
      this.badgeText = el("text", { x: b.x, y: b.y, "font-size": S.badge, "font-weight": 800,
                                    "text-anchor": "middle", "dominant-baseline": "central", opacity: 0 }, g);

      const x = c.x, cb = { y: 272, w: 400, h: 28 };
      el("text", { x, y: 252, fill: T.ink, "font-size": S.cbarLabel, "font-weight": 700 }, g)
        .textContent = "memory's free energy";
      el("rect", { x, y: cb.y, width: cb.w, height: cb.h, rx: 6, fill: `url(#${id}-cbar)`,
                   stroke: T.soft, "stroke-width": 1.5 }, g);
      for (const [xx, a, w] of [[x, "start", "stored"], [x + cb.w, "end", "new"]])
        el("text", { x: xx, y: cb.y + cb.h + 36, fill: T.soft, "font-size": 26, "font-weight": 700,
                     "text-anchor": a }, g).textContent = w;

      el("circle", { cx: x + 25, cy: 420, r: S.teacher, fill: T.teacher, stroke: T.teacherStroke,
                     "stroke-width": 3 }, g);
      el("text", { x: x + 62, y: 420, fill: T.ink, "font-size": S.legend, "font-weight": 700,
                   "dominant-baseline": "central" }, g).textContent = "teacher";
      el("circle", { cx: x + 25, cy: 495, r: 23, fill: T.transfer, "fill-opacity": 0.1, stroke: T.transfer,
                     "stroke-width": 6 }, g);
      fmaxText(g, x + 62, 505, S.legend, S.legendMath, T.ink, "start", "", " state");
      // what the F_max state is, under its marker
      ["of all patterns the hippocampus", "can replay, the one the cortex", "explains worst"].forEach((t, n) => {
        el("text", { x: x + 62, y: 548 + n * S.define * 1.3, fill: T.soft, "font-size": S.define,
                     "font-weight": 600 }, g).textContent = t;
      });
    }

    // bottom strip: F_max over the whole run, one chapter per memory, revealed as it plays
    buildTimeline(svg) {
      const T = this.T, S = L.sizes, p = L.plot, d = this.d, id = this.id, r = d.rec, P = this.P;
      const g = el("g", {}, svg);
      this.xMax = d.n_steps;
      const starts = [0, ...d.events], ends = [...d.events, d.n_steps];

      fmaxText(g, p.x0, p.y0 - 26, S.title, S.titleMath, T.ink, "start", "largest student free energy ", "");
      this.chapters = [];
      for (let j = 0; j < P; j++) {
        const x0 = this.plotX(starts[j]), x1 = this.plotX(ends[j]);
        const bg = el("rect", { x: x0, y: p.y0 - 8, width: x1 - x0, height: p.y1 - p.y0 + 8,
                                fill: T.ink, "fill-opacity": 0.07, opacity: 0 }, g);
        el("rect", { x: x0, y: p.y0 - 8, width: this.plotX(starts[j] + d.plasticity_off) - x0,
                     height: p.y1 - p.y0 + 8, fill: T.offBand, opacity: T.offBandAlpha }, g);
        if (j > 0) el("line", { x1: x0, x2: x0, y1: p.y0 - 8, y2: p.y1 + 12, stroke: T.axis, "stroke-width": 2,
                                "stroke-dasharray": "4 6" }, g);
        const label = el("text", { x: (x0 + x1) / 2, y: p.y1 + 46, "font-size": S.chapter, "font-weight": 800,
                                   "text-anchor": "middle" }, g);
        label.textContent = `memory ${d.labels[j]}`;
        this.chapters.push({ bg, label });
      }
      el("path", { d: `M${p.x0},${p.y0 - 8} L${p.x0},${p.y1} L${p.x1},${p.y1}`, fill: "none",
                   stroke: T.axis, "stroke-width": 3 }, g);
      for (const F of [0, d.F_peak]) {
        const y = this.plotY(F);
        el("line", { x1: p.x0 - 10, x2: p.x0, y1: y, y2: y, stroke: T.axis, "stroke-width": 3 }, g);
        el("text", { x: p.x0 - 18, y, fill: T.soft, "font-size": S.tick, "font-weight": 700,
                     "text-anchor": "end", "dominant-baseline": "central" }, g).textContent = F.toFixed(2);
      }

      let line = "";
      for (let i = 0; i < this.N; i++)
        line += `${i ? "L" : "M"}${this.plotX(r.step[i]).toFixed(1)},${this.plotY(r.F[i]).toFixed(1)}`;
      const cg = el("g", { "clip-path": `url(#${id}-clip)` }, g);
      el("path", { d: `${line} L${this.plotX(r.step[this.N - 1])},${p.y1} L${p.x0},${p.y1} Z`,
                   fill: `url(#${id}-area)` }, cg);
      el("path", { d: line, fill: "none", stroke: T.student, "stroke-width": 5, "stroke-linejoin": "round" }, cg);
      this.cursor = el("line", { y1: p.y0 - 8, y2: p.y1, stroke: T.ink, "stroke-width": 3, opacity: 0 }, g);
      this.cursorDot = el("circle", { r: 10, fill: T.student, stroke: T.bg, "stroke-width": 4, opacity: 0 }, g);
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

    // step n: 0 empty; for memory k, 3k - 2 just added (frozen), 3k - 1 climb played up to the
    // end of plasticity OFF (holds there), 3k rest of the stage played with plasticity on
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
    setTheme(t) { this.opts.theme = t; this.lastDigit = -1; this.build(); this.render(); }
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
      // timeline chapters: current one shaded and in ink, past ones soft, future ones faint
      this.chapters.forEach((c, j) => {
        c.bg.setAttribute("opacity", j === k - 1 ? 1 : 0);
        c.label.setAttribute("fill", j === k - 1 ? T.ink : T.soft);
        c.label.setAttribute("opacity", j < k ? 1 : 0.35);
      });

      if (k === 0) {
        for (const m of this.mem) { show(m.dot, 0); show(m.label, 0); }
        for (const e of [this.teacher, this.ring, this.ringGlow, this.link, this.past,
                         this.cursor, this.cursorDot, this.badgeRect, this.badgeText]) show(e, 0);
        for (const l of this.trail) l.setAttribute("visibility", "hidden");
        this.clipRect.setAttribute("width", 0);
        this.drawDigits(-1, 0);
        return;
      }

      const [a, b] = this.ranges[k - 1];
      const [i, j, f] = this.locate(this.stepNow, a, b);
      const lerp = (arr) => arr[i] + (arr[j] - arr[i]) * f;

      // memories: acquired ones, coloured by their free energy; the new one pops in
      const peak = d.F_peak;
      for (let m = 0; m < P; m++) {
        const M = this.mem[m];
        if (m >= k) { show(M.dot, 0); show(M.label, 0); continue; }
        const q = clamp((r.q[i * P + m] + (r.q[j * P + m] - r.q[i * P + m]) * f) / peak, 0, 1);
        const col = this.memLut[Math.round(q * 255)];
        let scale = 1;
        if (m === k - 1) scale = easeOutBack(this.addT / 0.45) * (1 + 0.55 * Math.exp(-this.addT / 0.7));
        M.dot.setAttribute("r", (S.mem * Math.max(scale, 0)).toFixed(2));
        M.dot.setAttribute("fill", col);
        show(M.dot, 1);
        show(M.label, m === k - 1 ? smooth01(this.addT / 0.3) : 1);
      }

      // teacher: faint route of this stage's climb (plasticity OFF only: the wandering after it
      // would scribble over the map), tapered fading trail, dot
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
        const u = (n + 1) / nseg, f = this.fast[Math.min(t0 + off + n + 1, i)];
        l.setAttribute("x1", xs[off + n]); l.setAttribute("y1", ys[off + n]);
        l.setAttribute("x2", xs[off + n + 1]); l.setAttribute("y2", ys[off + n + 1]);
        l.setAttribute("stroke-width", ((2 + 9 * u) * (1 - 0.72 * f)).toFixed(2));
        l.setAttribute("stroke-opacity", ((0.04 + 0.86 * u * u) * (1 - 0.45 * f)).toFixed(3));
        l.setAttribute("visibility", "visible");
      }
      this.teacher.setAttribute("cx", tx);
      this.teacher.setAttribute("cy", ty);
      show(this.teacher, 1);

      // F_max state and the teacher's link to it, fading as the student learns it
      const F = lerp(r.F), strength = clamp(F / peak, 0, 1), thr = d.pacing.ring_threshold;
      let ringA = strength * smooth01((strength - thr) / thr);
      ringA *= smooth01(this.addT / 0.6);
      if (r.has_v[i] || r.has_v[j]) {
        const ia = r.has_v[i] ? i : j, ib = r.has_v[j] ? j : i;
        const vx = this.mapX(r.vx[ia] + (r.vx[ib] - r.vx[ia]) * f), vy = this.mapY(r.vy[ia] + (r.vy[ib] - r.vy[ia]) * f);
        const rr = S.ring * (0.9 + 0.25 * strength);
        for (const e of [this.ring, this.ringGlow]) { e.setAttribute("cx", vx); e.setAttribute("cy", vy); e.setAttribute("r", rr); }
        // link stops at the ring's edge; dashes flow from the teacher towards the ring
        const dx = vx - tx, dy = vy - ty, dist = Math.hypot(dx, dy) || 1;
        const cut = Math.min(1, rr / dist);
        this.link.setAttribute("x1", tx); this.link.setAttribute("y1", ty);
        this.link.setAttribute("x2", vx - dx * cut); this.link.setAttribute("y2", vy - dy * cut);
        this.link.setAttribute("stroke-dashoffset", (-this.wall * 55).toFixed(1));
        show(this.ring, ringA.toFixed(3));
        show(this.ringGlow, (0.6 * ringA).toFixed(3));
        show(this.link, (0.95 * ringA * smooth01((dist - rr) / 30)).toFixed(3));
      } else {
        show(this.ring, 0); show(this.ringGlow, 0); show(this.link, 0);
      }

      // badge: memory being added, then plasticity phase
      const state = this.phase === "added" ? "add" : r.plastic[i] ? "learn" : "off";
      if (state !== this.badgeState || !this.badgeText.textContent) {
        this.badgeState = state;
        const [bg, ink] = T.badge[state];
        this.badgeRect.style.fill = bg;
        this.badgeText.setAttribute("fill", ink);
        this.badgeText.textContent = { add: "adding a memory", off: "student plasticity OFF",
                                       learn: "student learning" }[state];
      }
      show(this.badgeRect, 1); show(this.badgeText, 1);

      // F_max trace revealed up to now
      const cx = this.plotX(this.stepNow);
      this.clipRect.setAttribute("width", Math.max(0, cx - L.plot.x0 + 12));
      this.cursor.setAttribute("x1", cx); this.cursor.setAttribute("x2", cx);
      this.cursorDot.setAttribute("cx", cx); this.cursorDot.setAttribute("cy", this.plotY(F));
      show(this.cursor, 0.55); show(this.cursorDot, 1);

      // digits and arrows (nearest record)
      this.drawDigits(f < 0.5 ? i : j, lerp(r.eps));
      const pulse = Math.exp(-this.addT / 0.5);
      this.digits.teacher.frame.setAttribute("stroke-width", (8 + 12 * pulse).toFixed(2));
    }

    drawDigits(n, eps) {
      const p = L.panel;
      const e = clamp(eps, 0, 1);
      this.error.setAttribute("d", arrowPath(p.x + p.w * 0.7, this.arrowTop, this.arrowBot,
                                             5 + 24 * e, 30 + 32 * e, 30 + 14 * e));
      this.error.setAttribute("opacity", n < 0 ? 0.25 : 1);
      this.replay.setAttribute("opacity", n < 0 ? 0.25 : 1);
      if (n === this.lastDigit) return;
      this.lastDigit = n;
      const sz = this.d.side * this.d.side;
      for (const [role, arr] of [["teacher", this.xT], ["student", this.xS]]) {
        const cells = this.digits[role].cells;
        for (let c = 0; c < sz; c++)
          cells[c].setAttribute("fill", this.digLut[n < 0 ? 127 : arr[n * sz + c] + 127]);
      }
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
      theme: elm.dataset.theme || "dark",
      speed: parseFloat(elm.dataset.speed || "1"),
      autoplay: "autoplay" in elm.dataset,
      loop: "loop" in elm.dataset,
      controls: elm.dataset.controls !== "none",
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
