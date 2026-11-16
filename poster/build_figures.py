"""Poster figures: the two diagrams drawn into poster.html, and the paper's replay figure.

    python poster/build_figures.py

units_svg()   the talk's unit schematic (slides/js/arch.js, drawUnits), laid out horizontally
repair_svg()  the talk's self-repair figure (notebooks/08_self_repair.py), with larger labels
Both are written between markers in poster.html; their styles are in poster.css.
"""

import math
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from export_pdf import INDEX  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "media"
# the paper's composite (fig:reactivation-transfer): transparent PNG, flattened on white for printing
PAPER_FIG = ROOT.parent / "Prioritized-Memory-Transfer" / "paper_figure" / "photoshop_figures" / "empirical_results_1_V2.png"


def write_inline(marker, lines):
    """Put an SVG into poster.html between <!-- marker:begin --> and <!-- marker:end -->."""
    page = HERE / "poster.html"
    html = page.read_text(encoding="utf-8")
    body = f"<!-- {marker}:begin -->\n" + "\n".join(lines) + f"\n<!-- {marker}:end -->"
    new, count = re.subn(rf"<!-- {marker}:begin -->.*?<!-- {marker}:end -->", lambda _: body, html, flags=re.S)
    assert count == 1, marker
    page.write_text(new, encoding="utf-8")
    print(f"  {marker} svg -> poster.html")


