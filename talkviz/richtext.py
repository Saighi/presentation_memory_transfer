"""Text with mixed font sizes on one baseline (matplotlib Text has a single size).

Used to draw math symbols such as F_max larger than the words around them, so they stay legible
from the back of the room. Each piece is a string; pieces starting with "$" are drawn at
``math_size``, the others at ``size``.
"""

from __future__ import annotations

from matplotlib.lines import Line2D
from matplotlib.offsetbox import AnnotationBbox, DrawingArea, HPacker, TextArea, VPacker


def rich(parts, size, math_size, color, weight="bold", sep=7):
    boxes = [TextArea(p, textprops=dict(fontsize=math_size if p.startswith("$") else size,
                                         weight=weight, color=color)) for p in parts]
    return HPacker(children=boxes, align="baseline", pad=0, sep=sep)


def rich_title(ax, parts, size, math_size, color, pad=12):
    """Left-aligned title above ``ax``."""
    ab = AnnotationBbox(rich(parts, size, math_size, color), (0, 1), xycoords="axes fraction",
                        xybox=(0, pad), boxcoords="offset points", box_alignment=(0, 0),
                        frameon=False, annotation_clip=False)
    ax.add_artist(ab)
    return ab


def rich_legend(fig, xy, rows, size, math_size, color, marker_box=46, sep=12):
    """Legend at figure fraction ``xy`` (left, centre). ``rows`` = [(Line2D kwargs, parts)]."""
    lines = []
    for marker, parts in rows:
        da = DrawingArea(marker_box, marker_box, 0, 0)
        da.add_artist(Line2D([marker_box / 2], [marker_box / 2], ls="", **marker))
        lines.append(HPacker(children=[da, rich(parts, size, math_size, color)],
                             align="center", pad=0, sep=10))
    ab = AnnotationBbox(VPacker(children=lines, align="left", pad=0, sep=sep), xy,
                        xycoords="figure fraction", box_alignment=(0, 0.5), frameon=False)
    fig.add_artist(ab)
    return ab
