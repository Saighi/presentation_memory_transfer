// Mechanism player: the climb of the previous slide, neuron by neuron, on a 64-neuron toy. Draws the run
// exported by notebooks/10_mechanism_climb.py (talkviz.web_export.export_mechanism) as SVG.
//
// Usage (deck):
//   <script src="media/interactive/mechanism_climb.data.js"></script>
//   <div class="mech-player" data-mech="mechanism_climb"></div>
//   <script src="js/mech-player.js"></script>      (before js/deck.js: the fragments must exist first)
//
// Four clicks (invisible reveal fragments), each ends on a held frame:
//   1. the teacher settles from a noisy state onto its memories (half O, half X);
//   2. the student settles: it copies O, only part of X (it has not learned X);
//   3. the interface error appears: x_T - x_S = grad q / pi_TS, the X glyph, faint  <- the pause frame
//   (right of the student and of the teacher: how much O and X each one shows, bars; the student's bars sit in
//   outlines of the teacher's amounts with the copied fraction: O 100 %, X ~66 %)
//   4. the drive kappa eps_TS turns on and the teacher climbs to X (q = F_max); the error grows to a full X.
// "Previous" goes back one held frame. Debug: ?mech=3.5 shows step 4 half played (headless renders).
//
// Layout (px of the 1920x1080 canvas): title + caption top left; left, the three layers stacked as on the units
// slide (student, interface error, teacher), same 8x8 grid, aligned, with a short link between each pair of
// corresponding neurons and the unit circuit's four synapses as side arcs; memory circle (previous slide) right.
// Colours as in the deck: activity greys (negative white, zero mid grey, positive black), teacher blue,
// student orange, surprise q green, drive arrows blue, kappa the only violet text.