def units_svg():
    """Two neurons per population, left to right: eps_S, x_S, eps_TS, x_T, eps_T, one row per neuron.
    Same wiring, bends, colours and symbols as drawUnits in slides/js/arch.js."""
    x0, dx, rows_y, r, hw, hh = 56, 212, (116, 372), 38, 45, 27
    exc, inh = "#4C8DFF", "#E0772B"
    kappa_color, ink = "#8E44AD", "#23262D"
    student, teacher = "#D85A30", "#378ADD"

    nodes = {}
    for neuron in (0, 1):
        for col, name in enumerate(("eS", "xS", "eTS", "xT", "eT")):
            nodes[f"{name}{neuron}"] = dict(x=x0 + col * dx, y=rows_y[neuron], value=col % 2 == 1)

    def clip(n, ux, uy):
        if n["value"]:
            return n["x"] + r * ux, n["y"] + r * uy
        t = min(hw / (abs(ux) or 1e-9), hh / (abs(uy) or 1e-9))
        return n["x"] + t * ux, n["y"] + t * uy

    edges, labels = [], []

    def edge(a, b, deg, kind, kappa=False):
        A, B = nodes[a], nodes[b]
        ex, ey = B["x"] - A["x"], B["y"] - A["y"]
        length = math.hypot(ex, ey)
        nx, ny = ey / length, -ex / length
        h = 0.58 * length * math.sin(math.radians(deg))
        cx, cy = (A["x"] + B["x"]) / 2 + h * nx, (A["y"] + B["y"]) / 2 + h * ny
        ux, uy = cx - A["x"], cy - A["y"]
        ul = math.hypot(ux, uy)
        s = clip(A, ux / ul, uy / ul)
        ux, uy = cx - B["x"], cy - B["y"]
        ul = math.hypot(ux, uy)
        e = clip(B, ux / ul, uy / ul)
        color = exc if kind == "exc" else inh
        tx, ty = e[0] - cx, e[1] - cy
        tl = math.hypot(tx, ty)
        vx, vy = tx / tl, ty / tl
        cut = 11 if kind == "exc" else 0
        edges.append(f'<path d="M{s[0]:.1f},{s[1]:.1f} Q{cx:.1f},{cy:.1f} {e[0] - vx * cut:.1f},{e[1] - vy * cut:.1f}" '
                     f'fill="none" stroke="{color}" stroke-width="3.6" stroke-linecap="round"/>')
        if kind == "exc":
            hx, hy, b_, w = e[0] - vx * 2, e[1] - vy * 2, 18, 18 * 0.55
            edges.append(f'<path d="M{hx + vx * 3:.1f},{hy + vy * 3:.1f} '
                         f'L{hx - vx * b_ - vy * w:.1f},{hy - vy * b_ + vx * w:.1f} '
                         f'L{hx - vx * b_ * 0.72:.1f},{hy - vy * b_ * 0.72:.1f} '
                         f'L{hx - vx * b_ + vy * w:.1f},{hy - vy * b_ - vx * w:.1f} Z" fill="{color}"/>')
        else:
            edges.append(f'<circle cx="{e[0] - vx * 6:.1f}" cy="{e[1] - vy * 6:.1f}" r="6.5" fill="{color}"/>')
        if kappa:
            mx, my = 0.25 * s[0] + 0.5 * cx + 0.25 * e[0], 0.25 * s[1] + 0.5 * cy + 0.25 * e[1]
            side = 1 if h > 0 else -1
            labels.append(f'<text class="sym" x="{mx + 22 * side * nx:.1f}" y="{my + 22 * side * ny + 11:.1f}" '
                          f'text-anchor="middle" font-size="38" fill="{kappa_color}">κ</text>')

    for c in (0, 1):
        edge(f"xS{c}", f"eS{c}", 16, "exc")
        edge(f"eS{c}", f"xS{c}", 16, "inh")
        edge(f"xS{c}", f"eTS{c}", 16, "inh")
        edge(f"eTS{c}", f"xS{c}", 16, "exc")
        edge(f"xT{c}", f"eTS{c}", 16, "exc")
        edge(f"eTS{c}", f"xT{c}", 16, "exc", kappa=True)
        edge(f"xT{c}", f"eT{c}", 16, "exc")
        edge(f"eT{c}", f"xT{c}", 16, "inh")
    for a, b in (("xT1", "eT0"), ("xS1", "eS0"), ("xT0", "eT1"), ("xS0", "eS1")):
        edge(a, b, 10, "inh")
        edge(b, a, 10, "exc")

    drawn = []
    for key, n in nodes.items():
        idx = int(key[-1]) + 1
        name = key[:-1]
        if n["value"]:
            fill = "#F7DED5" if name == "xS" else "#DDEAF8"
            drawn.append(f'<circle cx="{n["x"]}" cy="{n["y"]}" r="{r}" fill="{fill}" stroke="#222222" stroke-width="3"/>')
            sym, sub = "x", f"{name[1:]},{idx}"
        else:
            drawn.append(f'<rect x="{n["x"] - hw}" y="{n["y"] - hh}" width="{2 * hw}" height="{2 * hh}" rx="6" fill="#FFFFFF" '
                         f'stroke="#888888" stroke-width="2.8" stroke-dasharray="7 5"/>')
            sym, sub = "ε", f"{name[1:]},{idx}"
        drawn.append(f'<text class="sym" x="{n["x"]}" y="{n["y"] + 10}" text-anchor="middle" font-size="33" fill="{ink}">'
                     f'{sym}<tspan font-size="21" dy="7">{sub}</tspan></text>')

    def tag(col0, col1, text, color):
        a, b = x0 + col0 * dx - hw, x0 + col1 * dx + hw
        parts = [f'<text class="tag" x="{(a + b) / 2}" y="32" text-anchor="middle">{text}</text>']
        if color:
            parts.append(f'<line x1="{a}" y1="46" x2="{b}" y2="46" stroke="{color}" stroke-width="6" stroke-linecap="round"/>')
        return "".join(parts)

    # legend in the free space between the two interface units
    lx, ly = 372, 192
    legend = [
        f'<circle cx="{lx + 26}" cy="{ly}" r="14" fill="#FFFFFF" stroke="#222222" stroke-width="3"/>'
        f'<text class="leg" x="{lx + 66}" y="{ly + 10}">value neuron</text>',
        f'<rect x="{lx + 8}" y="{ly + 30}" width="36" height="24" rx="4" fill="#FFFFFF" stroke="#888888" stroke-width="2.8" stroke-dasharray="6 4"/>'
        f'<text class="leg" x="{lx + 66}" y="{ly + 52}">error neuron</text>',
        f'<line x1="{lx}" y1="{ly + 84}" x2="{lx + 40}" y2="{ly + 84}" stroke="{exc}" stroke-width="4"/>'
        f'<path d="M{lx + 54},{ly + 84} L{lx + 36},{ly + 74} L{lx + 40},{ly + 84} L{lx + 36},{ly + 94} Z" fill="{exc}"/>'
        f'<text class="leg" x="{lx + 66}" y="{ly + 94}">positive</text>',
        f'<line x1="{lx}" y1="{ly + 126}" x2="{lx + 44}" y2="{ly + 126}" stroke="{inh}" stroke-width="4"/>'
        f'<circle cx="{lx + 46}" cy="{ly + 126}" r="7" fill="{inh}"/>'
        f'<text class="leg" x="{lx + 66}" y="{ly + 136}">negative</text>',
    ]

    write_inline("units", [
        '<svg viewBox="0 0 960 420" class="units-svg" role="img" aria-label="Unit schematic, left to right: student '
        'error and value neurons, interface error, teacher value and error neurons, two neurons per population">',
        tag(0, 1, "student", student), tag(2, 2, "interface", None), tag(3, 4, "teacher", teacher),
        *edges, *drawn, *labels, *legend, "</svg>",
    ])


