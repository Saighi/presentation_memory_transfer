// Sphere transfer player: draws the run exported by talkviz/web_export.py (export_sphere), the
// paper's reactivation-transfer figure (teacher activity on its memory sphere + per-mode transfer
// gap) as a live SVG animation.
//
// Usage (deck or any page):
//   <script src="media/interactive/sphere_transfer.data.js"></script>
//   <div class="sphere-player" data-sphere="sphere_transfer" data-theme="light"></div>
//   <script src="js/sphere-player.js"></script>      (before js/deck.js in the deck)
//
// Options (data attributes): data-layout="network|gap|drive" (see LAYOUTS),
// data-theme="dark|light", data-speed="1", data-controls="none" (no
// speed slider), data-axes="none" (no u1..u3 axes), data-swing="1" (slow sway of the view; off by default, the view only turns when dragged),
// data-steps="none" (no reveal fragments), data-autoplay.
//
// One invisible reveal fragment per exported stop: each "next" plays up to the next stop and
// holds there (default: two modes transferred, most of the transfer done, end of the run). Every
// stop but the last gets a numbered marker on the sphere, shown once playback reaches it.
// "Previous" goes back to the previous held state. "Next" while a segment plays finishes it at
// once (final state); the next "next" moves on. The sphere turns only when dragged.
//
// Layout is in px of the deck canvas (1920x1080); the SVG scales to the slide and stays sharp.
// Colours mirror css/talk.css and js/fmax-player.js.

