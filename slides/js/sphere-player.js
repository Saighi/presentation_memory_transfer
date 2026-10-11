// Sphere transfer player: draws the run exported by talkviz/web_export.py (export_sphere), the
// paper's reactivation-transfer figure, as SVG.
//
// Usage (deck or any page):
//   <script src="media/interactive/sphere_transfer.data.js"></script>
//   <div class="sphere-player" data-sphere="sphere_transfer" data-layout="network" data-theme="light"></div>
//   <script src="js/sphere-player.js"></script>      (before js/deck.js in the deck)
//
// Layouts (data-layout, see LAYOUTS), one slide each:
//   "network": live animation. Activity card (cortex / hippocampus) on the left, one sphere per
//              network in the middle (cortex on top, hippocampus below, each row lined up with
//              its activity image), notes on the right. Both states are projected on the
//              hippocampal memory subspace and normalised onto their sphere. Only the hippocampal
//              sphere carries the stored memories. By default each view follows its network's
//              state ("centre on state" toggle next to the speed).
//   "gap" | "drive" | "dW": static. The whole run at once on a flat (Hammer) map of the sphere
//              (path, start and numbered moments only; stored memories with map option memories),
//              a schematic on the left, a time plot on the right. "gap": path coloured early ->
//              late, per-mode transfer gap. "drive": two maps, path coloured by the teacher's
//              speed and by the selection drive. "dW": path coloured by the student weight change.
//
// Options (data attributes): data-theme="dark|light", data-speed="1", data-controls="none"
// (no speed slider / follow toggle), data-follow="off" (fixed camera at start), data-steps="none"
// (no reveal fragments), data-autoplay.
//
// Animated layouts: one invisible reveal fragment per stop; each "next" plays up to the next stop
// and holds. "Next" while a segment plays finishes it at once. Drag a sphere to turn it,
// double-click to reset.
//
// Layout is in px of the deck canvas (1920x1080); the SVG scales to the slide and stays sharp.
// Colours mirror css/talk.css (roles) and js/fmax-player.js (activity map).