def repair_svg():
    """Self-repair panel: the talk's inline SVG laid out again with labels large enough for the
    poster. Same digits and curves; only positions, sizes and wording change."""
    deck = INDEX.read_text(encoding="utf-8")
    src = deck[deck.index("<!-- self-repair:begin -->"):deck.index("<!-- self-repair:end -->")]
    images = re.findall(r'<image x="(\d+)" y="(\d+)"[^>]*href="(data:[^"]+)"', src)
    curves = re.findall(r'<polyline class="curve (\w+)" points="([^"]+)"', src)
    assert len(images) == 9 and len(curves) == 12, (len(images), len(curves))

    # old plot frames: x 860..1560, y 88..318 and 470..700
    plots = [(88, 58), (470, 346)]       # (old top, new top)
    plot_h, old_h, dx = 205, 230, -30

    def to_y(y, plot):
        old, new = plots[plot]
        return new + (y - old) * plot_h / old_h

    def move(points, plot):
        pairs = (p.split(",") for p in points.split())
        return " ".join(f"{float(x) + dx:.1f},{to_y(float(y), plot):.1f}" for x, y in pairs)

    out = ['<svg viewBox="0 0 1760 642" class="repair-svg" role="img" aria-label="Student recall of digits '
           '0, 2 and 7 before and after a lesion of digit 7 and after reactivation; teacher reactivation '
           'of each digit and student error on each digit over time">',
           '<text class="head" x="0" y="40">Student recall</text>']

    size, col_pitch, row_pitch, top = 173, 195, 181, 104
    cols = sorted({int(x) for x, _, _ in images})
    rows = sorted({int(y) for _, y, _ in images})
    for c, name in enumerate(["stored", "lesion", "repaired"]):
        out.append(f'<text class="colh" x="{c * col_pitch + size / 2:.0f}" y="92">{name}</text>')
    for x, y, href in images:
        nx, ny = cols.index(int(x)) * col_pitch, top + rows.index(int(y)) * row_pitch
        out.append(f'<image x="{nx}" y="{ny}" width="{size}" height="{size}" preserveAspectRatio="none" '
                   f'style="image-rendering: pixelated" href="{href}"/>'
                   f'<rect class="thumb" x="{nx}" y="{ny}" width="{size}" height="{size}"/>')

    left, right = 860 + dx, 1560 + dx
    titles = ["Teacher reactivation of each digit", "Student error on each digit"]
    top_ticks = ["1", "100 %"]
    labels = [[("dlab", to_y(194.8, 0) + 14, "digit 7"), ("olab", to_y(282.9, 0) + 14, "0 and 2")],
              [("dlab", 516, "digit 7"), ("olab", 568, "0 and 2")]]
    lesion_x = 960 + dx
    for k in range(2):
        y0, y1 = plots[k][1], plots[k][1] + plot_h
        out.append(f'<text class="ptitle" x="{left}" y="{y0 - 16}">{titles[k]}</text>')
        for curve_class, points in curves[6 * k:6 * k + 6]:
            out.append(f'<polyline class="curve {curve_class}" points="{move(points, k)}"/>')
        out.append(f'<line class="axis" x1="{left}" y1="{y1}" x2="{right}" y2="{y1}"/>'
                   f'<line class="axis" x1="{left}" y1="{y0}" x2="{left}" y2="{y1}"/>')
        for y, text in ((y0, top_ticks[k]), (y1, "0")):
            out.append(f'<line class="axis" x1="{left - 12}" y1="{y}" x2="{left}" y2="{y}"/>'
                       f'<text class="tick" x="{left - 20}" y="{y + 14}">{text}</text>')
        out.append(f'<line class="lesion" x1="{lesion_x}" y1="{y0 - 6}" x2="{lesion_x}" y2="{y1}"/>')
        for cls, y, text in labels[k]:
            out.append(f'<text class="{cls}" x="{right + 16}" y="{y:.0f}">{text}</text>')
    out.append(f'<text class="lesion-t" x="{lesion_x + 14}" y="610">lesion of 7</text>'
               f'<text class="axlab" x="{right}" y="610">time</text></svg>')
    write_inline("repair", out)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    paper = Image.open(PAPER_FIG).convert("RGBA")
    flat = Image.new("RGBA", paper.size, "white")
    flat.alpha_composite(paper)
    flat.convert("RGB").save(OUT / "fig_replay.png", optimize=True)
    print("  fig_replay.png  (paper)")
    units_svg()
    repair_svg()


if __name__ == "__main__":
    sys.exit(main())