(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const W = 1920, H = 1080;
  const FONT = '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const MATH = '"KaTeX_Math", "Times New Roman", serif';
  const MAIN = '"KaTeX_Main", "Times New Roman", serif';
  const CAL = '"KaTeX_Caligraphic", "KaTeX_Main", serif';

  const C = {
    bg: "#FFFFFF", ink: "#23262D", soft: "#5F6670", rule: "#D9DDE3", frame: "#9AA0A6",
    teacher: "#378ADD", student: "#D85A30", drive: "#2A78C8", inh: "#E0772B", kappa: "#8E44AD",
    qLow: "#E6E9ED", qHigh: "#3A9A5C", ring: "#3A9A5C",
    digit: ["#FFFFFF", "#D9D9D9", "#B0B0B0", "#8C8C8C", "#666666", "#383838", "#0A0A0A"],
  };

  const L = {
    title: { x: 80, y: 141, size: 60 },
    caption: { x: 80, y: 232, size: 38 },
    // the three layers stacked as on the units slide, same grid, aligned: neuron i above neuron i
    cell: 28, r: 12, pad: 9,
    student: { x: 460, y: 270 },
    error: { x: 460, y: 548 },
    teacher: { x: 460, y: 826 },
    names: { x: 80 },
    circle: { cx: 1490, cy: 615, R: 228, band: 26 },
  };

  // the four steps: transition durations (s); captions for the held states 0..4 (4: during the climb, 5: after)
  const DUR = { a: 2.0, b: 1.6, err: 0.8, drive: 0.7, climb: 8.0 };
  const CAPTIONS = [
    "The teacher stores O and X, the student has learned only O",
    "The teacher settles onto its memories: half O, half X",
    "The student settles: it copies O, but only part of X",
    "What it misses is the interface error: the gradient of its surprise",
    "The drive pushes the teacher along the error: more X, larger error",
    "Until the teacher replays what the student explains worst",
  ];

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lut(stops, n) {
    const rgb = stops.map(hexToRgb), out = [];
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * (rgb.length - 1), j = Math.min(Math.floor(t), rgb.length - 2), f = t - j;
      out.push(`rgb(${rgb[j].map((v, m) => Math.round(v + (rgb[j + 1][m] - v) * f)).join(",")})`);
    }
    return out;
  }
  // "x_T"-style symbol: italic letter + upright-size subscript
  function sym(parent, attrs, base, sub, size) {
    const t = el("text", Object.assign({ "font-family": MATH, "font-style": "italic", "font-size": size,
                                         fill: C.ink }, attrs), parent);
    el("tspan", {}, t).textContent = base;
    if (sub) el("tspan", { "font-size": Math.round(size * 0.68), dy: Math.round(size * 0.24) }, t).textContent = sub;
    return t;
  }
  function tsp(t, text, attrs) { const s = el("tspan", attrs || {}, t); s.textContent = text; return s; }

  // ======================================================================
  class MechPlayer {
    constructor(root, data) {
      this.root = root;
      this.d = data;
      const D = data.d;
      this.N = data.phase.length;
      this.lastA = data.phase.lastIndexOf(0);
      this.lastB = data.phase.lastIndexOf(1);
      this.last = this.N - 1;
      this.mO = data.memories[0];
      this.mX = data.memories[1];
      this.mY = data.memories[2];                 // the student's look-alike of X (absent in older exports)
      this.vmax = Math.max(...data.memories.flat().map(Math.abs));
      // teacher angle from O toward X per frame: the climb is paced by angle (the run itself is slow at
      // the start and the end, tan(theta) grows exponentially), so the picture changes steadily
      this.theta = data.xT.map((x) => {
        let a = 0, b = 0;
        for (let k = 0; k < x.length; k++) { a += this.mO[k] * x[k]; b += this.mX[k] * x[k]; }
        return Math.atan2(b, a);
      });
      this.gain = data.gain || 1 / data.n;        // error grid shown x3 (~1/n): about a full X at F_max
      this.steps = 4;
      this.pos = 0;                               // held state 0..4
      this.anim = null;                           // { step, t } while a transition plays
      this.raf = null;
      this.D = D;
      this.lut = lut(C.digit, 255);
      this.build();
      this.render(this.stateAt(0));
    }

    // ---------- state: what to draw for held position k, or step k played to fraction u ----------
    stateAt(k, step = 0, u = 1) {
      // held: frame, and visibilities of the student dot, the error, the drive
      const held = [
        { f: 0, s: 0, e: 0, v: 0, cap: 0 },
        { f: this.lastA, s: 0, e: 0, v: 0, cap: 1 },
        { f: this.lastB, s: 1, e: 0, v: 0, cap: 2 },
        { f: this.lastB, s: 1, e: 1, v: 0, cap: 3 },
        { f: this.last, s: 1, e: 1, v: 1, cap: 5 },
      ];
      if (!step) return Object.assign({ capA: 1 }, held[k]);
      const p = held[step - 1], q = held[step], st = Object.assign({}, p, { cap: q.cap, capA: 1 });
      if (step === 1) st.f = u * this.lastA;
      if (step === 2) { st.f = this.lastA + u * (this.lastB - this.lastA); st.s = 1; }
      if (step === 3) st.e = smooth(u);
      if (step === 4) {
        const tD = DUR.drive / (DUR.drive + DUR.climb);
        st.v = smooth(u / tD);
        const th0 = this.theta[this.lastB], th1 = this.theta[this.last];
        st.f = this.frameAtTheta(th0 + smooth01lin((u - tD) / (1 - tD)) * (th1 - th0));
        st.cap = u < 1 ? 4 : 5;
      }
      return st;
    }

    frameAtTheta(th) {                            // fractional climb frame where the angle reaches th
      let i = this.lastB;
      while (i < this.last && this.theta[i + 1] < th) i++;
      if (i >= this.last) return this.last;
      const a = this.theta[i], b = this.theta[i + 1];
      return i + clamp((th - a) / (b - a || 1), 0, 1);
    }

    // ---------- DOM ----------
    build() {
      this.root.innerHTML = "";
      const svg = (this.svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet",
                                          "font-family": FONT, role: "img",
                                          "aria-label": "Teacher, student and interface error of a 64-neuron toy: the interface error is the gradient of the student's surprise and drives the teacher to the memory the student lacks" },
                                 this.root));
      const defs = el("defs", {}, svg);
      const mk = (id, col, size) => {
        const m = el("marker", { id, viewBox: "0 0 10 10", refX: 7, refY: 5, markerWidth: size, markerHeight: size,
                                 markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
        el("path", { d: "M0,0 L10,5 L0,10 L2.5,5 z", fill: col }, m);
      };
      mk("mp-up", C.drive, 26); mk("mp-ink", C.ink, 30); mk("mp-drv", C.drive, 30);
      const inh = el("marker", { id: "mp-inh", viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 18, markerHeight: 18,
                                 markerUnits: "userSpaceOnUse" }, defs);
      el("circle", { cx: 5, cy: 5, r: 5, fill: C.inh }, inh);
      const qg = el("linearGradient", { id: "mp-q", x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
      el("stop", { offset: 0, "stop-color": C.qLow }, qg);
      el("stop", { offset: 1, "stop-color": C.qHigh }, qg);

      el("rect", { x: 0, y: 0, width: W, height: H, fill: C.bg }, svg);
      const t = el("text", { x: L.title.x, y: L.title.y, fill: C.ink, "font-size": L.title.size, "font-weight": 650,
                             "letter-spacing": "-0.6" }, svg);
      t.textContent = "How replay climbs the student's surprise";
      this.cap = el("text", { x: L.caption.x, y: L.caption.y, fill: C.soft, "font-size": L.caption.size,
                              "font-weight": 600 }, svg);

      this.buildNetworks(svg);
      this.buildCircle(svg);
    }

    grid(parent, x0, y0, kind) {
      const cells = [], S = this.d.side, c = L.cell;
      for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
        const cx = x0 + L.r + j * c, cy = y0 + L.r + i * c;
        cells.push(kind === "error"
          ? el("rect", { x: cx - L.r, y: cy - L.r, width: 2 * L.r, height: 2 * L.r, rx: 4,
                         stroke: C.ink, "stroke-opacity": 0.22, "stroke-width": 1.5 }, parent)
          : el("circle", { cx, cy, r: L.r, stroke: C.ink, "stroke-opacity": 0.22, "stroke-width": 1.5 }, parent));
      }
      return cells;
    }
    gridSize() { return (this.d.side - 1) * L.cell + 2 * L.r; }

    // small glyph image of a memory (stored / learned, circle axes)
    thumb(parent, x, y, size, m) {
      const S = this.d.side, px = size / S, g = el("g", {}, parent);
      for (let i = 0; i < S; i++) for (let j = 0; j < S; j++)
        el("rect", { x: x + j * px, y: y + i * px, width: px + 0.4, height: px + 0.4, fill: this.color(m[i * S + j]) }, g);
      el("rect", { x, y, width: size, height: size, fill: "none", stroke: C.ink, "stroke-width": 2 }, g);
      return g;
    }

    color(v, gain = 1) {
      const t = clamp((v * gain) / this.vmax, -1, 1);
      return this.lut[Math.round((t + 1) * 127)];
    }

    buildNetworks(svg) {
      const g = el("g", {}, svg), G = this.gridSize(), pad = L.pad, c = L.cell;
      const S = L.student, E = L.error, T = L.teacher, x0 = S.x;
      const frame = (y, col, w) => el("rect", { x: x0 - pad, y: y - pad, width: G + 2 * pad, height: G + 2 * pad, rx: 14,
                                                fill: "none", stroke: col, "stroke-width": w }, g);
      frame(S.y, C.student, 5); frame(E.y, C.frame, 4); frame(T.y, C.teacher, 5);

      // one-to-one: a short link from each neuron column to the same column of the next layer
      const comb = (yTop, yBot) => {
        for (let j = 0; j < this.d.side; j++) {
          const x = x0 + L.r + j * c;
          el("path", { d: `M${x},${yTop + 5} L${x},${yBot - 5}`, stroke: C.frame, "stroke-width": 3,
                       "stroke-linecap": "round" }, g);
        }
      };
      comb(S.y + G + pad, E.y - pad);
      comb(E.y + G + pad, T.y - pad);

      // the unit circuit's synapses as side arcs (as on the Model slides): left = up, right = down
      const xl = x0 - pad - 8, xr = x0 + G + pad + 8, bulge = 46;
      const arc = (x, y1, y2, side, attrs) => el("path", Object.assign({
        d: `M${x},${y1} Q${x + side * bulge},${(y1 + y2) / 2} ${x},${y2}`, fill: "none", "stroke-width": 6,
        "stroke-linecap": "round" }, attrs), g);
      const up = { stroke: C.drive, "marker-end": "url(#mp-up)" };
      arc(xl, T.y + 0.3 * G, E.y + 0.7 * G, -1, up);                                 // x_T -> eps   (+)
      arc(xl, E.y + 0.3 * G, S.y + 0.7 * G, -1, up);                                 // eps -> x_S   (pi_TS)
      arc(xr, S.y + 0.7 * G, E.y + 0.3 * G, 1, { stroke: C.inh, "marker-end": "url(#mp-inh)" });   // x_S -> eps (-)
      const gd = (this.gDrive = el("g", {}, g));                                     // eps -> x_T: kappa, the drive
      el("path", { d: `M${xr},${E.y + 0.7 * G} Q${xr + bulge},${(E.y + 0.7 * G + T.y + 0.3 * G) / 2} ${xr},${T.y + 0.3 * G}`,
                   fill: "none", "stroke-width": 7, "stroke-linecap": "round", stroke: C.drive,
                   "marker-end": "url(#mp-drv)" }, gd);
      sym(gd, { x: xr + bulge - 4, y: (E.y + G + T.y) / 2 + 16 }, "κ", "", 48).setAttribute("fill", C.kappa);

      this.cS = this.grid(g, x0, S.y, "value");
      this.cE = this.grid(g, x0, E.y, "error");
      this.cT = this.grid(g, x0, T.y, "value");

      // names left of each layer, with what each network holds
      const name = (y, txt) => el("text", { x: L.names.x, y, fill: C.ink, "font-size": 40, "font-weight": 750 }, g).textContent = txt;
      const note = (y, txt) => el("text", { x: L.names.x, y, fill: C.soft, "font-size": 30, "font-weight": 600 }, g);
      const th = 58;
      name(S.y + 34, "student");
      note(S.y + 80, "").textContent = "stores";               // what its weights hold: O (+ Y if exported)
      this.thumb(g, L.names.x, S.y + 98, th, this.mO);
      if (this.mY) this.thumb(g, L.names.x + th + 16, S.y + 98, th, this.mY);
      name(E.y + 34, "interface");
      name(E.y + 80, "error");
      this.gainLab = note(E.y + 124, "");
      this.gainLab.textContent = `shown ×${Math.round(this.gain)}`;
      name(T.y + 34, "teacher");
      note(T.y + 80, "").textContent = "stores";
      this.thumb(g, L.names.x, T.y + 98, th, this.mO);
      this.thumb(g, L.names.x + th + 16, T.y + 98, th, this.mX);

      // how much O and X each network shows (projections on the two memories), right of its grid. The student's
      // bars sit in outlines of the teacher's amounts (what it is shown), with the fraction it copies.
      const bx = xr + bulge + 70, b0 = bx + 74, rowsS = [S.y + 62, S.y + 156], rowsT = [T.y + 62, T.y + 156];
      this.bars = { x0: b0, len: 270, h: 40 };
      const mems = [this.mO, this.mX], B = this.bars;
      const bar = (y, attrs) => el("rect", Object.assign({ x: b0, y: y - B.h / 2, width: 0, height: B.h, rx: 6 }, attrs), g);
      this.barS = [], this.barSo = [], this.barT = [], this.pct = [];
      for (let k = 0; k < 2; k++) {
        this.thumb(g, bx, rowsS[k] - 26, 52, mems[k]);
        this.thumb(g, bx, rowsT[k] - 26, 52, mems[k]);
        this.barT.push(bar(rowsT[k], { fill: C.teacher }));
        this.barS.push(bar(rowsS[k], { fill: C.student }));
        this.barSo.push(bar(rowsS[k], { fill: "none", stroke: C.teacher, "stroke-width": 3.5 }));
        this.pct.push(el("text", { x: b0 + B.len + 22, y: rowsS[k] + 12, fill: C.ink, "font-size": 34, "font-weight": 750 }, g));
      }

      // the formula right of the error layer; its gradient part from step 3
      const fx = xr + bulge + 70, fy = E.y + G / 2 - 6;
      const f1 = sym(g, { x: fx, y: fy }, "ε", "TS", 44);
      tsp(f1, " = ", { "font-style": "normal", "font-family": MAIN, dy: -10 });
      tsp(f1, "x"); tsp(f1, "T", { "font-size": 30, dy: 10 });
      tsp(f1, " − ", { "font-style": "normal", "font-family": MAIN, dy: -10 });
      tsp(f1, "x"); tsp(f1, "S", { "font-size": 30, dy: 10 });
      this.fGrad = sym(g, { x: fx + 70, y: fy + 62 }, "", "", 44);
      tsp(this.fGrad, "= ", { "font-style": "normal", "font-family": MAIN });
      tsp(this.fGrad, "∇", { "font-style": "normal", "font-family": MAIN });
      tsp(this.fGrad, "q");
      tsp(this.fGrad, " / ", { "font-style": "normal", "font-family": MAIN });
      tsp(this.fGrad, "π"); tsp(this.fGrad, "TS", { "font-size": 30, dy: 10 });
    }

    buildCircle(svg) {
      const { cx, cy, R, band } = L.circle, g = el("g", {}, svg), n = 180;
      // band coloured by q ~ (component off O)^2, as on the previous slide
      const ql = lut([C.qLow, C.qHigh], 256);
      for (let k = 0; k < n; k++) {
        const a0 = (2 * Math.PI * k) / n, a1 = (2 * Math.PI * (k + 1.15)) / n, am = (a0 + a1) / 2;
        const s2 = Math.sin(am) ** 2;
        el("path", { d: `M${cx + R * Math.cos(a0)},${cy - R * Math.sin(a0)} A${R},${R} 0 0 0 ${cx + R * Math.cos(a1)},${cy - R * Math.sin(a1)}`,
                     fill: "none", stroke: ql[Math.round(s2 * 255)], "stroke-width": band }, g);
      }
      // F_max states: +-X
      for (const s of [1, -1])
        el("circle", { cx, cy: cy - s * R, r: 24, fill: "rgba(58,154,92,0.12)", stroke: C.ring, "stroke-width": 5 }, g);
      el("text", { x: cx, y: cy + 16, fill: C.soft, "font-size": 32, "font-weight": 700, "text-anchor": "middle" }, g).textContent = "teacher memory";
      el("text", { x: cx, y: cy + 54, fill: C.soft, "font-size": 32, "font-weight": 700, "text-anchor": "middle" }, g).textContent = "subspace";
      // axes: the two memories
      const th = 76;
      this.thumb(g, cx + R + 34, cy - th / 2, th, this.mO);
      this.thumb(g, cx - 140 - th / 2, cy - R - 24 - th / 2, th, this.mX);

      // surprise scale + marker
      const b = (this.bar = { x0: cx - 100, x1: cx + 100, y: cy + R + 112 });
      this.gBar = el("g", {}, g);
      const ql2 = el("text", { x: cx, y: b.y - 34, fill: C.soft, "font-size": 32, "font-weight": 700, "text-anchor": "middle" }, this.gBar);
      tsp(ql2, "student surprise ");
      tsp(ql2, "q", { "font-family": MATH, "font-style": "italic", "font-weight": 400, "font-size": 36 });
      el("rect", { x: b.x0, y: b.y, width: b.x1 - b.x0, height: 20, rx: 10, fill: "url(#mp-q)" }, this.gBar);
      el("text", { x: b.x0 - 14, y: b.y + 20, fill: C.soft, "font-size": 32, "font-weight": 700, "text-anchor": "end" }, this.gBar).textContent = "0";
      const fm = el("text", { x: b.x1 + 14, y: b.y + 20, fill: C.soft, "font-size": 32 }, this.gBar);
      tsp(fm, "F", { "font-family": CAL, "font-size": 36 });
      tsp(fm, "max", { "font-family": MAIN, "font-size": 23, dy: 8 });
      this.qMark = el("path", { d: "M-12,-16 L12,-16 L0,0 Z", fill: C.ink }, this.gBar);

      // error vector at x_T (drawn x3 like the grid: a direction), then the drive
      this.gEps = el("g", {}, g);
      this.epsLine = el("path", { fill: "none", stroke: C.ink, "stroke-width": 7, "stroke-linecap": "round",
                                  "marker-end": "url(#mp-ink)" }, this.gEps);
      this.epsLab = el("g", {}, this.gEps);
      this.epsLabK = sym(this.epsLab, { x: 0, y: 0, "text-anchor": "end" }, "κ", "", 42);
      this.epsLabK.setAttribute("fill", C.kappa);
      this.epsLabE = sym(this.epsLab, { x: 0, y: 0 }, "ε", "TS", 42);

      // states
      this.dS = el("circle", { r: 13, fill: C.student, stroke: "#FFFFFF", "stroke-width": 4 }, g);
      this.dT = el("circle", { r: 16, fill: C.teacher, stroke: "#FFFFFF", "stroke-width": 4 }, g);
      this.lT = sym(g, {}, "x", "T", 40);
      this.lS = sym(g, {}, "x", "S", 40);
    }

    // ---------- drawing ----------
    frameVec(f) {
      const i = Math.floor(clamp(f, 0, this.last)), j = Math.min(i + 1, this.last), a = clamp(f, 0, this.last) - i;
      const lerp = (A) => A[i].map((v, k) => v + (A[j][k] - v) * a);
      return { xT: lerp(this.d.xT), xS: lerp(this.d.xS), q: this.d.q[i] + (this.d.q[j] - this.d.q[i]) * a };
    }

    render(st) {
      const { xT, xS, q } = this.frameVec(st.f), D = this.D;
      for (let k = 0; k < D; k++) {
        this.cT[k].setAttribute("fill", this.color(xT[k]));
        this.cS[k].setAttribute("fill", this.color(st.s ? xS[k] : 0));
        this.cE[k].setAttribute("fill", this.color(st.e ? (xT[k] - xS[k]) * st.e : 0, this.gain));
      }
      // error units stay drawn (empty) before step 3; their label + formula fade with the error
      this.cE.forEach((c) => c.setAttribute("fill-opacity", 0.25 + 0.75 * st.e));
      this.fGrad.setAttribute("opacity", st.e);
      this.gainLab.setAttribute("opacity", st.e);
      this.gDrive.setAttribute("opacity", st.v);

      const { cx, cy, R } = L.circle;
      const dot = (x) => {
        let a = 0, b = 0;
        for (let k = 0; k < D; k++) { a += this.mO[k] * x[k]; b += this.mX[k] * x[k]; }
        return [cx + R * a, cy - R * b];
      };
      const [tx, ty] = dot(xT), [sx, sy] = dot(xS);
      // content bars: amounts of O and X in each state
      const amt = (x, m) => { let a = 0; for (let k = 0; k < D; k++) a += m[k] * x[k]; return Math.max(0, a); };
      const B = this.bars;
      [this.mO, this.mX].forEach((m, k) => {
        const aT = amt(xT, m), aS = st.s ? amt(xS, m) : 0;
        this.barT[k].setAttribute("width", B.len * aT);
        this.barS[k].setAttribute("width", B.len * aS);
        this.barSo[k].setAttribute("width", B.len * aT);
        this.barSo[k].setAttribute("opacity", aT > 0.02 ? st.s : 0);      // no hairline outline at zero
        this.barT[k].setAttribute("opacity", aT > 0.02 ? 1 : 0);
        const show = st.s > 0.5 && aT > 0.08;
        this.pct[k].textContent = show ? `${Math.round((100 * aS) / aT)} %` : "";
        this.pct[k].setAttribute("x", B.x0 + B.len * aT + 18);
      });
      this.dT.setAttribute("cx", tx); this.dT.setAttribute("cy", ty);
      const ang = Math.atan2(cy - ty, tx - cx), ca = Math.cos(ang), sa = Math.sin(ang);
      // x_T label outward but turned clockwise, off the error arrow (which points along X, up)
      const al = Math.max(ang - 0.75, 0);         // near O: straight right, above the O thumbnail
      this.lT.setAttribute("x", tx + 58 * Math.cos(al) - 16); this.lT.setAttribute("y", ty - 58 * Math.sin(al) + 14);
      this.dS.setAttribute("cx", sx); this.dS.setAttribute("cy", sy);
      this.dS.setAttribute("opacity", st.s);
      this.lS.setAttribute("x", sx - 46 * ca - 22); this.lS.setAttribute("y", sy + 46 * sa + 16);
      this.lS.setAttribute("opacity", st.s);

      // error vector (its part in the teacher plane), anchored at x_T and magnified: a direction (= grad q), length ~ |eps|
      const ex = (tx - sx) * 2.1, ey = (ty - sy) * 2.1;
      const len = Math.hypot(ex, ey), x0 = tx + (ex / (len || 1)) * 20, y0 = ty + (ey / (len || 1)) * 20;
      this.epsLine.setAttribute("d", `M${x0},${y0} L${tx + ex},${ty + ey}`);
      this.gEps.setAttribute("opacity", len > 30 ? st.e : 0);
      const lx = tx + ex * 0.6 - 18, ly = ty + ey * 0.6 + 14;
      this.epsLabE.setAttribute("x", lx); this.epsLabE.setAttribute("y", ly);
      this.epsLabE.setAttribute("text-anchor", "end");
      this.epsLabK.setAttribute("x", lx - 62); this.epsLabK.setAttribute("y", ly);
      this.epsLabK.setAttribute("opacity", st.v);
      this.epsLine.setAttribute("stroke", st.v > 0.5 ? C.drive : C.ink);
      this.epsLine.setAttribute("marker-end", st.v > 0.5 ? "url(#mp-drv)" : "url(#mp-ink)");

      const b = this.bar, fr = clamp(q / this.d.fmax, 0, 1);
      this.qMark.setAttribute("transform", `translate(${b.x0 + fr * (b.x1 - b.x0)},${b.y - 3})`);
      this.gBar.setAttribute("opacity", st.s);

      if (this.cap.textContent !== CAPTIONS[st.cap]) this.cap.textContent = CAPTIONS[st.cap];
    }

    // ---------- playback ----------
    duration(step) { return [0, DUR.a, DUR.b, DUR.err, DUR.drive + DUR.climb][step]; }

    goTo(k, animate) {
      k = clamp(k, 0, this.steps);
      this.stop();
      if (animate && k === this.pos + 1) {
        this.anim = { step: k, t0: performance.now() };
        const tick = (now) => {
          const u = clamp((now - this.anim.t0) / 1000 / this.duration(k), 0, 1);
          this.render(this.stateAt(0, k, u));
          if (u < 1) this.raf = requestAnimationFrame(tick);
          else { this.anim = null; this.raf = null; this.pos = k; this.render(this.stateAt(k)); }
        };
        this.raf = requestAnimationFrame(tick);
      } else {
        this.pos = k;
        this.render(this.stateAt(k));
      }
    }
    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.anim) this.pos = this.anim.step;   // a transition cut short ends on its held frame
      this.raf = null; this.anim = null;
    }
    show(x) {                                     // debug: 3.5 = step 4 half played
      const k = Math.floor(x), u = x - k;
      this.stop();
      if (u > 0 && k < this.steps) this.render(this.stateAt(0, k + 1, u)); else this.goTo(k, false);
    }
  }

  // linear in time but eased at both ends (the climb itself is already slow-fast-slow)
  function smooth01lin(t) { t = clamp(t, 0, 1); return 0.15 * smooth(t) + 0.85 * t; }

  // ======================================================================
  function mount(elm) {
    if (elm._mech) return elm._mech;
    const name = elm.dataset.mech || "mechanism_climb";
    const data = (window.TALK_DATA || {})[name];
    if (!data) { elm.textContent = `mech-player: no data "${name}"`; return null; }
    const p = (elm._mech = new MechPlayer(elm, data));
    const section = elm.closest(".reveal section");
    if (section) {
      for (let n = 1; n <= p.steps; n++) {
        const frag = document.createElement("span");
        frag.className = "fragment mech-step";
        frag.dataset.mechStep = n;
        section.appendChild(frag);
      }
    }
    const dbg = new URLSearchParams(location.search).get("mech");
    if (dbg !== null) p.debug = parseFloat(dbg);
    return p;
  }

  function hookReveal() {
    const R = window.Reveal;
    if (!R || !R.on || R._mechHooked) return;
    R._mechHooked = true;
    const players = (slide) => (slide ? [...slide.querySelectorAll(".mech-player")].map((e) => e._mech).filter(Boolean) : []);
    const enter = (slide) => {
      document.querySelectorAll(".mech-player").forEach((e) => { if (e._mech && !slide.contains(e)) e._mech.stop(); });
      for (const p of players(slide)) {
        if (p.debug !== undefined) { p.show(p.debug); continue; }
        p.goTo(slide.querySelectorAll(".mech-step.visible").length, false);
      }
    };
    R.on("ready", (e) => enter(e.currentSlide));
    R.on("slidechanged", (e) => enter(e.currentSlide));
    const step = (e, forward) => {
      for (const frag of e.fragments || [e.fragment]) {
        if (!frag || !frag.classList.contains("mech-step")) continue;
        const n = +frag.dataset.mechStep;
        for (const p of players(frag.closest("section"))) p.goTo(forward ? n : n - 1, forward);
      }
    };
    R.on("fragmentshown", (e) => step(e, true));
    R.on("fragmenthidden", (e) => step(e, false));
  }

  function mountAll() {
    document.querySelectorAll(".mech-player").forEach(mount);
    hookReveal();
  }
  window.MechPlayer = MechPlayer;
  mountAll();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
})();