(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const W = 1920, H = 1080;

  const THEMES = {
    dark: {
      bg: "#111316", ink: "#E8EAED", soft: "#A9AEB5", axis: "#5F6670", wire: "#8A919B",
      teacher: "#4A9BEA", student: "#EA6A3A", frozen: "#A9AEB5",
      path: ["#24548F", "#4A9BEA", "#C9E4FF"],   // early -> late
      speed: ["#5A2A6E", "#B8336A", "#F07848", "#FBD38D"],   // slow -> fast
      modes: ["#45B36B", "#7FD39A", "#BDEBC9"],
      sphereFill: ["#1C2026", "#14171B"],
      digit: ["#C9E4FF", "#5AA3F0", "#24548F", "#1A1D22", "#8F2F1E", "#E5603C", "#FFC2A6"],
      memStroke: "#E8EAED", teacherStroke: "#FFFFFF", card: 0.05,
    },
    light: {
      bg: "#FFFFFF", ink: "#23262D", soft: "#5F6670", axis: "#9AA0A6", wire: "#7C838D",
      teacher: "#378ADD", student: "#D85A30", frozen: "#5F6670",
      path: ["#A9CCF0", "#378ADD", "#0B3F7A"],   // early -> late, as in the paper
      speed: ["#F7C873", "#E36A4F", "#A62765", "#3D0D5C"],   // slow -> fast
      modes: ["#1B5E3B", "#3A9A5C", "#7BC48E"],
      sphereFill: ["#FFFFFF", "#EEF1F5"],
      digit: ["#053061", "#2166AC", "#92C5DE", "#F7F7F7", "#F4A582", "#B2182B", "#67001F"],
      memStroke: "#23262D", teacherStroke: "#FFFFFF", card: 0.04,
    },
  };

  const FONT = '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

  // layouts, px at 1920x1080 (one slide each):
  //   "network": network activity card + sphere, whole run in one click, no markers;
  //   "gap": sphere + per-mode transfer gap, pauses with numbered markers;
  //   "drive": sphere (path coloured by speed) + selection drive and student weight change.
  const SIZES = {
    teacher: 13, memDot: 9, thumb: 68, thumbOff: 52, panelLabel: 32, caption: 21, flow: 21, frozen: 26,
    title: 36, noteHead: 29, note: 25, tick: 28, axisLabel: 30, modeLabel: 29, legend: 28, axisU: 34,
  };
  const LAYOUTS = {
    network: {
      panel: { x: 30, w: 270, img: 190, yS: 232, yT: 574 },        // network activity card, y 134..944
      sphere: { cx: 790, cy: 500, r: 235 },
      pauses: false,
      markers: false,
      plots: [],
      legendY: 1000,
      notes: { kind: "replay", x: 1290, y: 330, right: 1860 },
      pathBins: 16,
      sizes: SIZES,
    },
    gap: {
      panel: null,
      sphere: { cx: 640, cy: 500, r: 235 },
      plots: [{ kind: "gap", box: { x0: 1330, x1: 1860, y0: 200, y1: 540 } }],
      legendY: 1000,
      notes: { kind: "modes", x: 1290, y: 700 },     // modes only (axes explained on the network slide)
      pathBins: 16,
      sizes: SIZES,
    },
    drive: {
      panel: null,
      sphere: { cx: 640, cy: 500, r: 235 },
      pauses: false,            // one click plays the whole run (markers still appear)
      pathColor: "speed",       // path coloured by the teacher's speed on the subspace
      trail: false,             // no blue fading trail behind the teacher
      plots: [{ kind: "drive", box: { x0: 1260, x1: 1850, y0: 150, y1: 320 }, xLabels: false },
              { kind: "dW", box: { x0: 1260, x1: 1850, y0: 440, y1: 610 } }],
      legendY: 1000,
      notes: { kind: "drive", x: 1170, y: 784 },
      pathBins: 16,
      sizes: SIZES,
    },
  };

  // ---------- small helpers ----------
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const DEG = Math.PI / 180;

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

  // n RGB triples evenly through equally spaced stops
  function lutRgb(stops, n) {
    const rgb = stops.map(hexToRgb), out = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * (rgb.length - 1);
      const j = Math.min(Math.floor(t), rgb.length - 2), f = t - j;
      out[i] = rgb[j].map((v, m) => Math.round(v + (rgb[j + 1][m] - v) * f));
    }
    return out;
  }

  function b64ToInt8(s) {
    const bin = atob(s), a = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = (bin.charCodeAt(i) << 24) >> 24;
    return a;
  }

  // vertical block arrow from y0 to y1
  function arrowPath(x, y0, y1, w, hw, hl) {
    const d = Math.sign(y1 - y0), yb = y1 - d * hl;
    return `M${x - w / 2},${y0} L${x + w / 2},${y0} L${x + w / 2},${yb} L${x + hw / 2},${yb} ` +
           `L${x},${y1} L${x - hw / 2},${yb} L${x - w / 2},${yb} Z`;
  }

  // one line of text from runs: "plain" or {t, i: italic, sub, sup, b: bold, c: colour}
  function richLine(parent, x, y, runs, size, color, weight, anchor) {
    const t = el("text", { x, y, fill: color, "font-size": size, "font-weight": weight || 600,
                           "text-anchor": anchor || "start" }, parent);
    for (const r of runs) {
      const run = typeof r === "string" ? { t: r } : r;
      const a = {};
      if (run.i) a["font-style"] = "italic";
      if (run.b) a["font-weight"] = 800;
      if (run.w) a["font-weight"] = run.w;
      if (run.dx) a.dx = run.dx;
      if (run.c) a.fill = run.c;
      el("tspan", a, t).textContent = run.t;
      for (const [key, dy] of [["sub", 0.25], ["sup", -0.38]]) {
        if (!run[key]) continue;
        const sz = Math.round(size * 0.68), d = Math.round(size * dy);
        el("tspan", Object.assign({ "font-size": sz, dy: d }, run.c ? { fill: run.c } : {},
                                  run.w ? { "font-weight": run.w } : {}), t).textContent = run[key];
        el("tspan", { dy: -d }, t).textContent = "​";
      }
    }
    return t;
  }

  // smallest 1, 2, 2.5 or 5 x 10^k at or above x
  function niceCeil(x) {
    const e = Math.pow(10, Math.floor(Math.log10(x)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= x - 1e-12) return m * e;
    return 10 * e;
  }
  function fmtTick(v) { return v === 0 ? "0" : String(+v.toPrecision(3)); }

  // padlock glyph, top-left at (x, y), height h
  function lock(parent, x, y, h, color) {
    const g = el("g", { fill: "none", stroke: color, "stroke-width": h * 0.13, "stroke-linecap": "round" }, parent);
    const bw = h * 0.78, bh = h * 0.55, sw = h * 0.46;
    el("path", { d: `M${x + (bw - sw) / 2},${y + h - bh} v${-h * 0.16} a${sw / 2},${sw / 2} 0 0 1 ${sw},0 v${h * 0.16}` }, g);
    el("rect", { x, y: y + h - bh, width: bw, height: bh, rx: h * 0.1, fill: color, stroke: "none" }, g);
    return g;
  }

  let instances = 0;

  // ======================================================================
  class SpherePlayer {
    constructor(root, data, opts = {}) {
      this.root = root;
      this.d = data;
      this.id = `sp${instances++}`;
      this.opts = Object.assign({ theme: "light", layout: "gap", speed: 1, autoplay: false, controls: true,
                                  axes: true, swing: 0, autoDelay: 1.5 }, opts);
      this.L = LAYOUTS[this.opts.layout] || LAYOUTS.gap;
      if (this.opts.controls) {
        try { const s = parseFloat(localStorage.getItem("sphere-speed")); if (s > 0) this.opts.speed = s; } catch (e) { /* no storage */ }
      }
      const r = data.rec;
      this.N = data.n_records;
      this.P = data.mem.length;
      this.xT = b64ToInt8(data.digits.x_T);
      this.xS = b64ToInt8(data.digits.x_S);
      this.stops = this.L.pauses === false ? data.pacing.stops.slice(-1) : data.pacing.stops;
      this.steps = this.stops.length;
      this.pos = 0;
      this.tNow = 0;
      this.phase = "held";      // held | play
      this.phaseT = 0;
      this.wall = 0;
      this.dragAz = 0;          // view turned by dragging (deg)
      this.dragEl = 0;
      this.active = false;
      this.raf = null;
      this.lastDigit = -2;
      this.T = r.t;
      this.build();
      this.render();
    }

    // ---------- geometry ----------
    // matplotlib-style orthographic view: returns [screen x, screen y, depth (+ = towards viewer)]
    setView() {
      const v = this.d.view;
      const sway = this.opts.swing ? 9 * Math.sin((2 * Math.PI * this.wall) / 26) * this.opts.swing : 0;
      const a = (v.azim + this.dragAz + sway) * DEG, e = clamp(v.elev + this.dragEl, -80, 80) * DEG;
      const sa = Math.sin(a), ca = Math.cos(a), se = Math.sin(e), ce = Math.cos(e);
      this.R = [[-sa, ca, 0], [-se * ca, -se * sa, ce], [ce * ca, ce * sa, se]];
    }
    proj(x, y, z) {
      const R = this.R, s = this.L.sphere;
      return [s.cx + s.r * (R[0][0] * x + R[0][1] * y + R[0][2] * z),
              s.cy - s.r * (R[1][0] * x + R[1][1] * y + R[1][2] * z),
              R[2][0] * x + R[2][1] * y + R[2][2] * z];
    }

    // ---------- DOM ----------
    build() {
      const T = (this.Tm = THEMES[this.opts.theme] || THEMES.light), id = this.id;
      this.root.innerHTML = "";
      this.root.dataset.theme = this.opts.theme;
      this.root.style.background = T.bg;
      const svg = (this.svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet",
                                          "font-family": FONT, role: "img",
                                          "aria-label": "Teacher activity on its memory sphere and per-mode transfer gap" },
                                 this.root));
      this.digLut = lutRgb(T.digit, 255);
      const defs = el("defs", {}, svg);
      const rg = el("radialGradient", { id: `${id}-ball`, cx: 0.38, cy: 0.32, r: 0.75 }, defs);
      el("stop", { offset: 0, "stop-color": T.sphereFill[0] }, rg);
      el("stop", { offset: 1, "stop-color": T.sphereFill[1] }, rg);

      el("rect", { x: 0, y: 0, width: W, height: H, fill: T.bg }, svg);
      if (this.L.panel) this.buildPanel(svg);
      this.buildSphere(svg);
      this.plots = this.L.plots.map((spec, k) => this.buildPlot(svg, this.plotSpec(spec), k));
      this.buildNotes(svg);
      this.buildLegend(svg);
      if (this.opts.controls) this.buildControls();
      this.hookDrag();
    }

    // a 28x28 digit drawn on a canvas and shown as a pixelated SVG image
    digitImage(parent, x, y, size) {
      const img = el("image", { x, y, width: size, height: size, preserveAspectRatio: "none",
                                style: "image-rendering: pixelated; image-rendering: crisp-edges" }, parent);
      return img;
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

    // left column: student (top) and teacher (bottom) activity, replay / error arrows,
    // teacher weights frozen
    buildPanel(svg) {
      const T = this.Tm, S = this.L.sizes, p = this.L.panel, id = this.id;
      const g = el("g", {}, svg);
      const cardTop = p.yS - 98, cardBot = p.yT + p.img + 180;
      el("rect", { x: p.x - 10, y: cardTop, width: p.w + 20, height: cardBot - cardTop, rx: 20,
                   fill: T.ink, "fill-opacity": T.card }, g);
      const ix = p.x + (p.w - p.img) / 2, mid = p.x + p.w / 2;
      const defs = this.svg.querySelector("defs");
      this.digits = {};
      // name in the role colour, role in soft grey; image with rounded corners and a thin frame
      for (const [role, y0, name, above] of [["student", p.yS, "cortex", true],
                                             ["teacher", p.yT, "hippocampus", false]]) {
        const clip = el("clipPath", { id: `${id}-${role}-img` }, defs);
        el("rect", { x: ix, y: y0, width: p.img, height: p.img, rx: 12 }, clip);
        const img = this.digitImage(el("g", { "clip-path": `url(#${id}-${role}-img)` }, g), ix, y0, p.img);
        el("rect", { x: ix, y: y0, width: p.img, height: p.img, rx: 12, fill: "none",
                     stroke: T[role], "stroke-width": 3.5 }, g);
        const yName = above ? y0 - 52 : y0 + p.img + 44;
        el("text", { x: mid, y: yName, fill: T[role], "font-size": S.panelLabel, "font-weight": 800,
                     "text-anchor": "middle" }, g).textContent = name;
        const yCap = yName + 30;
        if (role === "student") {
          el("text", { x: mid, y: yCap, fill: T.soft, "font-size": S.caption, "font-weight": 600,
                       "text-anchor": "middle" }, g).textContent = "student · learning";
        } else {
          // teacher: weights frozen, with a padlock
          const cap = el("text", { x: mid + 14, y: yCap, fill: T.soft, "font-size": S.caption, "font-weight": 600,
                                   "text-anchor": "middle" }, g);
          cap.textContent = "teacher · weights frozen";
          const w = cap.getComputedTextLength ? cap.getComputedTextLength() : 270;
          lock(g, mid + 14 - (w || 240) / 2 - 27, yCap - 18, 19, T.soft);
        }
        this.digits[role] = img;
      }

      // slim arrows: replay up (teacher -> student), prediction error down, thickness = error size
      this.arrowTop = p.yS + p.img + 20;
      this.arrowBot = p.yT - 20;
      const ym = (this.arrowTop + this.arrowBot) / 2;
      this.xReplay = mid - 52;
      this.xError = mid + 52;
      this.replay = el("path", { fill: T.teacher,
                                 d: arrowPath(this.xReplay, this.arrowBot, this.arrowTop, 7, 26, 24) }, g);
      this.error = el("path", { fill: T.student }, g);
      el("text", { x: this.xReplay + 16, y: ym - 18, fill: T.teacher, "font-size": S.flow, "font-weight": 700,
                   "dominant-baseline": "central" }, g).textContent = "replay";
      el("text", { x: this.xError - 16, y: ym + 18, fill: T.student, "font-size": S.flow, "font-weight": 700,
                   "text-anchor": "end", "dominant-baseline": "central" }, g).textContent = "error";

      // activity colour scale (digit images and memory thumbnails), at the bottom of the card
      const ag = el("linearGradient", { id: `${id}-act`, x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
      T.digit.forEach((c, k) => el("stop", { offset: k / (T.digit.length - 1), "stop-color": c }, ag));
      const aw = 150, ay = cardBot - 62;
      el("text", { x: mid - aw / 2 - 10, y: ay, fill: T.soft, "font-size": 26, "font-weight": 700,
                   "text-anchor": "end", "dominant-baseline": "central" }, g).textContent = "−";
      el("rect", { x: mid - aw / 2, y: ay - 7, width: aw, height: 14, rx: 4, fill: `url(#${id}-act)`,
                   stroke: T.axis, "stroke-width": 1 }, g);
      el("text", { x: mid + aw / 2 + 10, y: ay, fill: T.soft, "font-size": 26, "font-weight": 700,
                   "dominant-baseline": "central" }, g).textContent = "+";
      el("text", { x: mid, y: ay + 30, fill: T.soft, "font-size": 19, "font-weight": 600,
                   "text-anchor": "middle" }, g).textContent = "activity";
    }

    buildSphere(svg) {
      const T = this.Tm, S = this.L.sizes, s = this.L.sphere, P = this.P;
      const g = el("g", {}, svg);
      this.sphereG = g;
      el("circle", { cx: s.cx, cy: s.cy, r: s.r, fill: `url(#${this.id}-ball)` }, g);
      // back half (seen through the sphere), then a veil, then the front half
      this.wireBack = el("path", { fill: "none", stroke: T.wire, "stroke-width": 1.6, "stroke-opacity": 0.22,
                                   "stroke-dasharray": "3 7" }, g);
      this.bySpeed = this.L.pathColor === "speed" && !!this.d.rec.speed;
      const pathCols = lutRgb(this.bySpeed ? T.speed : T.path, this.L.pathBins).map((c) => `rgb(${c})`);
      const pathG = (width, alpha) => {
        const pg = el("g", { fill: "none", "stroke-width": width, "stroke-opacity": alpha,
                             "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
        return pathCols.map((c) => el("path", { stroke: c }, pg));
      };
      this.pathBack = pathG(3, 0.3);
      const backMem = el("g", {}, g);
      el("circle", { cx: s.cx, cy: s.cy, r: s.r, fill: T.bg, "fill-opacity": 0.28 }, g);
      el("circle", { cx: s.cx, cy: s.cy, r: s.r, fill: "none", stroke: T.wire, "stroke-width": 2.5,
                     "stroke-opacity": 0.55 }, g);
      this.wireFront = el("path", { fill: "none", stroke: T.wire, "stroke-width": 1.8, "stroke-opacity": 0.4 }, g);
      this.axesG = el("g", { opacity: this.opts.axes ? 1 : 0 }, g);
      this.axes = this.d.axes.map((name) => {
        const line = el("line", { stroke: T.axis, "stroke-width": 2.5 }, this.axesG);
        const lab = el("text", { fill: T.soft, "font-size": S.axisU, "font-style": "italic", "font-weight": 600,
                                 "text-anchor": "middle", "dominant-baseline": "central" }, this.axesG);
        el("tspan", {}, lab).textContent = name[0];
        el("tspan", { "font-size": S.axisU * 0.65, dy: 8, "font-style": "normal" }, lab).textContent = name.slice(1);
        return { line, lab };
      });
      this.pathFront = pathG(4.5, 0.9);
      const frontMem = el("g", {}, g);
      const tg = el("g", { "stroke-linecap": "round" }, g);
      this.trail = [];
      if (this.L.trail !== false) for (let n = 0; n < 90; n++) this.trail.push(el("line", { stroke: T.teacher, visibility: "hidden" }, tg));
      // pause markers: a thin ring where the teacher was at the pause, a numbered tag outside it
      this.markers = (this.L.markers === false ? [] : this.d.markers || []).map((m, k) => {
        const mg = el("g", { opacity: 0 }, g);
        const halo = el("circle", { r: 30, fill: T.ink, "fill-opacity": 0.06 }, mg);
        const ring = el("circle", { r: 24, fill: "none", stroke: T.ink, "stroke-width": 2.5 }, mg);
        const stem = el("line", { stroke: T.ink, "stroke-width": 2 }, mg);
        const tag = el("circle", { r: 17, fill: T.ink }, mg);
        const num = el("text", { fill: T.bg, "font-size": 22, "font-weight": 800, "text-anchor": "middle",
                                 "dominant-baseline": "central" }, mg);
        num.textContent = String(k + 1);
        return { t: m.t, v: m.x, mg, halo, ring, stem, tag, num, shownAt: null };
      });
      this.teacher = el("circle", { r: S.teacher, fill: T.teacher, stroke: T.teacherStroke, "stroke-width": 3.5 }, g);

      // stored memories, both signs: dot on the sphere, digit thumbnail just outside it, in the
      // colours of the activity panels (so -m is the blue digit the teacher shows there)
      this.memLayers = [backMem, frontMem];
      this.mems = [];
      for (let j = 0; j < P; j++) {
        for (const sg of [1, -1]) {
          const grp = el("g", {}, frontMem);
          const link = el("line", { stroke: T.memStroke, "stroke-width": 2, "stroke-opacity": 0.5 }, grp);
          const dot = el("circle", { r: S.memDot, fill: T.bg, stroke: T.memStroke, "stroke-width": 3.5 }, grp);
          const img = this.digitImage(grp, 0, 0, S.thumb);
          const frame = el("rect", { width: S.thumb + 4, height: S.thumb + 4, rx: 5, fill: "none",
                                     stroke: T.memStroke, "stroke-width": 2.5 }, grp);
          const neg = new Int8Array(this.d.side ** 2);
          const src = b64ToInt8(this.d.mem_img[j]);
          for (let c = 0; c < neg.length; c++) neg[c] = sg * src[c];
          this.paintDigit(img, neg, 0);
          const m = this.d.mem[j];
          this.mems.push({ v: [sg * m[0], sg * m[1], sg * m[2]], grp, link, dot, img, frame, back: null });
        }
      }

      // wireframe: 6 meridians, 5 parallels
      const lines = [];
      for (let k = 0; k < 6; k++) {
        const ph = (k * Math.PI) / 6, pts = [];
        for (let n = 0; n <= 72; n++) {
          const th = (n * 2 * Math.PI) / 72;
          pts.push([Math.cos(ph) * Math.sin(th), Math.sin(ph) * Math.sin(th), Math.cos(th)]);
        }
        lines.push(pts);
      }
      for (const z of [-0.75, -0.4, 0, 0.4, 0.75]) {
        const rr = Math.sqrt(1 - z * z), pts = [];
        for (let n = 0; n <= 72; n++) { const th = (n * 2 * Math.PI) / 72; pts.push([rr * Math.cos(th), rr * Math.sin(th), z]); }
        lines.push(pts);
      }
      this.wire = lines;
    }

    // what each plot shows: series (record key, column), axis range and ticks, title
    plotSpec(spec) {
      const T = this.Tm, d = this.d, r = d.rec;
      const peak = (a, t0) => { let m = 0; for (let i = 0; i < this.N; i++) if (r.t[i] >= t0) m = Math.max(m, a[i]); return m; };
      const base = Object.assign({ xLabels: true, legend: null, fill: false }, spec);
      if (spec.kind === "gap") {
        return Object.assign(base, {
          title: [{ t: "transfer gap, per mode" }], titleGap: 70,
          series: [2, 1, 0].map((k) => ({ key: "gap", n: 3, k, color: T.modes[k] })),
          yMax: Math.max(1, d.gap_peak) * 1.05, ticks: [0, 0.5, 1],
          legend: ["mode 1", "mode 2", "mode 3"].map((w, k) => ({ w, color: T.modes[k] })),
        });
      }
      // the drive starts at |kappa| (the student is silent at t = 0): scale on the rest of the run
      const isDrive = spec.kind === "drive";
      const top = niceCeil(1.12 * peak(r[spec.kind], isDrive ? 25 : 0));
      return Object.assign(base, {
        title: isDrive
          ? [{ t: "selection drive" }]
          : [{ t: "student weight change" }, { t: "   (×10", c: T.soft, w: 600 },
             { t: "", sup: "−3", c: T.soft, w: 600 }, { t: ")", c: T.soft, w: 600 }],
        titleGap: 46,
        series: [{ key: spec.kind, color: isDrive ? T.teacher : T.student }],
        yMax: top, ticks: [0, top / 2, top], fill: true,
      });
    }

    buildPlot(svg, spec, idx) {
      const T = this.Tm, S = this.L.sizes, p = spec.box, d = this.d, r = d.rec;
      const g = el("g", {}, svg);
      const X = (t) => p.x0 + (t / d.t_end) * (p.x1 - p.x0);
      const Y = (v) => p.y1 - (v / spec.yMax) * (p.y1 - p.y0);
      richLine(g, p.x0 - 90, p.y0 - spec.titleGap, spec.title, S.title, T.ink, 800);
      for (const v of spec.ticks) {
        const y = Y(v);
        if (v > 0) el("line", { x1: p.x0, x2: p.x1, y1: y, y2: y, stroke: T.axis, "stroke-width": 1.5, "stroke-opacity": 0.35 }, g);
        el("text", { x: p.x0 - 18, y, fill: T.soft, "font-size": S.tick, "font-weight": 700, "text-anchor": "end",
                     "dominant-baseline": "central" }, g).textContent = fmtTick(v);
      }
      for (let t = 0; t <= d.t_end + 1; t += 2000) {
        const x = X(t);
        el("line", { x1: x, x2: x, y1: p.y1, y2: p.y1 + 10, stroke: T.axis, "stroke-width": 3 }, g);
        if (spec.xLabels)
          el("text", { x, y: p.y1 + 44, fill: T.soft, "font-size": S.tick, "font-weight": 700,
                       "text-anchor": "middle" }, g).textContent = String(t / 1000);
      }
      if (spec.xLabels) {
        const xl = el("text", { x: (p.x0 + p.x1) / 2, y: p.y1 + 92, fill: T.ink, "font-size": S.axisLabel,
                                "font-weight": 700, "text-anchor": "middle" }, g);
        xl.textContent = "time (×10";
        el("tspan", { "font-size": S.axisLabel * 0.65, dy: -12 }, xl).textContent = "3";
        el("tspan", { dy: 12 }, xl).textContent = ")";
      }
      el("path", { d: `M${p.x0},${p.y0 - 10} L${p.x0},${p.y1} L${p.x1},${p.y1}`, fill: "none",
                   stroke: T.axis, "stroke-width": 3 }, g);

      // curves, revealed up to the current time through a clip
      const clip = el("clipPath", { id: `${this.id}-clip${idx}` }, this.svg.querySelector("defs"));
      const clipRect = el("rect", { x: p.x0, y: p.y0 - 12, width: 0, height: p.y1 - p.y0 + 14 }, clip);
      const cg = el("g", { "clip-path": `url(#${this.id}-clip${idx})` }, g);
      const val = (sr, i) => (sr.n ? r[sr.key][sr.n * i + sr.k] : r[sr.key][i]);
      for (const sr of spec.series) {
        let dd = "";
        for (let i = 0; i < this.N; i++)
          dd += `${i ? "L" : "M"}${X(r.t[i]).toFixed(1)},${Math.max(p.y0 - 12, Y(val(sr, i))).toFixed(1)}`;
        if (spec.fill)
          el("path", { d: `${dd} L${X(r.t[this.N - 1])},${p.y1} L${p.x0},${p.y1} Z`, fill: sr.color,
                       "fill-opacity": 0.1 }, cg);
        el("path", { d: dd, fill: "none", stroke: sr.color, "stroke-width": spec.fill ? 5 : 6,
                     "stroke-linejoin": "round" }, cg);
      }
      const cursor = el("line", { y1: p.y0 - 10, y2: p.y1, stroke: T.ink, "stroke-width": 2.5, "stroke-opacity": 0.4 }, g);
      const dots = spec.series.map((sr) => el("circle", { r: 10, fill: sr.color, stroke: T.bg, "stroke-width": 4 }, g));
      if (spec.legend) {
        spec.legend.forEach((it, k) => {
          const y = p.y0 + 30 + k * 46, x = p.x1 - 170;
          el("line", { x1: x, x2: x + 44, y1: y, y2: y, stroke: it.color, "stroke-width": 7, "stroke-linecap": "round" }, g);
          el("text", { x: x + 60, y, fill: T.ink, "font-size": S.modeLabel, "font-weight": 700,
                       "dominant-baseline": "central" }, g).textContent = it.w;
        });
      }
      // one dotted line per pause marker; the top plot of the slide also carries its number
      const mlines = this.markers.map((m, k) => {
        const x = X(m.t), mg = el("g", { opacity: 0 }, g);
        el("line", { x1: x, x2: x, y1: p.y0 - 10, y2: p.y1, stroke: T.ink, "stroke-width": 2.5,
                     "stroke-dasharray": "2 7", "stroke-linecap": "round", "stroke-opacity": 0.7 }, mg);
        if (idx === 0) {
          el("circle", { cx: x, cy: p.y0 - 26, r: 13, fill: T.ink }, mg);
          el("text", { x, y: p.y0 - 25, fill: T.bg, "font-size": 17, "font-weight": 800, "text-anchor": "middle",
                       "dominant-baseline": "central" }, mg).textContent = String(k + 1);
        }
        return mg;
      });
      return { spec, X, Y, val, clipRect, cursor, dots, box: p, mlines };
    }

    // what the axes and the modes are, under the plot
    buildNotes(svg) {
      const T = this.Tm, S = this.L.sizes, n = this.L.notes;
      const g = el("g", {}, svg);
      const lh = S.note * 1.32;
      if (!n) return;
      const right = n.right || this.L.plots[this.L.plots.length - 1].box.x1;
      if (n.kind === "drive") return this.buildDriveNotes(g, n, lh, right);
      el("line", { x1: n.x, x2: right, y1: n.y - 46, y2: n.y - 46, stroke: T.axis, "stroke-width": 1.5,
                   "stroke-opacity": 0.5 }, g);
      if (n.kind === "replay") {
        // first slide with the sphere: what we see (replay), then what the axes are
        richLine(g, n.x, n.y, [{ t: "memory replay", c: T.teacher }], S.noteHead, T.ink, 800);
        ["with no specific input, hippocampal activity wanders", "over the stored memories and their mixtures"].forEach((w, k) => {
          richLine(g, n.x, n.y + (k + 1) * lh + 4, [w], S.note, T.soft);
        });
        const y2 = n.y + 4 * lh + 40;
        const u = (k) => ({ t: "u", i: true, sub: String(k) });
        richLine(g, n.x, y2, ["axes ", u(1), ", ", u(2), ", ", u(3)], S.noteHead, T.ink, 800);
        richLine(g, n.x, y2 + lh + 4, ["orthonormal basis of the teacher's memory subspace"], S.note, T.soft);
        richLine(g, n.x + 24, y2 + 2 * lh + 10,
                 [{ t: "U", i: true, sub: "T" }, " = [", u(1), " ", u(2), " ", u(3), "]  spans  ker(",
                  { t: "I", i: true }, " − ", { t: "W", i: true, sub: "T" }, ")"], S.note + 3, T.ink, 600);
        richLine(g, n.x, y2 + 3 * lh + 16, ["activity is normalised, so it stays on the sphere"], S.note, T.soft);
        return;
      }
      richLine(g, n.x, n.y, [{ t: "modes", c: T.modes[0] }], S.noteHead, T.ink, 800);
      richLine(g, n.x, n.y + lh + 4, ["eigenvectors of the student's error"], S.note, T.soft);
      richLine(g, n.x, n.y + 2 * lh + 4, ["restricted to the memory subspace"], S.note, T.soft);
      richLine(g, n.x + 24, n.y + 3 * lh + 10,
               [{ t: "D", i: true, sub: "S" }, " = ", { t: "U", i: true, sub: "T" }, { t: "ᵀ" }, " ",
                { t: "M", i: true, sub: "S" }, { t: "ᵀ" }, " ", { t: "M", i: true, sub: "S" }, " ",
                { t: "U", i: true, sub: "T" }], S.note + 3, T.ink, 600);
      richLine(g, n.x, n.y + 4 * lh + 16, ["eigenvalue = what is left to transfer along it"], S.note, T.soft);
    }

    // what the two plots of the drive layout measure
    buildDriveNotes(g, n, lh, right) {
      const T = this.Tm, S = this.L.sizes;
      el("line", { x1: n.x, x2: right, y1: n.y - 46, y2: n.y - 46, stroke: T.axis, "stroke-width": 1.5,
                   "stroke-opacity": 0.5 }, g);
      const it = (t, sub, c) => ({ t, i: true, sub, c });
      const big = S.noteHead + 1;
      // formula first (in the plot's colour), then what it means
      richLine(g, n.x, n.y, [it("\u03ba", null, T.teacher), { t: " \u2016", c: T.teacher },
               it("\u03b5", "TS", T.teacher), { t: "\u2016", c: T.teacher }, { t: "\u200b", dx: 40 },
               { t: "\u03b5", i: true, sub: "TS", c: T.ink, w: 600 }, { t: " = ", c: T.ink, w: 600 },
               { t: "x", i: true, sub: "T", c: T.ink, w: 600 }, { t: " \u2212 ", c: T.ink, w: 600 },
               { t: "x", i: true, sub: "S", c: T.ink, w: 600 }], big, T.ink, 700);
      richLine(g, n.x, n.y + lh + 6, ["the student's error pushing the teacher"], S.note, T.soft);
      richLine(g, n.x, n.y + 2 * lh + 6, ["to what the cortex does not yet reproduce"], S.note, T.soft);
      const y2 = n.y + 3 * lh + 44;
      richLine(g, n.x, y2, [{ t: "\u2016", c: T.student }, it("\u1e86", "S", T.student), { t: "\u2016", c: T.student },
               { t: "\u200b", dx: 40 }, { t: "\u1e86", i: true, sub: "S", c: T.ink, w: 600 },
               { t: " = ", c: T.ink, w: 600 }, { t: "\u03b7 ", i: true, c: T.ink, w: 600 },
               { t: "\u03c0", i: true, sub: "S", c: T.ink, w: 600 }, { t: " ", c: T.ink },
               { t: "\u03b5", i: true, sub: "S", c: T.ink, w: 600 }, { t: " ", c: T.ink },
               { t: "x", i: true, sub: "S", sup: "\u22a4", c: T.ink, w: 600 }], big, T.ink, 700);
      richLine(g, n.x, y2 + lh + 6, ["how fast the cortex learns: its own prediction"], S.note, T.soft);
      richLine(g, n.x, y2 + 2 * lh + 6, ["error times its activity (local rule)"], S.note, T.soft);
    }

    // legend under the sphere
    buildLegend(svg) {
      const T = this.Tm, S = this.L.sizes, y = this.L.legendY, cx = this.L.sphere.cx;
      const g = el("g", {}, svg);
      const x0 = cx - 395;
      el("circle", { cx: x0, cy: y, r: S.teacher, fill: T.teacher, stroke: T.teacherStroke, "stroke-width": 3.5 }, g);
      el("text", { x: x0 + 30, y, fill: T.ink, "font-size": S.legend, "font-weight": 700,
                   "dominant-baseline": "central" }, g).textContent = "teacher activity";
      const pg = el("linearGradient", { id: `${this.id}-path`, x1: 0, x2: 1, y1: 0, y2: 0 }, this.svg.querySelector("defs"));
      const scale = this.bySpeed ? T.speed : T.path;
      scale.forEach((c, k) => el("stop", { offset: k / (scale.length - 1), "stop-color": c }, pg));
      const xp = x0 + 268;
      el("text", { x: xp, y, fill: T.soft, "font-size": S.legend, "font-weight": 700,
                   "dominant-baseline": "central" }, g).textContent = this.bySpeed ? "slow" : "early";
      el("rect", { x: xp + 80, y: y - 6, width: 110, height: 12, rx: 6, fill: `url(#${this.id}-path)` }, g);
      el("text", { x: xp + 204, y, fill: T.soft, "font-size": S.legend, "font-weight": 700,
                   "dominant-baseline": "central" }, g).textContent = this.bySpeed ? "fast" : "late";
      const x1 = xp + 296;
      el("circle", { cx: x1, cy: y, r: S.memDot, fill: T.bg, stroke: T.memStroke, "stroke-width": 3.5 }, g);
      el("text", { x: x1 + 26, y, fill: T.ink, "font-size": S.legend, "font-weight": 700,
                   "dominant-baseline": "central" }, g).textContent = "stored memory (±)";
    }

    buildControls() {
      const T = this.Tm, root = this.root;
      root.style.setProperty("--fp-ink", T.ink);
      root.style.setProperty("--fp-soft", T.soft);
      root.style.setProperty("--fp-accent", T.teacher);
      const box = document.createElement("div");
      box.className = "fp-speed";
      box.style.left = `${1610 / 19.2}cqw`;
      box.style.top = `${22 / 19.2}cqw`;
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
        if (Math.abs(v) < 0.08) v = 0;
        this.opts.speed = clamp(2 ** v, 0.25, 4);
        try { localStorage.setItem("sphere-speed", String(this.opts.speed)); } catch (e) { /* no storage */ }
        show();
      });
      input.addEventListener("dblclick", () => { input.value = 0; input.dispatchEvent(new Event("input")); });
      for (const ev of ["pointerup", "change"]) input.addEventListener(ev, () => input.blur());
      input.addEventListener("keydown", (e) => { input.blur(); e.preventDefault(); });
      show();
    }

    // drag on the sphere to turn it; double-click resets the view
    hookDrag() {
      const svg = this.svg;
      let start = null;
      const inside = (e) => {
        const b = svg.getBoundingClientRect(), k = W / b.width;
        const x = (e.clientX - b.left) * k, y = (e.clientY - b.top) * k;
        return Math.hypot(x - this.L.sphere.cx, y - this.L.sphere.cy) < this.L.sphere.r * 1.25;
      };
      svg.addEventListener("pointerdown", (e) => {
        if (!inside(e)) return;
        start = { x: e.clientX, y: e.clientY, az: this.dragAz, el: this.dragEl, k: W / svg.getBoundingClientRect().width };
        svg.setPointerCapture(e.pointerId);
        e.stopPropagation();
      });
      svg.addEventListener("pointermove", (e) => {
        if (!start) return;
        this.dragAz = start.az - ((e.clientX - start.x) * start.k) / 4;
        this.dragEl = start.el + ((e.clientY - start.y) * start.k) / 4;
        if (!this.active) this.render();
      });
      const end = () => { start = null; };
      svg.addEventListener("pointerup", end);
      svg.addEventListener("pointercancel", end);
      svg.addEventListener("dblclick", (e) => { if (inside(e)) { this.dragAz = this.dragEl = 0; this.render(); } });
    }

    // ---------- playback ----------
    speedAt(t) {
      const { bounds, speeds } = this.d.pacing;
      const f = smooth01((t - bounds[0]) / (bounds[1] - bounds[0]));
      return Math.exp(Math.log(speeds[0]) + (Math.log(speeds[1]) - Math.log(speeds[0])) * f);
    }

    // step n: 0 start; n plays from stop n - 1 to stop n
    goTo(n, animate) {
      n = clamp(n, 0, this.steps);
      this.pos = n;
      this.phaseT = 0;
      this.autoWait = 0;
      const target = n === 0 ? 0 : this.stops[n - 1];
      if (animate && n > 0) {
        this.phase = "play";
        this.tNow = n === 1 ? 0 : this.stops[n - 2];
        this.stopAt = target;
      } else {
        this.phase = "held";
        this.tNow = target;
      }
      this.render();
    }
    next() { if (this.pos < this.steps) this.goTo(this.pos + 1, true); }
    // jump to the end of the segment being played (all curves and markers up to its stop)
    finish() {
      if (this.phase !== "play") return false;
      this.tNow = this.stopAt;
      this.phase = "held";
      this.phaseT = 0;
      this.render();
      return true;
    }
    prev() { this.goTo(this.pos - 1, false); }
    setTheme(t) { this.opts.theme = t; this.lastDigit = -2; this.build(); this.render(); }

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
      this.phaseT += dt;
      if (this.phase === "play") {
        const ramp = 0.05 + 0.95 * smooth01(this.phaseT / 0.4);
        const tail = 0.15 + 0.85 * smooth01((this.stopAt - this.tNow) / 150);
        this.tNow = Math.min(this.stopAt, this.tNow + this.speedAt(this.tNow) * ramp * tail * this.opts.speed * dt);
        if (this.tNow >= this.stopAt) { this.phase = "held"; this.phaseT = 0; }
      } else if (this.opts.autoplay) {
        this.autoWait += dt;
        if (this.autoWait > this.opts.autoDelay && this.pos < this.steps) this.next();
      }
    }

    // last record index with t <= tNow, next one, and the fraction between them
    locate(t) {
      const ts = this.T;
      let lo = 0, hi = this.N - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid - 1; }
      const j = Math.min(lo + 1, this.N - 1);
      const f = j > lo ? clamp((t - ts[lo]) / (ts[j] - ts[lo]), 0, 1) : 0;
      return [lo, j, f];
    }

    // ---------- one frame ----------
    render() {
      const T = this.Tm, S = this.L.sizes, r = this.d.rec, s = this.L.sphere;
      this.setView();
      const [i, j, f] = this.locate(this.tNow);
      const lerp = (a) => a[i] + (a[j] - a[i]) * f;

      // wireframe, split into front and back halves
      let wf = "", wb = "";
      for (const pts of this.wire) {
        let prevFront = null;
        for (const q of pts) {
          const [x, y, z] = this.proj(q[0], q[1], q[2]);
          const front = z >= 0;
          const seg = `${x.toFixed(1)},${y.toFixed(1)}`;
          if (front) wf += (prevFront === true ? "L" : "M") + seg; else wb += (prevFront === false ? "L" : "M") + seg;
          prevFront = front;
        }
      }
      this.wireFront.setAttribute("d", wf);
      this.wireBack.setAttribute("d", wb);

      // axes from the origin
      if (this.opts.axes) {
        this.axes.forEach((a, k) => {
          const v = [0, 0, 0]; v[k] = 1;
          const [x0, y0] = this.proj(0, 0, 0);
          const [x1, y1] = this.proj(1.18 * v[0], 1.18 * v[1], 1.18 * v[2]);
          const [xl, yl] = this.proj(1.32 * v[0], 1.32 * v[1], 1.32 * v[2]);
          a.line.setAttribute("x1", x0); a.line.setAttribute("y1", y0);
          a.line.setAttribute("x2", x1); a.line.setAttribute("y2", y1);
          a.lab.setAttribute("x", xl); a.lab.setAttribute("y", yl);
        });
      }

      // memories: back ones under the veil, front ones over it; thumbnail pushed outwards
      for (const m of this.mems) {
        const [x, y, z] = this.proj(...m.v);
        const back = z < 0;
        if (back !== m.back) { this.memLayers[back ? 0 : 1].appendChild(m.grp); m.back = back; }
        let ux = x - s.cx, uy = y - s.cy;
        const n = Math.hypot(ux, uy) || 1;
        ux /= n; uy /= n;
        // near the rim the thumbnail goes straight out; near the centre (pointing at the viewer)
        // it still needs a minimum offset
        const off = S.thumbOff + 0.5 * S.thumb * Math.max(Math.abs(ux), Math.abs(uy));
        const tx = x + off * ux, ty = y + off * uy;
        m.dot.setAttribute("cx", x); m.dot.setAttribute("cy", y);
        m.link.setAttribute("x1", x); m.link.setAttribute("y1", y);
        m.link.setAttribute("x2", tx - 0.5 * S.thumb * ux); m.link.setAttribute("y2", ty - 0.5 * S.thumb * uy);
        m.cx = tx; m.cy = ty; m.dx = x; m.dy = y;
        m.img.setAttribute("x", tx - S.thumb / 2); m.img.setAttribute("y", ty - S.thumb / 2);
        m.frame.setAttribute("x", tx - S.thumb / 2 - 2); m.frame.setAttribute("y", ty - S.thumb / 2 - 2);
        m.grp.setAttribute("opacity", back ? (0.3 + 0.35 * smooth01(1 + z / 0.35)).toFixed(3) : 1);
      }

      // path so far (front / back), recent tapered trail, teacher dot
      const tx = lerp(r.x), ty = lerp(r.y), tz = lerp(r.z);
      const nrm = Math.hypot(tx, ty, tz) || 1;
      const [px, py, pz] = this.proj(tx / nrm, ty / nrm, tz / nrm);
      const P2 = [];
      for (let n = 0; n <= i; n++) P2.push(this.proj(r.x[n], r.y[n], r.z[n]));
      P2.push([px, py, pz]);
      // segment n -> n + 1 goes to the time bin of record n, front or back by its midpoint
      const NB = this.L.pathBins, df = new Array(NB).fill(""), db = new Array(NB).fill("");
      for (let n = 0; n + 1 < P2.length; n++) {
        const a = P2[n], b = P2[n + 1];
        const k = Math.min(NB - 1, Math.floor((this.bySpeed ? (r.speed[n] + r.speed[n + 1 < this.N ? n + 1 : n]) / 2
                                                            : r.t[n] / this.d.t_end) * NB));
        const seg = `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
        if (a[2] + b[2] >= 0) df[k] += seg; else db[k] += seg;
      }
      for (let k = 0; k < NB; k++) {
        this.pathFront[k].setAttribute("d", df[k]);
        this.pathBack[k].setAttribute("d", db[k]);
      }
      const t0 = this.locate(this.tNow - this.d.pacing.trail_time)[0];
      const pts = P2.slice(t0);
      const nseg = Math.min(pts.length - 1, this.trail.length), off = pts.length - 1 - nseg;
      for (let n = 0; n < this.trail.length; n++) {
        const l = this.trail[n];
        if (n >= nseg) { l.setAttribute("visibility", "hidden"); continue; }
        const a = pts[off + n], b = pts[off + n + 1], u = (n + 1) / nseg;
        const depth = (a[2] + b[2]) / 2 >= 0 ? 1 : 0.4;
        l.setAttribute("x1", a[0]); l.setAttribute("y1", a[1]);
        l.setAttribute("x2", b[0]); l.setAttribute("y2", b[1]);
        l.setAttribute("stroke-width", (2 + 9 * u).toFixed(2));
        l.setAttribute("stroke-opacity", ((0.05 + 0.9 * u * u) * depth).toFixed(3));
        l.setAttribute("visibility", "visible");
      }
      // pause markers appear once playback reaches them (fade in while playing, at once when jumped to)
      for (const m of this.markers) {
        if (this.tNow < m.t - 1e-6) { m.shownAt = null; m.alpha = 0; m.mg.setAttribute("opacity", 0); continue; }
        if (m.shownAt == null) m.shownAt = this.phase === "play" ? this.wall : -1e3;
        const [mx, my, mz] = this.proj(...m.v);
        // tag on the side clearest of the memory images and dots (outward preferred)
        const out = Math.atan2(my - s.cy, mx - s.cx);
        let ux = 0, uy = 0, best = -Infinity;
        for (let q = 0; q < 12; q++) {
          const ang = out + (q * Math.PI) / 6, cx_ = mx + 56 * Math.cos(ang), cy_ = my + 56 * Math.sin(ang);
          let clear = Infinity;
          for (const mm of this.mems) {
            if (mm.back) continue;
            const ox = Math.max(0, Math.abs(cx_ - mm.cx) - S.thumb / 2), oy = Math.max(0, Math.abs(cy_ - mm.cy) - S.thumb / 2);
            clear = Math.min(clear, Math.hypot(ox, oy), Math.hypot(cx_ - mm.dx, cy_ - mm.dy) - S.memDot);
          }
          const score = Math.min(clear, 40) - 6 * Math.min(q, 12 - q);   // enough room, then closest to outward
          if (score > best) { best = score; ux = Math.cos(ang); uy = Math.sin(ang); }
        }
        const tx = mx + 56 * ux, ty = my + 56 * uy;
        for (const e of [m.halo, m.ring]) { e.setAttribute("cx", mx); e.setAttribute("cy", my); }
        m.stem.setAttribute("x1", mx + 24 * ux); m.stem.setAttribute("y1", my + 24 * uy);
        m.stem.setAttribute("x2", tx - 17 * ux); m.stem.setAttribute("y2", ty - 17 * uy);
        m.tag.setAttribute("cx", tx); m.tag.setAttribute("cy", ty);
        m.num.setAttribute("x", tx); m.num.setAttribute("y", ty + 1);
        m.alpha = smooth01((this.wall - m.shownAt) / 0.6);
        const a = m.alpha * (mz >= 0 ? 1 : 0.45);
        const pop = 1 + 0.35 * (1 - smooth01((this.wall - m.shownAt) / 0.5));
        m.ring.setAttribute("r", (24 * pop).toFixed(2));
        m.mg.setAttribute("opacity", a.toFixed(3));
      }

      this.teacher.setAttribute("cx", px);
      this.teacher.setAttribute("cy", py);
      this.teacher.setAttribute("opacity", pz >= 0 ? 1 : 0.55);

      // curves revealed up to now
      for (const pl of this.plots) {
        const cx = pl.X(this.tNow), b = pl.box;
        pl.clipRect.setAttribute("width", Math.max(0, cx - b.x0));
        pl.cursor.setAttribute("x1", cx); pl.cursor.setAttribute("x2", cx);
        pl.mlines.forEach((ml, k) => ml.setAttribute("opacity", (this.markers[k].alpha || 0).toFixed(3)));
        pl.spec.series.forEach((sr, k) => {
          const v = pl.val(sr, i) + (pl.val(sr, j) - pl.val(sr, i)) * f;
          pl.dots[k].setAttribute("cx", cx);
          pl.dots[k].setAttribute("cy", Math.max(b.y0 - 10, pl.Y(v)));
        });
      }

      if (this.L.panel) this.drawDigits(f < 0.5 ? i : j, lerp(r.eps));
    }

    drawDigits(n, eps) {
      const p = this.L.panel, e = clamp(eps, 0, 1);
      this.error.setAttribute("d", arrowPath(this.xError, this.arrowTop, this.arrowBot,
                                             3 + 13 * e, 20 + 16 * e, 20 + 8 * e));
      const k = Math.min(Math.round(n / this.d.digits.stride), this.xT.length / this.d.side ** 2 - 1);
      if (k === this.lastDigit) return;
      this.lastDigit = k;
      const sz = this.d.side ** 2;
      this.paintDigit(this.digits.teacher, this.xT, k * sz);
      this.paintDigit(this.digits.student, this.xS, k * sz);
    }
  }

  // ======================================================================
  // mounting + reveal.js integration

  function mount(elm) {
    if (elm._sphere) return elm._sphere;
    const name = elm.dataset.sphere || "sphere_transfer";
    const data = (window.TALK_DATA || {})[name];
    if (!data) {
      elm.textContent = `sphere-player: no data "${name}" (load media/interactive/${name}.data.js first)`;
      return null;
    }
    const player = new SpherePlayer(elm, data, {
      theme: elm.dataset.theme || "light",
      layout: elm.dataset.layout || "gap",
      speed: parseFloat(elm.dataset.speed || "1"),
      autoplay: "autoplay" in elm.dataset,
      controls: elm.dataset.controls !== "none",
      axes: elm.dataset.axes !== "none",
      swing: parseFloat(elm.dataset.swing ?? "0"),
    });
    elm._sphere = player;
    const section = elm.closest(".reveal section");
    if (section && elm.dataset.steps !== "none") {
      for (let n = 1; n <= player.steps; n++) {
        const frag = document.createElement("span");
        frag.className = "fragment sphere-step";
        frag.dataset.sphereStep = n;
        section.appendChild(frag);
      }
    } else if (!section) {
      player.activate();
      if (player.opts.autoplay) player.next();
    }
    return player;
  }

  function playersIn(slide) {
    return slide ? [...slide.querySelectorAll(".sphere-player")].map((e) => e._sphere).filter(Boolean) : [];
  }

  function hookReveal() {
    const R = window.Reveal;
    if (!R || !R.on || R._sphereHooked) return;
    R._sphereHooked = true;
    const enter = (slide) => {
      document.querySelectorAll(".sphere-player").forEach((e) => {
        if (e._sphere && !slide.contains(e)) e._sphere.deactivate();
      });
      for (const p of playersIn(slide)) {
        const shown = slide.querySelectorAll(".sphere-step.visible").length;
        p.goTo(shown, false);
        p.activate();
        if (p.opts.autoplay && shown === 0) p.next();
      }
    };
    R.on("ready", (e) => enter(e.currentSlide));
    R.on("slidechanged", (e) => enter(e.currentSlide));
    const step = (e, forward) => {
      for (const frag of e.fragments || [e.fragment]) {
        if (!frag || !frag.classList.contains("sphere-step")) continue;
        const n = +frag.dataset.sphereStep;
        for (const p of playersIn(frag.closest("section"))) p.goTo(forward ? n : n - 1, forward);
      }
    };
    R.on("fragmentshown", (e) => step(e, true));
    // "next" while an animation plays finishes it (final state shown) instead of advancing;
    // the following "next" moves on. Capture phase, so it runs before reveal's own key handler.
    const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown", "PageDown", " ", "Spacebar", "n", "N", "j", "J", "l", "L"]);
    window.addEventListener("keydown", (e) => {
      if (!NEXT_KEYS.has(e.key) || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      const done = playersIn(R.getCurrentSlide()).map((p) => p.finish());
      if (!done.some(Boolean)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    R.on("fragmenthidden", (e) => step(e, false));
  }

  function mountAll() {
    document.querySelectorAll(".sphere-player").forEach(mount);
    hookReveal();
  }

  window.SpherePlayer = SpherePlayer;
  window.SpherePlayer.mountAll = mountAll;

  mountAll();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
})();
