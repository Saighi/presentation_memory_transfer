// Architecture drawings for the Model slides, drawn into inline SVGs so they scale with the slide,
// and so one slide can highlight the part it talks about. Same look as the deck's schematics
// (media/schematics/talk_transfer.svg, network_units_talk.svg).
//
//   <g data-net="plain|classical|ours" ...>   the two coupled networks, local frame 360 x 324:
//        student (cortex) ring at (90, 90), teacher (hippocampus) ring at (270, 234), radius 82.
//        Options: data-pills="covPCN" (a pill next to each ring), data-focus="pair" (one neuron of
//        each network and the interface between them ringed, for a zoom to the unit circuit),
//        data-roles (S / T next to the rings), data-names (cortex / hippocampus under the rings).
//        "classical": feedback arrow drawn excitatory (blue); "ours" / "plain": red error arrow.
//   <g data-units="mini" ...>   the unit schematic (two neurons per population, value and error
//        units, interface error), node symbols only (data-kappa: the kappa label, violet); local frame 420 x 560 (columns x 80 and 380,
//        rows every 112 from y 40). data-tags: population names on the left.
//
// Geometry of the focus box and pills is exported as window.Arch.NET for slides that draw zoom
// lines to it. Load before js/deck.js.

(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const C = {
    teacher: "#378ADD", student: "#D85A30", drive: "#2A78C8", error: "#D4532A",
    plastic: "#4C8DFF", frozen: "#9AA0A6", exc: "#4C8DFF", inh: "#E0772B", ink: "#23262D", soft: "#5F6670",
    focus: "#F5C842", kappa: "#8E44AD",
  };
  const FONT = '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const MATH = '"KaTeX_Math", "Times New Roman", serif';

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // ---------------- the two coupled networks ----------------
  const NET = {
    student: { x: 90, y: 90 }, teacher: { x: 270, y: 234 }, R: 82,
    // one neuron of each network, facing the other network, and the interface between them
    pair: { student: 4, teacher: 0 },
    focus: { x0: 106, y0: 98, x1: 254, y1: 226 },
  };
  const FILLS = {
    teacher: ["#505356", "#E2E2E3", "#949698", "#E2E2E3", "#636669", "#D8D9D9", "#8A8C8E", "#E2E2E3"],
    student: ["#818385", "#EAEAEB", "#B2B3B5", "#EAEAEB", "#8F9193", "#E3E3E4", "#ABACAE", "#EAEAEB"],
  };
  function nodes(role) {
    const c = NET[role], out = [];
    for (let k = 0; k < 8; k++) {
      const a = ((-141.3 + 45 * k) * Math.PI) / 180;
      out.push([c.x + 50 * Math.cos(a), c.y + 50 * Math.sin(a)]);
    }
    return out;
  }

  // arrowhead (filled, notched) at the end of a cubic whose last control point is (cx, cy)
  function head(g, x, y, cx, cy, color, size) {
    const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const b = size, w = size * 0.55;
    el("path", { d: `M${x + ux * 3},${y + uy * 3} L${x - ux * b - uy * w},${y - uy * b + ux * w} ` +
                    `L${x - ux * b * 0.72},${y - uy * b * 0.72} L${x - ux * b + uy * w},${y - uy * b - ux * w} Z`,
                 fill: color }, g);
  }

  function drawNet(g) {
    const kind = g.dataset.net || "plain";
    const ring = (role) => {
      const c = NET[role], rg = el("g", {}, g);
      el("circle", { cx: c.x, cy: c.y, r: NET.R, fill: C[role], opacity: role === "student" ? 0.18 : 0.16 }, rg);
      const pts = nodes(role);
      const cg = el("g", { stroke: role === "student" ? C.plastic : C.frozen, "stroke-width": 1.3, opacity: 0.6 }, rg);
      for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++)
        el("line", { x1: pts[a][0], y1: pts[a][1], x2: pts[b][0], y2: pts[b][1] }, cg);
      return { rg, pts };
    };
    // data-only="student": the cortex ring alone (uniform-rehearsal control, no hippocampus, no interface)
    const only = g.dataset.only === "student";
    const S = ring("student"), T = only ? null : ring("teacher");
    const focus = g.dataset.focus === "pair";
    if (focus) {
      // halo on the neuron pair the unit circuit zooms into, under the units
      for (const [role, k] of [["student", NET.pair.student], ["teacher", NET.pair.teacher]]) {
        const p = (role === "student" ? S : T).pts[k];
        el("circle", { cx: p[0], cy: p[1], r: 19, fill: C.focus, opacity: 0.75 }, g);
      }
    }
    for (const [role, R] of [["student", S], ["teacher", T]]) {
      if (!R) continue;
      const ng = el("g", { stroke: "#222222", "stroke-width": 1.8 }, g);
      R.pts.forEach((p, k) => el("circle", { cx: p[0], cy: p[1], r: 10.5, fill: FILLS[role][k] }, ng));
    }
    if (only) {
      if ("names" in g.dataset)
        el("text", { x: NET.student.x, y: NET.student.y - NET.R - 16, fill: C.ink, "font-family": FONT, "font-size": 26,
                     "font-weight": 800, "text-anchor": "middle" }, g).textContent = "cortex";
      return;
    }
    // interface: bottom-up drive (teacher -> student), top-down feedback (student -> teacher)
    const fb = kind === "classical" ? C.drive : C.error;
    const arr = (d, color, end, ctrl) => {
      el("path", { d, fill: "none", stroke: color, "stroke-width": 4.5, "stroke-linecap": "round" }, g);
      head(g, end[0], end[1], ctrl[0], ctrl[1], color, 15);
    };
    arr("M231.5 170.8 C224.6 134.6 203.4 116.4 174.7 116.2", C.drive, [168.7, 116.2], [203.4, 116.4]);
    arr("M128.5 153.2 C135.4 189.4 156.6 207.6 185.3 207.8", fb, [191.3, 207.8], [156.6, 207.6]);
    if (focus) {
      const f = NET.focus;
      el("rect", { x: f.x0, y: f.y0, width: f.x1 - f.x0, height: f.y1 - f.y0, rx: 14, fill: "none",
                   stroke: C.ink, "stroke-width": 2.5, "stroke-dasharray": "7 6", opacity: 0.8 }, g);
    }
    if ("roles" in g.dataset) {
      const t = (x, y, s, color) => {
        const e = el("text", { x, y, fill: color, "font-family": MATH, "font-style": "italic", "font-size": 40,
                               "font-weight": 700, "text-anchor": "middle" }, g);
        e.textContent = s;
      };
      t(NET.student.x - 100, NET.student.y - 52, "S", C.student);
      t(NET.teacher.x + 104, NET.teacher.y + 8, "T", C.teacher);
    }
    if ("names" in g.dataset) {
      const t = (x, y, s) => el("text", { x, y, fill: C.ink, "font-family": FONT, "font-size": 26,
                                                 "font-weight": 800, "text-anchor": "middle" }, g).textContent = s;
      t(NET.student.x, NET.student.y - NET.R - 16, "cortex", C.student);
      t(NET.teacher.x, NET.teacher.y + NET.R + 34, "hippocampus", C.teacher);
    }
    if (g.dataset.pills) {
      const pill = (x, y, role) => {
        const w = 118, h = 40, pg = el("g", { class: "arch-pill" }, g);
        el("rect", { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: h / 2, fill: "#FFFFFF",
                     stroke: C[role], "stroke-width": 3 }, pg);
        el("text", { x, y: y + 8, fill: C.ink, "font-family": FONT, "font-size": 23, "font-weight": 800,
                     "text-anchor": "middle" }, pg).textContent = g.dataset.pills;
      };
      pill(NET.student.x + NET.R + 76, NET.student.y - 34, "student");
      pill(NET.teacher.x + NET.R + 76, NET.teacher.y + 34, "teacher");
    }
  }

  // ---------------- the unit schematic, mini ----------------
  // layout of network_units.tex: columns = neuron 1 / 2, rows = eps_S, x_S, eps_TS, x_T, eps_T
  const U = { x: [80, 380], y0: 40, dy: 112, r: 34, hw: 40, hh: 24 };
  function drawUnits(g) {
    const node = (col, row) => {
      const kind = row % 2 === 0 ? "error" : "value";
      return { x: U.x[col], y: U.y0 + row * U.dy, kind };
    };
    const N = {};
    for (const c of [0, 1]) {
      N[`eS${c}`] = node(c, 0); N[`xS${c}`] = node(c, 1); N[`eTS${c}`] = node(c, 2);
      N[`xT${c}`] = node(c, 3); N[`eT${c}`] = node(c, 4);
    }
    // TikZ "bend left=theta" as a quadratic: bows left of travel by 0.29 L sin(theta)
    const clipTo = (n, ux, uy) => {
      if (n.kind === "value") return [n.x + U.r * ux, n.y + U.r * uy];
      const t = Math.min(U.hw / (Math.abs(ux) || 1e-9), U.hh / (Math.abs(uy) || 1e-9));
      return [n.x + t * ux, n.y + t * uy];
    };
    const edges = el("g", {}, g);
    const edge = (a, b, deg, type, hl) => {
      const A = N[a], B = N[b], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
      const nx = dy / L, ny = -dx / L, h = 0.58 * L * Math.sin((deg * Math.PI) / 180);
      const cx = (A.x + B.x) / 2 + h * nx, cy = (A.y + B.y) / 2 + h * ny;
      let ux = cx - A.x, uy = cy - A.y, l = Math.hypot(ux, uy);
      const s = clipTo(A, ux / l, uy / l);
      ux = cx - B.x; uy = cy - B.y; l = Math.hypot(ux, uy);
      const e = clipTo(B, ux / l, uy / l);
      const color = hl || (type === "exc" ? C.exc : C.inh);
      const tx = e[0] - cx, ty = e[1] - cy, tl = Math.hypot(tx, ty), vx = tx / tl, vy = ty / tl;
      const cut = type === "exc" ? 9 : 0;
      el("path", { d: `M${s[0].toFixed(1)},${s[1].toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ` +
                      `${(e[0] - vx * cut).toFixed(1)},${(e[1] - vy * cut).toFixed(1)}`,
                   fill: "none", stroke: color, "stroke-width": hl ? 4.5 : 3, "stroke-linecap": "round" }, edges);
      if (type === "exc") head(edges, e[0] - vx * 2, e[1] - vy * 2, cx, cy, color, 14);
      else el("circle", { cx: e[0] - vx * 5, cy: e[1] - vy * 5, r: 5.5, fill: color }, edges);
      // curve middle and the side it bows to, for a label
      return [0.25 * s[0] + 0.5 * cx + 0.25 * e[0], 0.25 * s[1] + 0.5 * cy + 0.25 * e[1], Math.sign(h) * nx, Math.sign(h) * ny];
    };
    // the one synapse label kept (data-kappa): kappa, violet as everywhere in the deck, on the outer side
    const kappa = ([mx, my, ox, oy]) => {
      if (!("kappa" in g.dataset)) return;
      el("text", { x: mx + 16 * ox, y: my + 16 * oy + 10, fill: C.kappa, "font-family": MATH, "font-style": "italic",
                   "font-size": 32, "font-weight": 700, "text-anchor": ox < 0 ? "end" : "start" }, g).textContent = "κ";
    };
    for (const c of [0, 1]) {
      edge(`xS${c}`, `eS${c}`, 16, "exc"); edge(`eS${c}`, `xS${c}`, 16, "inh");
      edge(`xS${c}`, `eTS${c}`, 16, "inh"); edge(`eTS${c}`, `xS${c}`, 16, "exc");
      edge(`xT${c}`, `eTS${c}`, 16, "exc"); kappa(edge(`eTS${c}`, `xT${c}`, 16, "exc"));
      edge(`xT${c}`, `eT${c}`, 16, "exc"); edge(`eT${c}`, `xT${c}`, 16, "inh");
    }
    edge("xT1", "eT0", 10, "inh"); edge("eT0", "xT1", 10, "exc");
    edge("xS1", "eS0", 10, "inh"); edge("eS0", "xS1", 10, "exc");
    edge("xT0", "eT1", 10, "inh"); edge("eT1", "xT0", 10, "exc");
    edge("xS0", "eS1", 10, "inh"); edge("eS1", "xS0", 10, "exc");
    // nodes with their symbol (as in network_units_talk.svg): x_S in the cortex colour, x_T in the
    // hippocampus colour, error units in ink; synapse labels left out
    const ng = el("g", {}, g);
    const label = (n, sym, sub, color) => {
      const t = el("text", { x: n.x, y: n.y + 9, fill: color, "font-family": MATH, "font-style": "italic",
                             "font-size": 30, "font-weight": 700, "text-anchor": "middle" }, ng);
      el("tspan", {}, t).textContent = sym;
      el("tspan", { "font-size": 19, dy: 7 }, t).textContent = sub;
    };
    for (const k in N) {
      const n = N[k], idx = String(+k.slice(-1) + 1);
      if (n.kind === "value") {
        const S = k.startsWith("xS");
        el("circle", { cx: n.x, cy: n.y, r: U.r, fill: S ? "#F7DED5" : "#DDEAF8", stroke: "#222222", "stroke-width": 3 }, ng);
        label(n, "x", `${S ? "S" : "T"},${idx}`, C.ink);
      } else {
        el("rect", { x: n.x - U.hw, y: n.y - U.hh, width: 2 * U.hw, height: 2 * U.hh, rx: 6, fill: "#FFFFFF",
                     stroke: "#888888", "stroke-width": 2.5, "stroke-dasharray": "7 5" }, ng);
        label(n, "ε", `${k.slice(1, -1)},${idx}`, C.ink);
      }
    }
    if ("tags" in g.dataset) {
      const tag = (row0, row1, s, color) => {
        const y0 = U.y0 + row0 * U.dy - U.hh - 6, y1 = U.y0 + row1 * U.dy + U.hh + 6;
        el("line", { x1: 18, x2: 18, y1: y0, y2: y1, stroke: color, "stroke-width": 5, "stroke-linecap": "round" }, g);
        const t = el("text", { x: 2, y: (y0 + y1) / 2, fill: C.ink, "font-family": FONT, "font-size": 24, "font-weight": 800,
                               "text-anchor": "middle", transform: `rotate(-90 2 ${(y0 + y1) / 2})` }, g);
        t.textContent = s;
      };
      tag(0, 1, "cortex", C.student);
      tag(3, 4, "hippocampus", C.teacher);
      const yI = U.y0 + 2 * U.dy;
      el("text", { x: 2, y: yI, fill: C.soft, "font-family": FONT, "font-size": 22,
                   "font-weight": 700, "text-anchor": "middle", transform: `rotate(-90 2 ${yI})` }, g)
        .textContent = "interface";
    }
  }

  function drawAll(root = document) {
    root.querySelectorAll("g[data-net]").forEach((g) => { if (!g.dataset.drawn) { drawNet(g); g.dataset.drawn = 1; } });
    root.querySelectorAll("g[data-units]").forEach((g) => { if (!g.dataset.drawn) { drawUnits(g); g.dataset.drawn = 1; } });
  }

  window.Arch = { NET, U, drawAll };
  drawAll();
})();