(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const W = 1920, H = 1080;
  const SQ2 = Math.SQRT2;

  // activity map (digits, memory thumbnails): greys, negative white, zero mid grey, positive black
  // (a photographic negative of -m), sober and never the blue / red of the two networks.
  const THEMES = {
    dark: {
      bg: "#111316", ink: "#E8EAED", soft: "#A9AEB5", axis: "#5F6670", wire: "#8A919B",
      teacher: "#4A9BEA", student: "#EA6A3A", transfer: "#45B36B", drive: "#B36ED6",
      path: ["#24548F", "#4A9BEA", "#C9E4FF"],       // teacher, early -> late
      spath: ["#7A2A10", "#EA6A3A", "#FFD2BD"],      // student, early -> late
      speed: ["#3A3F47", "#7C838D", "#F4F5F7"],      // slow -> fast
      driveScale: ["#3B2147", "#7E3FA0", "#B36ED6", "#F0DCFB"],
      dWScale: ["#4A2414", "#A8441F", "#EA6A3A", "#FFD9C6"],
      modes: ["#45B36B", "#7FD39A", "#BDEBC9"],
      sphereFill: ["#1C2026", "#14171B"], flatFill: "#171A1F",
      digit: ["#FFFFFF", "#D9D9D9", "#B0B0B0", "#8C8C8C", "#666666", "#383838", "#0A0A0A"],
      memStroke: "#E8EAED", teacherStroke: "#FFFFFF", card: 0.05,
      ringNode: "#222222", plastic: "#4C8DFF", frozenChord: "#8A919B",
    },
    light: {
      bg: "#FFFFFF", ink: "#23262D", soft: "#5F6670", axis: "#9AA0A6", wire: "#7C838D",
      teacher: "#378ADD", student: "#D85A30", transfer: "#3A9A5C", drive: "#8E44AD",
      path: ["#A9CCF0", "#378ADD", "#0B3F7A"],
      spath: ["#F5C2A8", "#D85A30", "#6E2309"],
      speed: ["#C9CDD3", "#8A9099", "#1B1E23"],
      driveScale: ["#DCC7EA", "#B784D3", "#8E44AD", "#45105F"],
      dWScale: ["#F8CDB6", "#EE9A70", "#D85A30", "#6E2309"],
      modes: ["#1B5E3B", "#3A9A5C", "#7BC48E"],
      sphereFill: ["#FFFFFF", "#EEF1F5"], flatFill: "#F7F8FA",
      digit: ["#FFFFFF", "#D9D9D9", "#B0B0B0", "#8C8C8C", "#666666", "#383838", "#0A0A0A"],
      memStroke: "#23262D", teacherStroke: "#FFFFFF", card: 0.04,
      ringNode: "#222222", plastic: "#4C8DFF", frozenChord: "#9AA0A6",
    },
  };

  const FONT = '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const MATH = '"KaTeX_Math", "Times New Roman", serif';

  const SIZES = {
    teacher: 13, memDot: 9, thumb: 58, thumbOff: 44, panelLabel: 32, caption: 21, flow: 21,
    title: 34, noteHead: 29, note: 25, tick: 28, axisLabel: 30, modeLabel: 29, legend: 27, axisU: 28,
    flatDot: 10,
  };

  // layouts, px at 1920x1080. The top-right corner (y < 80, x > 1400) is the deck's section /
  // slide-number tag: keep it clear.
  const LAYOUTS = {
    network: {
      kind: "spheres",
      panel: { x: 30, w: 270, img: 190, yS: 175, yT: 645 },       // image centres y 270 / 740
      balls: [{ role: "student", cx: 700, cy: 270, r: 168 },
              { role: "teacher", cx: 700, cy: 740, r: 168, memories: true }],
      pauses: false,            // one click plays the whole run
      plots: [],
      notes: { kind: "replay", x: 1110, y: 190, right: 1860 },
      legend: { kind: "network", x: 1110, y: 800 },
      controls: { x: 1110, y: 1010 },
      pathBins: 16,
      sizes: SIZES,
    },
    gap: {
      kind: "flat",
      left: "transfer",
      maps: [{ cx: 860, cy: 480, s: 157, color: "time", markers: true, thumb: 62,
               region: { x0: 405, x1: 1310, y0: 120, y1: 900 } }],
      plots: [{ kind: "gap", box: { x0: 1440, x1: 1860, y0: 230, y1: 540 } }],
      notes: { kind: "modes", x: 1380, y: 730 },
      legend: { kind: "flat", x: 860, y: 985, label: "teacher path" },
      sizes: SIZES,
    },
    drive: {
      kind: "flat",
      left: "drive",
      maps: [{ cx: 850, cy: 305, s: 120, color: "speed", thumb: 0, header: "teacher speed",
               region: { x0: 420, x1: 1290, y0: 80, y1: 525 } },
             { cx: 850, cy: 775, s: 120, color: "drive", thumb: 0, header: "selection drive",
               region: { x0: 420, x1: 1290, y0: 552, y1: 1000 } }],
      plots: [{ kind: "drive", box: { x0: 1440, x1: 1860, y0: 230, y1: 500 } }],
      notes: { kind: "drive", x: 1380, y: 680 },
      sizes: SIZES,
    },
    // the question of the F_max part: the whole path with the stored memories, replay sits between them
    mixtures: {
      kind: "flat",
      title: "What does replay track?",
      maps: [{ cx: 690, cy: 585, s: 150, color: "time", memories: true, thumb: 76,
               region: { x0: 120, x1: 1250, y0: 205, y1: 965 } }],
      plots: [],
      notes: { kind: "mixtures", x: 1330, y: 300, right: 1860 },
      legend: { kind: "flat", x: 690, y: 1010, label: "hippocampus path" },
      sizes: SIZES,
    },
    dW: {
      kind: "flat",
      left: "dW",
      maps: [{ cx: 860, cy: 480, s: 157, color: "dW", thumb: 62,
               region: { x0: 405, x1: 1310, y0: 120, y1: 900 } }],
      plots: [{ kind: "dW", box: { x0: 1440, x1: 1860, y0: 230, y1: 500 } }],
      notes: { kind: "dW", x: 1380, y: 680 },
      legend: { kind: "flat", x: 860, y: 985, label: "student weight change" },
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

  function percentile(arr, q) {
    const s = Float64Array.from(arr).sort();
    return s[Math.min(s.length - 1, Math.max(0, Math.round((q / 100) * (s.length - 1))))];
  }

  // vertical block arrow from y0 to y1
  function arrowPath(x, y0, y1, w, hw, hl) {
    const d = Math.sign(y1 - y0), yb = y1 - d * hl;
    return `M${x - w / 2},${y0} L${x + w / 2},${y0} L${x + w / 2},${yb} L${x + hw / 2},${yb} ` +
           `L${x},${y1} L${x - hw / 2},${yb} L${x - w / 2},${yb} Z`;
  }

  // one line of text from runs: "plain" or {t, i: italic, sub, sup, b: bold, w: weight, c: colour,
  // m: maths font}
  function richLine(parent, x, y, runs, size, color, weight, anchor) {
    const t = el("text", { x, y, fill: color, "font-size": size, "font-weight": weight || 600,
                           "text-anchor": anchor || "start" }, parent);
    for (const r of runs) {
      const run = typeof r === "string" ? { t: r } : r;
      const a = {};
      if (run.i) a["font-style"] = "italic";
      if (run.m) a["font-family"] = MATH;
      if (run.b) a["font-weight"] = 800;
      if (run.w) a["font-weight"] = run.w;
      if (run.dx) a.dx = run.dx;
      if (run.c) a.fill = run.c;
      el("tspan", a, t).textContent = run.t;
      for (const [key, dy] of [["sub", 0.25], ["sup", -0.38]]) {
        if (!run[key]) continue;
        const sz = Math.round(size * 0.68), d = Math.round(size * dy);
        el("tspan", Object.assign({ "font-size": sz, dy: d, "font-style": "normal", "font-family": FONT },
                                  run.c ? { fill: run.c } : {}, run.w ? { "font-weight": run.w } : {}), t)
          .textContent = run[key];
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

  // ---- 3-vector helpers (camera frames) ----
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm3 = (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  // apply to v the smallest rotation taking unit a onto unit b
  function rotAB(a, b, v) {
    const k = cross3(a, b), s = Math.hypot(k[0], k[1], k[2]), c = dot3(a, b);
    if (s < 1e-12) return v.slice();
    const u = [k[0] / s, k[1] / s, k[2] / s], uv = cross3(u, v), ud = dot3(u, v);
    return [0, 1, 2].map((m) => v[m] * c + uv[m] * s + u[m] * ud * (1 - c));
  }
  // camera rows [right, up, towards viewer] for matplotlib-style elevation / azimuth (deg)
  function viewRows(elev, azim) {
    const a = azim * DEG, e = elev * DEG, sa = Math.sin(a), ca = Math.cos(a), se = Math.sin(e), ce = Math.cos(e);
    return [[-sa, ca, 0], [-se * ca, -se * sa, ce], [ce * ca, ce * sa, se]];
  }

  // ---- schematic pieces (left diagrams) ----
  // a network drawn as in the deck's transfer schematic: tinted disc, 8 units, all-to-all chords
  const RING_FILLS = {
    teacher: ["#505356", "#E2E2E3", "#949698", "#E2E2E3", "#636669", "#D8D9D9", "#8A8C8E", "#E2E2E3"],
    student: ["#818385", "#EAEAEB", "#B2B3B5", "#EAEAEB", "#8F9193", "#E3E3E4", "#ABACAE", "#EAEAEB"],
  };
  function ring(parent, cx, cy, R, o) {
    const g = el("g", {}, parent);
    el("circle", { cx, cy, r: R, fill: o.tint, "fill-opacity": o.tintAlpha ?? 0.17 }, g);
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const a = (-141.3 + 45 * k) * DEG, rr = 0.61 * R;
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    const cg = el("g", { stroke: o.chord, "stroke-width": o.chordW || 1.6, "stroke-opacity": o.chordAlpha ?? 0.6,
                         "stroke-linecap": "round" }, g);
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++)
      el("line", { x1: pts[a][0], y1: pts[a][1], x2: pts[b][0], y2: pts[b][1] }, cg);
    const fills = RING_FILLS[o.role] || RING_FILLS.student;
    pts.forEach(([x, y], k) => el("circle", { cx: x, cy: y, r: 0.128 * R, fill: fills[k], stroke: o.node || "#222",
                                              "stroke-width": 2 }, g));
    return g;
  }

  // curved arrow from (x0, y0) to (x1, y1), bowing by `bend` px to the left of travel; head
  // "tri" (excitatory), "dot" (inhibitory) or none. Returns the label anchor (curve middle).
  function curveArrow(parent, x0, y0, x1, y1, o) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    const nx = dy / L, ny = -dx / L;                       // left normal (screen coordinates)
    const cx = mx + 2 * (o.bend || 0) * nx, cy = my + 2 * (o.bend || 0) * ny;
    const w = o.width || 5, head = o.head || "tri";
    // stop the stroke short of the head
    const tx = x1 - cx, ty = y1 - cy, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
    const hl = head === "tri" ? 4.2 * w + 6 : head === "dot" ? 1.7 * w + 4 : 0;
    const ex = x1 - ux * (head === "tri" ? hl * 0.7 : 0), ey = y1 - uy * (head === "tri" ? hl * 0.7 : 0);
    const g = el("g", {}, parent);
    el("path", { d: `M${x0},${y0} Q${cx},${cy} ${ex},${ey}`, fill: "none", stroke: o.color, "stroke-width": w,
                 "stroke-linecap": "round", "stroke-opacity": o.alpha ?? 1 }, g);
    if (head === "tri") {
      const hw = hl * 0.55;
      el("path", { d: `M${x1},${y1} L${x1 - ux * hl - uy * hw},${y1 - uy * hl + ux * hw} ` +
                      `L${x1 - ux * hl * 0.72},${y1 - uy * hl * 0.72} L${x1 - ux * hl + uy * hw},${y1 - uy * hl - ux * hw} Z`,
                   fill: o.color, "fill-opacity": o.alpha ?? 1 }, g);
    } else if (head === "dot") {
      el("circle", { cx: x1 - ux * hl * 0.45, cy: y1 - uy * hl * 0.45, r: hl * 0.48, fill: o.color,
                     "fill-opacity": o.alpha ?? 1 }, g);
    }
    // quadratic midpoint
    return [0.25 * x0 + 0.5 * cx + 0.25 * ex, 0.25 * y0 + 0.5 * cy + 0.25 * ey, g];
  }

  let instances = 0;

  // ======================================================================
  class SpherePlayer {
    constructor(root, data, opts = {}) {
      this.root = root;
      this.d = data;
      this.id = `sp${instances++}`;
      this.opts = Object.assign({ theme: "light", layout: "network", speed: 1, autoplay: false, controls: true,
                                  axes: true, swing: 0, autoDelay: 1.5, follow: true }, opts);
      this.L = LAYOUTS[this.opts.layout] || LAYOUTS.network;
      this.flat = this.L.kind === "flat";
      if (this.opts.controls && !this.flat) {
        try { const s = parseFloat(localStorage.getItem("sphere-speed")); if (s > 0) this.opts.speed = s; } catch (e) { /* no storage */ }
      }
      const r = data.rec;
      this.N = data.n_records;
      this.P = data.mem.length;
      this.T = r.t;
      this.xT = b64ToInt8(data.digits.x_T);
      this.xS = b64ToInt8(data.digits.x_S);
      this.stops = this.flat ? [] : this.L.pauses === false ? data.pacing.stops.slice(-1) : data.pacing.stops;
      this.steps = this.stops.length;
      this.pos = 0;
      this.tNow = this.flat ? data.t_end : 0;
      this.phase = "held";      // held | play
      this.phaseT = 0;
      this.wall = 0;
      this.dragAz = 0;          // view turned by dragging (deg)
      this.dragEl = 0;
      this.active = false;
      this.raf = null;
      this.lastDigit = -2;
      this.build();
      this.render();
    }

    // ---------- data ----------
    // teacher (unit sphere) or student (inside it) position of record i
    vec(role, i) {
      const r = this.d.rec;
      // the cortex on the same axes, normalised like the hippocampus (silent, zero, at t = 0)
      const st = role === "student";
      const x = st ? r.sx[i] : r.x[i], y = st ? r.sy[i] : r.y[i], z = st ? r.sz[i] : r.z[i];
      const n = Math.hypot(x, y, z);
      if (n < 1e-6) return [0, 0, 0];
      return [x / n, y / n, z / n];
    }

    // colour scale of a quantity along the run: value per record, and the range the colours span
    scale(kind) {
      const T = this.Tm, r = this.d.rec, d = this.d;
      if (kind === "time") return { stops: T.path, val: (i) => r.t[i] / d.t_end, lo: 0, hi: 1, labels: ["early", "late"] };
      const key = kind === "drive" ? "drive" : kind === "dW" ? "dW" : "speed";
      const a = r[key], late = [];
      for (let i = 0; i < this.N; i++) if (r.t[i] >= 25) late.push(a[i]);    // drive starts at |kappa| (silent student)
      const stops = kind === "drive" ? T.driveScale : kind === "dW" ? T.dWScale : T.speed;
      return { stops, val: (i) => a[i], lo: percentile(late, 2), hi: percentile(late, 99.5),
               labels: kind === "speed" ? ["slow", "fast"] : ["low", "high"] };
    }

    // camera frames that keep each network's (smoothed) state at the centre of its sphere, carried
    // from record to record by the smallest rotation (no roll). Records x 9 numbers.
    followFrames(role) {
      this.frames = this.frames || {};
      if (this.frames[role]) return this.frames[role];
      const N = this.N, dt = this.T[1] - this.T[0], sig = 50 / dt, K = Math.ceil(3 * sig);
      const raw = [];
      for (let i = 0; i < N; i++) {
        let v = this.vec(role, i);
        if (Math.hypot(v[0], v[1], v[2]) < 1e-3) v = this.vec("teacher", i);   // silent student at t = 0
        raw.push(norm3(v));
      }
      const dirs = [];
      for (let i = 0; i < N; i++) {
        const s = [0, 0, 0];
        for (let k = -K; k <= K; k++) {
          const j = clamp(i + k, 0, N - 1), w = Math.exp(-0.5 * (k / sig) ** 2);
          s[0] += w * raw[j][0]; s[1] += w * raw[j][1]; s[2] += w * raw[j][2];
        }
        dirs.push(norm3(s));
      }
      const v0 = viewRows(this.d.view.elev, this.d.view.azim);
      let rows = v0.map((row) => rotAB(v0[2], dirs[0], row));
      const out = new Float64Array(9 * N);
      for (let i = 0; i < N; i++) {
        if (i) rows = rows.map((row) => rotAB(dirs[i - 1], dirs[i], row));
        rows[2] = dirs[i];
        out.set([...rows[0], ...rows[1], ...rows[2]], 9 * i);
      }
      return (this.frames[role] = out);
    }

    // ---------- geometry ----------
    setView(ball, i, j, f) {
      let rows;
      if (this.opts.follow) {
        const F = this.followFrames(ball.role), a = 9 * i, b = 9 * j;
        const lr = (k) => [0, 1, 2].map((m) => F[a + 3 * k + m] + (F[b + 3 * k + m] - F[a + 3 * k + m]) * f);
        const e3 = norm3(lr(2)), e1r = lr(0), e1 = norm3(e1r.map((v, m) => v - dot3(e1r, e3) * e3[m]));
        rows = [e1, cross3(e3, e1), e3];
      } else {
        const v = this.d.view;
        const sway = this.opts.swing ? 9 * Math.sin((2 * Math.PI * this.wall) / 26) * this.opts.swing : 0;
        rows = viewRows(clamp(v.elev, -80, 80), v.azim + sway);
      }
      // dragging turns the view about the screen axes
      if (this.dragAz || this.dragEl) {
        const a = this.dragAz * DEG, e = this.dragEl * DEG;
        const r1 = rows[0].map((v, m) => Math.cos(a) * v - Math.sin(a) * rows[2][m]);
        const r3 = rows[0].map((v, m) => Math.sin(a) * v + Math.cos(a) * rows[2][m]);
        const r2 = rows[1].map((v, m) => Math.cos(e) * v - Math.sin(e) * r3[m]);
        rows = [r1, r2, rows[1].map((v, m) => Math.sin(e) * v + Math.cos(e) * r3[m])];
      }
      ball.R = rows;
    }
    proj(ball, x, y, z) {
      const R = ball.R, s = ball.spec;
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
                                          "aria-label": "Teacher activity on its memory sphere during transfer" },
                                 this.root));
      this.digLut = lutRgb(T.digit, 255);
      this.defs = el("defs", {}, svg);
      const rg = el("radialGradient", { id: `${id}-ball`, cx: 0.38, cy: 0.32, r: 0.75 }, this.defs);
      el("stop", { offset: 0, "stop-color": T.sphereFill[0] }, rg);
      el("stop", { offset: 1, "stop-color": T.sphereFill[1] }, rg);
      this.gradient(`${id}-act`, T.digit);

      el("rect", { x: 0, y: 0, width: W, height: H, fill: T.bg }, svg);
      // slide title drawn in the SVG, at the place and size of the deck's h2
      if (this.L.title) el("text", { x: 80, y: 141, fill: T.ink, "font-size": 60, "font-weight": 650,
                                     "letter-spacing": "-0.6" }, svg).textContent = this.L.title;
      if (this.L.panel) this.buildPanel(svg);
      this.balls = (this.L.balls || []).map((spec) => this.buildBall(svg, spec));
      this.maps = this.flat ? this.L.maps.map((spec, k) => this.buildMap(svg, spec, k)) : [];
      if (this.L.left) this.buildDiagram(svg, this.L.left);
      this.plots = this.L.plots.map((spec, k) => this.buildPlot(svg, this.plotSpec(spec), k));
      this.buildNotes(svg);
      this.buildLegend(svg);
      if (this.opts.controls && !this.flat) this.buildControls();
      if (this.balls.length) this.hookDrag();
    }

    gradient(gid, stops) {
      const g = el("linearGradient", { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 }, this.defs);
      stops.forEach((c, k) => el("stop", { offset: k / (stops.length - 1), "stop-color": c }, g));
      return `url(#${gid})`;
    }

    // horizontal colour bar with end labels, left end at x, centred on y
    colorBar(g, x, y, w, stops, labels, gid) {
      const T = this.Tm, S = this.L.sizes;
      const t0 = el("text", { x, y, fill: T.soft, "font-size": S.legend, "font-weight": 700,
                              "dominant-baseline": "central" }, g);
      t0.textContent = labels[0];
      const w0 = labels[0].length * S.legend * 0.56 + 14;
      el("rect", { x: x + w0, y: y - 7, width: w, height: 14, rx: 7, fill: this.gradient(gid, stops) }, g);
      el("text", { x: x + w0 + w + 14, y, fill: T.soft, "font-size": S.legend, "font-weight": 700,
                   "dominant-baseline": "central" }, g).textContent = labels[1];
      return x + w0 + w + 14 + labels[1].length * S.legend * 0.56;
    }

    // a 28x28 digit drawn on a canvas and shown as a pixelated SVG image
    digitImage(parent, x, y, size) {
      return el("image", { x, y, width: size, height: size, preserveAspectRatio: "none",
                           style: "image-rendering: pixelated; image-rendering: crisp-edges" }, parent);
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
    // memory j with sign sg as a framed thumbnail at (x, y) top-left
    memoryThumb(parent, j, sg, x, y, size, o = {}) {
      const g = el("g", { opacity: o.alpha ?? 1 }, parent);
      const img = this.digitImage(g, x, y, size);
      const src = b64ToInt8(this.d.mem_img[j]), arr = new Int8Array(src.length);
      for (let c = 0; c < src.length; c++) arr[c] = sg * src[c];
      this.paintDigit(img, arr, 0);
      // frame on the image's own edge (outside it, the zero colour showed as a white seam)
      el("rect", { x, y, width: size, height: size, rx: 3, fill: "none",
                   stroke: o.stroke || this.Tm.memStroke, "stroke-width": o.strokeW || 3,
                   "stroke-dasharray": o.dash || "none" }, g);
      return { g, img };
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
      this.digits = {};
      // name in the role colour, role in soft grey; image with rounded corners and a thin frame
      for (const [role, y0, name, above] of [["student", p.yS, "cortex", true],
                                             ["teacher", p.yT, "hippocampus", false]]) {
        const clip = el("clipPath", { id: `${id}-${role}-img` }, this.defs);
        el("rect", { x: ix, y: y0, width: p.img, height: p.img, rx: 12 }, clip);
        const img = this.digitImage(el("g", { "clip-path": `url(#${id}-${role}-img)` }, g), ix, y0, p.img);
        el("rect", { x: ix, y: y0, width: p.img, height: p.img, rx: 12, fill: "none",
                     stroke: T[role], "stroke-width": 3.5 }, g);
        const yName = above ? y0 - 52 : y0 + p.img + 44;
        el("text", { x: mid, y: yName, fill: T.ink, "font-size": S.panelLabel, "font-weight": 800,
                     "text-anchor": "middle" }, g).textContent = name;
        const yCap = yName + 30;
        if (role === "student") {
          el("text", { x: mid, y: yCap, fill: T.soft, "font-size": S.caption, "font-weight": 600,
                       "text-anchor": "middle" }, g).textContent = "student · learning";
        } else {
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
      el("path", { fill: T.teacher, d: arrowPath(this.xReplay, this.arrowBot, this.arrowTop, 7, 26, 24) }, g);
      this.error = el("path", { fill: T.student }, g);
      el("text", { x: this.xReplay + 16, y: ym - 18, fill: T.soft, "font-size": S.flow, "font-weight": 700,
                   "dominant-baseline": "central" }, g).textContent = "replay";
      el("text", { x: this.xError - 16, y: ym + 18, fill: T.soft, "font-size": S.flow, "font-weight": 700,
                   "text-anchor": "end", "dominant-baseline": "central" }, g).textContent = "error";

      // activity colour scale (digit images and memory thumbnails), at the bottom of the card
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

    // one sphere: the teacher's (memories, state on the sphere) or the student's (state inside)
    buildBall(svg, spec) {
      const T = this.Tm, S = this.L.sizes, s = spec, role = spec.role;
      const b = { spec, role, R: null };
      const g = el("g", {}, svg);
      el("circle", { cx: s.cx, cy: s.cy, r: s.r, fill: `url(#${this.id}-ball)` }, g);
      b.wireBack = el("path", { fill: "none", stroke: T.wire, "stroke-width": 1.6, "stroke-opacity": 0.22,
                                "stroke-dasharray": "3 7" }, g);
      const cols = lutRgb(role === "student" ? T.spath : T.path, this.L.pathBins).map((c) => `rgb(${c})`);
      const pathG = (width, alpha) => {
        const pg = el("g", { fill: "none", "stroke-width": width, "stroke-opacity": alpha,
                             "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
        return cols.map((c) => el("path", { stroke: c }, pg));
      };
      b.pathBack = pathG(2.6, 0.3);
      const backMem = el("g", {}, g);
      el("circle", { cx: s.cx, cy: s.cy, r: s.r, fill: T.bg, "fill-opacity": 0.28 }, g);
      el("circle", { cx: s.cx, cy: s.cy, r: s.r, fill: "none", stroke: T.wire, "stroke-width": 2.5,
                     "stroke-opacity": 0.55 }, g);
      b.wireFront = el("path", { fill: "none", stroke: T.wire, "stroke-width": 1.6, "stroke-opacity": 0.35 }, g);
      b.axesG = el("g", { opacity: this.opts.axes ? 1 : 0 }, g);
      b.axes = this.d.axes.map((name) => {
        const line = el("line", { stroke: T.axis, "stroke-width": 2.2 }, b.axesG);
        const lab = el("text", { fill: T.soft, "font-size": S.axisU, "font-style": "italic", "font-weight": 600,
                                 "text-anchor": "middle", "dominant-baseline": "central" }, b.axesG);
        el("tspan", {}, lab).textContent = name[0];
        el("tspan", { "font-size": S.axisU * 0.65, dy: 7, "font-style": "normal" }, lab).textContent = name.slice(1);
        return { line, lab };
      });
      b.pathFront = pathG(4, 0.9);
      const frontMem = el("g", {}, g);
      const tg = el("g", { "stroke-linecap": "round" }, g);
      b.trail = [];
      for (let n = 0; n < 90; n++) b.trail.push(el("line", { stroke: T[role], visibility: "hidden" }, tg));
      b.dot = el("circle", { r: S.teacher, fill: T[role], stroke: T.teacherStroke, "stroke-width": 3.5 }, g);

      // stored memories (teacher only), both signs: dot on the sphere, digit thumbnail just outside
      b.memLayers = [backMem, frontMem];
      b.mems = [];
      if (spec.memories) {
        for (let j = 0; j < this.P; j++) {
          for (const sg of [1, -1]) {
            const grp = el("g", {}, frontMem);
            const link = el("line", { stroke: T.memStroke, "stroke-width": 2, "stroke-opacity": 0.5 }, grp);
            const dotm = el("circle", { r: S.memDot, fill: T.bg, stroke: T.memStroke, "stroke-width": 3.5 }, grp);
            const th = this.memoryThumb(grp, j, sg, 0, 0, S.thumb);
            const m = this.d.mem[j];
            b.mems.push({ v: [sg * m[0], sg * m[1], sg * m[2]], grp, link, dot: dotm, img: th.img,
                          frame: th.g.lastChild, back: null });
          }
        }
      }
      return b;
    }

    // static Hammer map of the sphere with the whole run on it
    buildMap(svg, spec, k) {
      const T = this.Tm, S = this.L.sizes, d = this.d, r = d.rec, Rf = d.flat.R;
      const m = { spec, cx: spec.cx, cy: spec.cy, s: spec.s };
      const g = el("g", {}, svg);
      const ll = (lon, lat) => {
        const den = Math.sqrt(1 + Math.cos(lat) * Math.cos(lon / 2));
        return [m.cx + m.s * 2 * SQ2 * Math.cos(lat) * Math.sin(lon / 2) / den, m.cy - m.s * SQ2 * Math.sin(lat) / den];
      };
      const toMap = (v) => {
        const a = [0, 1, 2].map((q) => Rf[q][0] * v[0] + Rf[q][1] * v[1] + Rf[q][2] * v[2]);
        const n = Math.hypot(a[0], a[1], a[2]) || 1;
        const lon = Math.atan2(a[1], a[0]), lat = Math.asin(clamp(a[2] / n, -1, 1));
        return [...ll(lon, lat), lon];
      };
      m.toMap = toMap;
      const rx = 2 * SQ2 * m.s, ry = SQ2 * m.s;
      el("ellipse", { cx: m.cx, cy: m.cy, rx, ry, fill: T.flatFill }, g);
      // graticule: meridians and parallels every 30 deg
      let gd = "";
      for (let lo = -150; lo <= 150; lo += 30) {
        for (let n = 0; n <= 60; n++) {
          const [x, y] = ll(lo * DEG, (-90 + 3 * n) * DEG);
          gd += `${n ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
        }
      }
      for (let la = -60; la <= 60; la += 30) {
        for (let n = 0; n <= 72; n++) {
          const [x, y] = ll((-180 + 5 * n) * DEG, la * DEG);
          gd += `${n ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
        }
      }
      el("path", { d: gd, fill: "none", stroke: T.wire, "stroke-width": 1.3, "stroke-opacity": 0.22 }, g);
      el("ellipse", { cx: m.cx, cy: m.cy, rx, ry, fill: "none", stroke: T.wire, "stroke-width": 2.5,
                      "stroke-opacity": 0.55 }, g);

      // the whole path, coloured by the map's quantity (bins drawn low -> high: peaks on top)
      const P = [];
      for (let i = 0; i < this.N; i++) P.push(toMap(this.vec("teacher", i)));
      m.P = P;
      const sc = (m.scale = this.scale(spec.color)), NB = 24;
      const cols = lutRgb(sc.stops, NB), dd = new Array(NB).fill("");
      for (let i = 0; i + 1 < this.N; i++) {
        if (Math.abs(P[i + 1][2] - P[i][2]) > Math.PI) continue;            // across the cut
        const v = (sc.val(i) + sc.val(i + 1)) / 2;
        const q = clamp(Math.floor(((v - sc.lo) / (sc.hi - sc.lo)) * NB), 0, NB - 1);
        dd[q] += `M${P[i][0].toFixed(1)},${P[i][1].toFixed(1)}L${P[i + 1][0].toFixed(1)},${P[i + 1][1].toFixed(1)}`;
      }
      const pg = el("g", { fill: "none", "stroke-width": spec.s < 135 ? 4 : 4.5, "stroke-linecap": "round",
                           "stroke-linejoin": "round" }, g);
      cols.forEach((c, q) => { if (dd[q]) el("path", { d: dd[q], stroke: `rgb(${c})` }, pg); });

      // stored memories (both signs) only with spec.memories: dots, plus thumbnails if spec.thumb
      const dots = [];
      if (spec.memories) for (let j = 0; j < this.P; j++) for (const sg of [1, -1]) {
        const v = this.d.mem[j], [x, y] = toMap([sg * v[0], sg * v[1], sg * v[2]]);
        dots.push({ j, sg, x, y });
      }
      const obstacles = [];                    // boxes the thumbnails keep off: {x, y, hw, hh}
      const mg = el("g", {}, g);               // thumbnails and memory dots
      const top = el("g", {}, g);              // start label, markers: drawn over the thumbnails

      // header above the map with the colour bar of its quantity
      if (spec.header) {
        const hx = m.cx - rx, hy = m.cy - ry - 22;
        el("text", { x: hx, y: hy, fill: T.ink, "font-size": 28, "font-weight": 800 }, g).textContent = spec.header;
        const end = this.colorBar(g, hx + spec.header.length * 15.5 + 24, hy - 9, 96, sc.stops, sc.labels, `${this.id}-map${k}`);
        obstacles.push({ x: (hx + end) / 2, y: hy - 9, hw: (end - hx) / 2 + 8, hh: 24 });
      }

      // start of the run
      const [sx0, sy0] = P[0];
      el("circle", { cx: sx0, cy: sy0, r: 8, fill: T.ink, stroke: T.bg, "stroke-width": 2.5 }, top);
      const sd = this.clearestDir(P, sx0, sy0, 44, dots, obstacles);
      const lx = sx0 + 44 * sd[0], ly = sy0 + 44 * sd[1];
      el("text", { x: lx, y: ly, fill: T.ink, "font-size": 23, "font-weight": 800, "text-anchor": "middle",
                   "dominant-baseline": "central" }, top).textContent = "start";
      obstacles.push({ x: lx, y: ly, hw: 34, hh: 16 }, { x: sx0, y: sy0, hw: 12, hh: 12 });

      // pause markers: where the teacher was at the moments the plot marks
      if (spec.markers) {
        (this.d.markers || []).forEach((mk, n) => {
          const [x, y] = toMap(mk.x), dir = this.clearestDir(P, x, y, 50, dots, obstacles);
          const tx = x + 50 * dir[0], ty = y + 50 * dir[1];
          el("circle", { cx: x, cy: y, r: 20, fill: "none", stroke: T.ink, "stroke-width": 2.5 }, top);
          el("line", { x1: x + 20 * dir[0], y1: y + 20 * dir[1], x2: tx - 16 * dir[0], y2: ty - 16 * dir[1],
                       stroke: T.ink, "stroke-width": 2 }, top);
          el("circle", { cx: tx, cy: ty, r: 16, fill: T.ink }, top);
          el("text", { x: tx, y: ty + 1, fill: T.bg, "font-size": 21, "font-weight": 800, "text-anchor": "middle",
                       "dominant-baseline": "central" }, top).textContent = String(n + 1);
          obstacles.push({ x: tx, y: ty, hw: 18, hh: 18 }, { x, y, hw: 22, hh: 22 });
        });
      }

      // thumbnails off the path, the dots and the labels
      const placed = spec.memories && spec.thumb ? this.placeThumbs(dots, P, spec.thumb, spec.region, obstacles) : [];
      for (const p of placed) {
        el("line", { x1: p.x, y1: p.y, x2: p.lx, y2: p.ly, stroke: T.memStroke, "stroke-width": 2,
                     "stroke-opacity": 0.55 }, mg);
        this.memoryThumb(mg, p.j, p.sg, p.tx - spec.thumb / 2, p.ty - spec.thumb / 2, spec.thumb);
      }
      for (const p of dots) el("circle", { cx: p.x, cy: p.y, r: S.flatDot, fill: T.bg, stroke: T.memStroke,
                                           "stroke-width": 3.5 }, mg);
      return m;
    }

    // direction (unit vector) from (x, y) at distance dist with the fewest path points / dots nearby
    clearestDir(P, x, y, dist, dots = [], boxes = []) {
      let best = [1, 0], bestC = Infinity;
      for (let q = 0; q < 16; q++) {
        const a = (q * Math.PI) / 8, cx = x + dist * Math.cos(a), cy = y + dist * Math.sin(a);
        let c = 0;
        for (const p of P) { const dd = Math.hypot(p[0] - cx, p[1] - cy); if (dd < 30) c += 30 - dd; }
        for (const p of dots) { const dd = Math.hypot(p.x - cx, p.y - cy); if (dd < 36) c += 3 * (36 - dd); }
        for (const b of boxes) if (Math.abs(cx - b.x) < b.hw + 24 && Math.abs(cy - b.y) < b.hh + 20) c += 200;
        c += 2 * Math.abs(Math.sin(a));       // prefer sideways (labels read better)
        if (c < bestC) { bestC = c; best = [Math.cos(a), Math.sin(a)]; }
      }
      return best;
    }

    // thumbnail per memory dot: near its dot, off the path, off the other dots and thumbnails,
    // inside `region`. Greedy, most crowded dot first.
    placeThumbs(dots, P, size, region, boxes) {
      const half = size / 2 + 6, placed = [];
      const pts = P.map((p) => [p[0], p[1]]);
      for (let i = 0; i + 1 < P.length; i++)       // denser sampling along long segments
        if (Math.abs(P[i + 1][2] - P[i][2]) < Math.PI) pts.push([(P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2]);
      const inBox = (cx, cy, x, y, h) => Math.abs(x - cx) < h && Math.abs(y - cy) < h;
      const crowd = (d) => pts.reduce((n, p) => n + (Math.hypot(p[0] - d.x, p[1] - d.y) < 2 * size), 0);
      const order = dots.map((d) => ({ d, c: crowd(d) })).sort((a, b) => b.c - a.c).map((o) => o.d);
      for (const d of order) {
        let best = null, bestC = Infinity;
        for (const rad of [0.95, 1.15, 1.4, 1.75, 2.2, 2.8]) {
          for (let q = 0; q < 24; q++) {
            const a = (q * Math.PI) / 12, cx = d.x + rad * size * Math.cos(a), cy = d.y + rad * size * Math.sin(a);
            if (cx - half < region.x0 || cx + half > region.x1 || cy - half < region.y0 || cy + half > region.y1) continue;
            let c = 0;
            for (const p of pts) if (inBox(cx, cy, p[0], p[1], half + 4)) c += 40;
            for (const o of dots) if (inBox(cx, cy, o.x, o.y, half + 12)) c += 400;
            for (const o of placed) if (inBox(cx, cy, o.tx, o.ty, 2 * half + 4)) c += 5000;
            for (const b of boxes) if (Math.abs(cx - b.x) < half + b.hw && Math.abs(cy - b.y) < half + b.hh) c += 3000;
            // the leader line should not cut through the path
            const ux = Math.cos(a), uy = Math.sin(a), len = rad * size - half;
            for (const p of pts) {
              const px = p[0] - d.x, py = p[1] - d.y, along = px * ux + py * uy;
              if (along > 12 && along < len && Math.abs(px * uy - py * ux) < 5) c += 6;
            }
            c += 0.6 * rad * size;
            if (c < bestC) { bestC = c; best = { cx, cy, a, rad }; }
          }
        }
        if (!best) best = { cx: d.x, cy: d.y - size, a: -Math.PI / 2, rad: 1 };
        const ux = Math.cos(best.a), uy = Math.sin(best.a);
        // leader from the dot's rim to the thumbnail's edge
        const toEdge = (size / 2 + 2) / Math.max(Math.abs(ux), Math.abs(uy));
        placed.push({ j: d.j, sg: d.sg, x: d.x + 10 * ux, y: d.y + 10 * uy, tx: best.cx, ty: best.cy,
                      lx: best.cx - toEdge * ux, ly: best.cy - toEdge * uy });
      }
      return placed;
    }

    // ---------- left schematics (flat slides) ----------
    buildDiagram(svg, kind) {
      const T = this.Tm, g = el("g", {}, svg), cx = 210;
      const label = (y, name, cap, role, padlock) => {
        el("text", { x: cx, y, fill: T.ink, "font-size": 32, "font-weight": 800, "text-anchor": "middle" }, g)
          .textContent = name;
        const c = el("text", { x: cx + (padlock ? 14 : 0), y: y + 30, fill: T.soft, "font-size": 21, "font-weight": 600,
                               "text-anchor": "middle" }, g);
        c.textContent = cap;
        if (padlock) {
          const w = (c.getComputedTextLength && c.getComputedTextLength()) || 240;
          lock(g, cx + 14 - w / 2 - 27, y + 12, 19, T.soft);
        }
      };
      if (kind === "transfer") {
        // the stored memories go from the hippocampus (teacher) to the cortex (student)
        const size = 58, gap = 12, x0 = cx - (3 * size + 2 * gap) / 2;
        label(150, "cortex", "student · learning", "student");
        for (let j = 0; j < this.P; j++)
          this.memoryThumb(g, j, 1, x0 + j * (size + gap), 205, size,
                           { alpha: 0.35, stroke: T.student, dash: "5 5", strokeW: 2.5 });
        ring(g, cx, 395, 88, { role: "student", tint: T.student, chord: T.plastic });
        // transfer arrow
        el("path", { d: arrowPath(cx, 610, 500, 22, 52, 36), fill: T.transfer }, g);
        el("text", { x: cx + 40, y: 560, fill: T.ink, "font-size": 28, "font-weight": 800,
                     "dominant-baseline": "central" }, g).textContent = "transfer";
        ring(g, cx, 715, 88, { role: "teacher", tint: T.teacher, chord: T.frozenChord });
        for (let j = 0; j < this.P; j++)
          this.memoryThumb(g, j, 1, x0 + j * (size + gap), 822, size, { stroke: T.teacher });
        label(925, "hippocampus", "teacher · stores the memories", "teacher");
        return;
      }
      if (kind === "drive") {
        // the unit circuit of the Model slides: inputs to eps_TS on the right going down / left going up,
        // eps_TS -> x_S (pi_TS) and x_T -> eps_TS on the left, x_S -| eps_TS and eps_TS -> x_T (kappa) on the right
        const yS = 250, yE = 505, yT = 760, ru = 50;
        el("text", { x: cx, y: yS - 82, fill: T.ink, "font-size": 30, "font-weight": 800, "text-anchor": "middle" }, g)
          .textContent = "cortex";
        el("text", { x: cx, y: yT + 104, fill: T.ink, "font-size": 30, "font-weight": 800, "text-anchor": "middle" }, g)
          .textContent = "hippocampus";
        const exc = "#4C8DFF", inh = "#E0772B";
        curveArrow(g, cx - 30, yE - 40, cx - 30, yS + ru - 2, { bend: 24, color: exc, width: 5, head: "tri" });
        curveArrow(g, cx + 30, yS + ru - 4, cx + 30, yE - 40, { bend: 24, color: inh, width: 5, head: "dot" });
        curveArrow(g, cx - 30, yT - ru + 4, cx - 30, yE + 38, { bend: 24, color: exc, width: 5, head: "tri" });
        // the selection drive: the interface error pushes the teacher through kappa (synapse blue as
        // every excitatory one; the kappa label violet, as the drive's colour scale)
        const [lx, ly] = curveArrow(g, cx + 30, yE + 40, cx + 30, yT - ru + 2, { bend: 24, color: exc, width: 5, head: "tri" });
        richLine(g, lx + 24, ly + 10, [{ t: "κ", i: true, m: true }, " ", { t: "ε", i: true, m: true, sub: "TS" }],
                 34, T.drive, 800);
        // units
        el("circle", { cx, cy: yS, r: ru, fill: T.bg, stroke: T.ink, "stroke-width": 4 }, g);
        el("circle", { cx, cy: yS, r: ru - 2, fill: T.student, "fill-opacity": 0.17 }, g);
        richLine(g, cx, yS + 12, [{ t: "x", i: true, m: true }, { t: "", sub: "S" }], 40, T.ink, 700, "middle");
        el("rect", { x: cx - 68, y: yE - 38, width: 136, height: 76, rx: 10, fill: T.bg, stroke: T.soft,
                     "stroke-width": 3.5, "stroke-dasharray": "9 6" }, g);
        richLine(g, cx, yE + 12, [{ t: "ε", i: true, m: true }, { t: "", sub: "TS" }], 40, T.ink, 700, "middle");
        el("circle", { cx, cy: yT, r: ru, fill: T.bg, stroke: T.ink, "stroke-width": 4 }, g);
        el("circle", { cx, cy: yT, r: ru - 2, fill: T.teacher, "fill-opacity": 0.16 }, g);
        richLine(g, cx, yT + 12, [{ t: "x", i: true, m: true }, { t: "", sub: "T" }], 40, T.ink, 700, "middle");
        // definitions
        richLine(g, cx, 945, [{ t: "ε", i: true, m: true, sub: "TS" }, " = ", { t: "x", i: true, m: true, sub: "T" },
                              " − ", { t: "x", i: true, m: true, sub: "S" }], 30, T.ink, 600, "middle");
        return;
      }
      if (kind === "dW") {
        // the cortex's own weights change (orange, as the map), the hippocampus is frozen
        label(150, "cortex", "student · its weights change", "student");
        const c = lutRgb(T.dWScale, 4)[2];
        ring(g, cx, 380, 118, { role: "student", tint: T.student, chord: `rgb(${c})`, chordW: 3.2, chordAlpha: 0.85 });
        richLine(g, cx + 128, 300, [{ t: "W", i: true, m: true, sub: "S" }], 36, T.ink, 700);
        el("path", { d: arrowPath(cx, 640, 525, 9, 32, 28), fill: T.teacher }, g);
        el("text", { x: cx + 26, y: 585, fill: T.soft, "font-size": 24, "font-weight": 700,
                     "dominant-baseline": "central" }, g).textContent = "replay";
        ring(g, cx, 730, 82, { role: "teacher", tint: T.teacher, chord: T.frozenChord });
        label(860, "hippocampus", "teacher · weights frozen", "teacher", true);
        // learning rule
        el("rect", { x: cx - 175, y: 935, width: 350, height: 64, rx: 12, fill: T.ink, "fill-opacity": 0.05 }, g);
        richLine(g, cx, 978, [{ t: "Ẇ", i: true, m: true, sub: "S" }, " = ", { t: "η π", i: true, m: true },
                              { t: "", sub: "S" }, " ", { t: "ε", i: true, m: true, sub: "S" }, " ",
                              { t: "x", i: true, m: true, sub: "S", sup: "⊤" }], 32, T.ink, 600, "middle");
      }
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
          : [{ t: "student weight change" }, { t: "  (×10", c: T.soft, w: 600 },
             { t: "", sup: "−3", c: T.soft, w: 600 }, { t: ")", c: T.soft, w: 600 }],
        titleGap: 56,
        series: [{ key: spec.kind, color: isDrive ? T.drive : T.student }],
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
      // time strip under the axis in the path's early -> late colours (links the plot to the map)
      if (spec.timeStrip) el("rect", { x: p.x0, y: p.y1 + 4, width: p.x1 - p.x0, height: 10, rx: 3,
                                       fill: this.gradient(`${this.id}-strip${idx}`, T.path) }, g);
      for (let t = 0; t <= d.t_end + 1; t += 2000) {
        const x = X(t);
        el("line", { x1: x, x2: x, y1: p.y1, y2: p.y1 + (spec.timeStrip ? 18 : 10), stroke: T.axis, "stroke-width": 3 }, g);
        if (spec.xLabels)
          el("text", { x, y: p.y1 + 48, fill: T.soft, "font-size": S.tick, "font-weight": 700,
                       "text-anchor": "middle" }, g).textContent = String(t / 1000);
      }
      if (spec.xLabels) {
        const xl = el("text", { x: (p.x0 + p.x1) / 2, y: p.y1 + 96, fill: T.ink, "font-size": S.axisLabel,
                                "font-weight": 700, "text-anchor": "middle" }, g);
        xl.textContent = "time (×10";
        el("tspan", { "font-size": S.axisLabel * 0.65, dy: -12 }, xl).textContent = "3";
        el("tspan", { dy: 12 }, xl).textContent = ")";
      }
      el("path", { d: `M${p.x0},${p.y0 - 10} L${p.x0},${p.y1} L${p.x1},${p.y1}`, fill: "none",
                   stroke: T.axis, "stroke-width": 3 }, g);

      // curves, revealed up to the current time through a clip
      const clip = el("clipPath", { id: `${this.id}-clip${idx}` }, this.defs);
      const clipRect = el("rect", { x: p.x0, y: p.y0 - 12, width: 0, height: p.y1 - p.y0 + 14 }, clip);
      const cg = el("g", { "clip-path": `url(#${this.id}-clip${idx})` }, g);
      const val = (sr, i) => (sr.n ? r[sr.key][sr.n * i + sr.k] : r[sr.key][i]);
      for (const sr of spec.series) {
        const pts = [];
        for (let i = 0; i < this.N; i++) pts.push([X(r.t[i]), Math.max(p.y0 - 12, Y(val(sr, i)))]);
        const dd = pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("");
        if (spec.fill)
          el("path", { d: `${dd} L${pts[this.N - 1][0]},${p.y1} L${p.x0},${p.y1} Z`, fill: sr.color,
                       "fill-opacity": 0.08 }, cg);
        if (sr.scale) {
          // the curve in the colours of the map, so a colour means the same value on both
          const sc = sr.scale, NB = 24, cols = lutRgb(sc.stops, NB), segs = new Array(NB).fill("");
          for (let i = 0; i + 1 < this.N; i++) {
            const v = (val(sr, i) + val(sr, i + 1)) / 2, q = clamp(Math.floor(((v - sc.lo) / (sc.hi - sc.lo)) * NB), 0, NB - 1);
            segs[q] += `M${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}L${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
          }
          const sg = el("g", { fill: "none", "stroke-width": 5, "stroke-linecap": "round" }, cg);
          cols.forEach((c, q) => { if (segs[q]) el("path", { d: segs[q], stroke: `rgb(${c})` }, sg); });
        } else {
          el("path", { d: dd, fill: "none", stroke: sr.color, "stroke-width": spec.fill ? 5 : 6,
                       "stroke-linejoin": "round" }, cg);
        }
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
      // one dotted line per pause marker, numbered (static maps that show the markers)
      const showMarkers = this.maps.some((m) => m.spec.markers);
      if (showMarkers) {
        (d.markers || []).forEach((m, k) => {
          const x = X(m.t);
          el("line", { x1: x, x2: x, y1: p.y0 - 10, y2: p.y1, stroke: T.ink, "stroke-width": 2.5,
                       "stroke-dasharray": "2 7", "stroke-linecap": "round", "stroke-opacity": 0.7 }, g);
          el("circle", { cx: x, cy: p.y0 - 26, r: 14, fill: T.ink }, g);
          el("text", { x, y: p.y0 - 25, fill: T.bg, "font-size": 18, "font-weight": 800, "text-anchor": "middle",
                       "dominant-baseline": "central" }, g).textContent = String(k + 1);
        });
      }
      return { spec, X, Y, val, clipRect, cursor, dots, box: p };
    }

    // text column: what is shown and what the axes / modes / quantities are
    buildNotes(svg) {
      const T = this.Tm, S = this.L.sizes, n = this.L.notes;
      if (!n) return;
      const g = el("g", {}, svg);
      const lh = S.note * 1.32;
      const right = n.right || this.L.plots[this.L.plots.length - 1].box.x1;
      const rule = (y) => el("line", { x1: n.x, x2: right, y1: y, y2: y, stroke: T.axis, "stroke-width": 1.5,
                                       "stroke-opacity": 0.5 }, g);
      const it = (t, sub, c) => ({ t, i: true, m: true, sub, c });
      if (n.kind === "replay") {
        const u = (k) => ({ t: "u", i: true, m: true, sub: String(k) });
        let y = n.y;
        richLine(g, n.x, y, ["memory replay"], S.noteHead, T.ink, 800);
        ["with no specific input, hippocampal activity explores", "the stored memories and their mixtures"]
          .forEach((w, k) => richLine(g, n.x, y + (k + 1) * lh + 4, [w], S.note, T.soft));
        y += 3 * lh + 52;
        richLine(g, n.x, y, ["the cortex follows the hippocampus"], S.noteHead, T.ink, 800);
        y += lh + 52;
        richLine(g, n.x, y, ["axes ", u(1), ", ", u(2), ", ", u(3)], S.noteHead, T.ink, 800);
        richLine(g, n.x, y + lh + 4, ["orthonormal basis of the hippocampal memory subspace"], S.note, T.soft);
        richLine(g, n.x + 24, y + 2 * lh + 10,
                 [it("U", "T"), " = [", u(1), " ", u(2), " ", u(3), "]  spans  ker(", it("I"), " − ", it("W", "T"), ")"],
                 S.note + 3, T.ink, 600);
        return;
      }
      if (n.kind === "mixtures") {
        // how close the hippocampus gets to a stored memory (either sign), over the whole run
        const M = this.d.mem.map(norm3), cs = [];
        for (let i = 0; i < this.N; i++) {
          const v = this.vec("teacher", i);
          cs.push(Math.max(...M.map((m) => Math.abs(dot3(m, v)))));
        }
        const near = cs.filter((c) => c > 0.95).length / this.N;
        const med = (Math.acos(percentile(cs, 50)) * 180) / Math.PI;
        let y = n.y;
        richLine(g, n.x, y, ["replay sits between memories"], 36, T.ink, 800);
        ["most of the time a mixture of", "the stored digits, not one of them"]
          .forEach((w, k) => richLine(g, n.x, y + 50 + k * 40, [w], 29, T.soft, 600));
        y += 240;
        const stat = (num, words) => {
          el("text", { x: n.x, y: y + 24, fill: T.ink, "font-size": 78, "font-weight": 800 }, g).textContent = num;
          words.forEach((w, k) => richLine(g, n.x + 190, y - 6 + k * 38, [w], 28, T.soft, 600));
          y += 150;
        };
        stat(`${Math.round(100 * near)} %`, ["of the time near a stored", "memory (cos > 0.95)"]);
        stat(`${Math.round(med)}°`, ["median angle to the", "nearest stored memory"]);
        // the question, as the deck's callout (soft card, green bar)
        y += 10;
        el("rect", { x: n.x, y, width: right - n.x, height: 130, rx: 8, fill: this.opts.theme === "dark" ? "#1C2026" : "#F4F5F7" }, g);
        el("rect", { x: n.x, y, width: 8, height: 130, fill: T.transfer }, g);
        richLine(g, n.x + 34, y + 52, ["not the memories themselves:"], 28, T.soft, 600);
        richLine(g, n.x + 34, y + 98, ["so what does it track?"], 36, T.ink, 800);
        return;
      }
      rule(n.y - 46);
      if (n.kind === "modes") {
        richLine(g, n.x, n.y, ["modes"], S.noteHead, T.ink, 800);
        richLine(g, n.x, n.y + lh + 4, ["eigenvectors of the student's error"], S.note, T.soft);
        richLine(g, n.x, n.y + 2 * lh + 4, ["restricted to the memory subspace"], S.note, T.soft);
        richLine(g, n.x + 24, n.y + 3 * lh + 10,
                 [it("D", "S"), " = ", it("U", "T"), { t: "ᵀ" }, " ", it("M", "S"), { t: "ᵀ" }, " ", it("M", "S"), " ",
                  it("U", "T")], S.note + 3, T.ink, 600);
        richLine(g, n.x, n.y + 4 * lh + 16, ["eigenvalue = what is left to transfer along it"], S.note, T.soft);
        return;
      }
      if (n.kind === "drive") {
        richLine(g, n.x, n.y, [it("κ", null, T.drive), { t: " ‖", c: T.drive }, it("ε", "TS", T.drive), { t: "‖", c: T.drive }],
                 S.noteHead + 3, T.ink, 700);
        ["the interface error pushing the", "hippocampus to what the cortex", "does not yet reproduce"]
          .forEach((w, k) => richLine(g, n.x, n.y + (k + 1) * lh + 6, [w], S.note, T.soft));
        const y2 = n.y + 4 * lh + 46;
        richLine(g, n.x, y2, ["teacher speed"], S.noteHead, T.ink, 800);
        ["how fast the replayed pattern", "moves on the sphere (smoothed)"]
          .forEach((w, k) => richLine(g, n.x, y2 + (k + 1) * lh + 6, [w], S.note, T.soft));
        return;
      }
      if (n.kind === "dW") {
        richLine(g, n.x, n.y, ["‖", it("Ẇ", "S"), "‖"],
                 S.noteHead + 3, T.ink, 700);
        ["how fast the cortex learns:", "its own prediction error times", "its activity (local rule)"]
          .forEach((w, k) => richLine(g, n.x, n.y + (k + 1) * lh + 6, [w], S.note, T.soft));
      }
    }

    // legend: network slide (right column, vertical) or under a flat map
    buildLegend(svg) {
      const T = this.Tm, S = this.L.sizes, lg = this.L.legend;
      if (!lg) return;
      const g = el("g", {}, svg);
      if (lg.kind === "network") {
        let y = lg.y;
        const row = (draw, text) => {
          draw(lg.x + 14, y);
          el("text", { x: lg.x + 44, y, fill: T.ink, "font-size": S.legend, "font-weight": 700,
                       "dominant-baseline": "central" }, g).textContent = text;
        };
        row((x, yy) => el("circle", { cx: x, cy: yy, r: S.teacher, fill: T.teacher, stroke: T.teacherStroke, "stroke-width": 3.5 }, g),
            "hippocampus state");
        const end = this.colorBar(g, lg.x + 330, y, 100, T.path, ["early", "late"], `${this.id}-lgT`);
        y += 52;
        row((x, yy) => el("circle", { cx: x, cy: yy, r: S.teacher, fill: T.student, stroke: T.teacherStroke, "stroke-width": 3.5 }, g),
            "cortex state");
        this.colorBar(g, lg.x + 330, y, 100, T.spath, ["early", "late"], `${this.id}-lgS`);
        y += 52;
        row((x, yy) => el("circle", { cx: x, cy: yy, r: S.memDot, fill: T.bg, stroke: T.memStroke, "stroke-width": 3.5 }, g),
            "stored memory (±)");
        return end;
      }
      // flat: what the path colour shows, centred on x
      const sc = this.maps[0].scale, row = el("g", {}, g);
      el("text", { x: 0, y: lg.y, fill: T.ink, "font-size": S.legend, "font-weight": 700, "dominant-baseline": "central" }, row)
        .textContent = lg.label;
      const x = this.colorBar(row, lg.label.length * 15 + 26, lg.y, 110, sc.stops, sc.labels, `${this.id}-lgF`);
      row.setAttribute("transform", `translate(${(lg.x - x / 2).toFixed(1)},0)`);
    }

    // speed slider and "centre on state" toggle (HTML over the SVG), faint until hovered
    buildControls() {
      const T = this.Tm, root = this.root, c = this.L.controls;
      root.style.setProperty("--fp-ink", T.ink);
      root.style.setProperty("--fp-soft", T.soft);
      root.style.setProperty("--fp-accent", T.teacher);
      const bar = document.createElement("div");
      bar.className = "fp-controls";
      bar.style.left = `${c.x / 19.2}cqw`;
      bar.style.top = `${c.y / 19.2}cqw`;
      bar.innerHTML = '<div class="fp-speed"><span class="fp-speed-label">speed</span>' +
        '<input type="range" min="-2" max="2" step="0.01" tabindex="-1" aria-label="animation speed">' +
        '<output class="fp-speed-value"></output></div>' +
        '<button type="button" class="fp-toggle" tabindex="-1" aria-pressed="false">' +
        '<span class="fp-switch"></span><span>centre on state</span></button>';
      root.appendChild(bar);
      const input = bar.querySelector("input"), out = bar.querySelector("output");
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
      const tog = bar.querySelector(".fp-toggle");
      const showTog = () => { tog.classList.toggle("on", this.opts.follow); tog.setAttribute("aria-pressed", String(this.opts.follow)); };
      tog.addEventListener("click", (e) => {
        this.opts.follow = !this.opts.follow;
        this.dragAz = this.dragEl = 0;
        showTog();
        tog.blur();
        e.stopPropagation();
        if (!this.active) this.render();
      });
      tog.addEventListener("keydown", (e) => { tog.blur(); e.preventDefault(); });
      showTog();
    }

    // drag on a sphere to turn it; double-click resets the view
    hookDrag() {
      const svg = this.svg;
      let start = null;
      const inside = (e) => {
        const b = svg.getBoundingClientRect(), k = W / b.width;
        const x = (e.clientX - b.left) * k, y = (e.clientY - b.top) * k;
        return this.balls.some((bl) => Math.hypot(x - bl.spec.cx, y - bl.spec.cy) < bl.spec.r * 1.25);
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
      if (this.flat) return;
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
    // jump to the end of the segment being played
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
      if (this.active || this.flat) return;
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
      const [i, j, f] = this.locate(this.tNow);
      for (const b of this.balls) this.renderBall(b, i, j, f);
      for (const pl of this.plots) {
        const cx = pl.X(this.tNow), bx = pl.box;
        pl.clipRect.setAttribute("width", Math.max(0, cx - bx.x0 + (this.flat ? 20 : 0)));
        pl.cursor.setAttribute("visibility", this.flat ? "hidden" : "visible");
        pl.cursor.setAttribute("x1", cx); pl.cursor.setAttribute("x2", cx);
        pl.spec.series.forEach((sr, k) => {
          const v = pl.val(sr, i) + (pl.val(sr, j) - pl.val(sr, i)) * f;
          pl.dots[k].setAttribute("visibility", this.flat ? "hidden" : "visible");
          pl.dots[k].setAttribute("cx", cx);
          pl.dots[k].setAttribute("cy", Math.max(bx.y0 - 10, pl.Y(v)));
        });
      }
      if (this.L.panel) this.drawDigits(f < 0.5 ? i : j, this.d.rec.eps[i] + (this.d.rec.eps[j] - this.d.rec.eps[i]) * f);
    }

    renderBall(b, i, j, f) {
      const S = this.L.sizes, s = b.spec, r = this.d.rec;
      this.setView(b, i, j, f);

      // wireframe, split into front and back halves (6 meridians, 5 parallels)
      if (!this.wire) {
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
      let wf = "", wb = "";
      for (const pts of this.wire) {
        let prevFront = null;
        for (const q of pts) {
          const [x, y, z] = this.proj(b, q[0], q[1], q[2]);
          const front = z >= 0, seg = `${x.toFixed(1)},${y.toFixed(1)}`;
          if (front) wf += (prevFront === true ? "L" : "M") + seg; else wb += (prevFront === false ? "L" : "M") + seg;
          prevFront = front;
        }
      }
      b.wireFront.setAttribute("d", wf);
      b.wireBack.setAttribute("d", wb);

      // axes from the origin
      if (this.opts.axes) {
        const [x0, y0] = this.proj(b, 0, 0, 0);
        b.axes.forEach((a, k) => {
          const v = [0, 0, 0]; v[k] = 1;
          const [x1, y1] = this.proj(b, 1.16 * v[0], 1.16 * v[1], 1.16 * v[2]);
          const [xl, yl] = this.proj(b, 1.3 * v[0], 1.3 * v[1], 1.3 * v[2]);
          a.line.setAttribute("x1", x0); a.line.setAttribute("y1", y0);
          a.line.setAttribute("x2", x1); a.line.setAttribute("y2", y1);
          a.lab.setAttribute("x", xl); a.lab.setAttribute("y", yl);
        });
      }

      // memories: back ones under the veil, front ones over it; thumbnail pushed outwards
      for (const m of b.mems) {
        const [x, y, z] = this.proj(b, ...m.v);
        const back = z < 0;
        if (back !== m.back) { b.memLayers[back ? 0 : 1].appendChild(m.grp); m.back = back; }
        let ux = x - s.cx, uy = y - s.cy;
        const n = Math.hypot(ux, uy) || 1;
        ux /= n; uy /= n;
        const off = S.thumbOff + 0.5 * S.thumb * Math.max(Math.abs(ux), Math.abs(uy));
        const tx = x + off * ux, ty = y + off * uy;
        m.dot.setAttribute("cx", x); m.dot.setAttribute("cy", y);
        m.link.setAttribute("x1", x); m.link.setAttribute("y1", y);
        m.link.setAttribute("x2", tx - 0.5 * S.thumb * ux); m.link.setAttribute("y2", ty - 0.5 * S.thumb * uy);
        m.img.setAttribute("x", tx - S.thumb / 2); m.img.setAttribute("y", ty - S.thumb / 2);
        m.frame.setAttribute("x", tx - S.thumb / 2); m.frame.setAttribute("y", ty - S.thumb / 2);
        m.grp.setAttribute("opacity", back ? (0.3 + 0.35 * smooth01(1 + z / 0.35)).toFixed(3) : 1);
      }

      // path so far (front / back), recent tapered trail, current state
      const a = this.vec(b.role, i), c = this.vec(b.role, j);
      const now = [0, 1, 2].map((m) => a[m] + (c[m] - a[m]) * f);
      { const nn = Math.hypot(...now); if (nn > 1e-6) { now[0] /= nn; now[1] /= nn; now[2] /= nn; } }
      const [px, py, pz] = this.proj(b, ...now);
      const first = b.role === "student" ? 1 : 0;              // the student is silent at t = 0
      const P2 = [];
      for (let n = first; n <= i; n++) P2.push(this.proj(b, ...this.vec(b.role, n)));
      P2.push([px, py, pz]);
      const NB = this.L.pathBins, df = new Array(NB).fill(""), db = new Array(NB).fill("");
      for (let n = 0; n + 1 < P2.length; n++) {
        const p = P2[n], q = P2[n + 1];
        const k = Math.min(NB - 1, Math.floor((r.t[n + first] / this.d.t_end) * NB));
        const seg = `M${p[0].toFixed(1)},${p[1].toFixed(1)}L${q[0].toFixed(1)},${q[1].toFixed(1)}`;
        if (p[2] + q[2] >= 0) df[k] += seg; else db[k] += seg;
      }
      for (let k = 0; k < NB; k++) {
        b.pathFront[k].setAttribute("d", df[k]);
        b.pathBack[k].setAttribute("d", db[k]);
      }
      const t0 = Math.max(0, this.locate(this.tNow - this.d.pacing.trail_time)[0] - first);
      const pts = P2.slice(t0);
      const nseg = Math.min(pts.length - 1, b.trail.length), off = pts.length - 1 - nseg;
      for (let n = 0; n < b.trail.length; n++) {
        const l = b.trail[n];
        if (n >= nseg) { l.setAttribute("visibility", "hidden"); continue; }
        const p = pts[off + n], q = pts[off + n + 1], u = (n + 1) / nseg;
        const depth = (p[2] + q[2]) / 2 >= 0 ? 1 : 0.4;
        l.setAttribute("x1", p[0]); l.setAttribute("y1", p[1]);
        l.setAttribute("x2", q[0]); l.setAttribute("y2", q[1]);
        l.setAttribute("stroke-width", (2 + 8 * u).toFixed(2));
        l.setAttribute("stroke-opacity", ((0.05 + 0.85 * u * u) * depth).toFixed(3));
        l.setAttribute("visibility", "visible");
      }
      const rho = Math.hypot(...now);
      b.dot.setAttribute("cx", px);
      b.dot.setAttribute("cy", py);
      b.dot.setAttribute("opacity", rho < 0.05 ? 0 : pz >= 0 ? 1 : 0.55);
    }

    drawDigits(n, eps) {
      const e = clamp(eps, 0, 1);
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
      layout: elm.dataset.layout || "network",
      speed: parseFloat(elm.dataset.speed || "1"),
      autoplay: "autoplay" in elm.dataset,
      controls: elm.dataset.controls !== "none",
      axes: elm.dataset.axes !== "none",
      swing: parseFloat(elm.dataset.swing ?? "0"),
      follow: elm.dataset.follow !== "off",
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
        if (p.flat) continue;
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
