"""Palette and plotting style matched to slides/css/talk.css.

Colours come from the paper figures and docs/schematic/talk_transfer: teacher
(hippocampus) blue, student (neocortex) orange, transfer green. If you change
one here, change the matching CSS variable too.
"""

import matplotlib as mpl

PALETTE = {
    # roles
    "teacher": "#378ADD",
    "student": "#D85A30",
    "transfer": "#3A9A5C",
    "drive": "#2A78C8",
    "error": "#D4532A",
    "plastic": "#4C8DFF",
    "frozen": "#9AA0A6",
    # paper figure series
    "snapshots": ["#B32525", "#FF9101", "#C200B8"],
    "modes": ["#1B5E3B", "#3A9A5C", "#8FD19E"],
    # surfaces and text
    "bg": "#FFFFFF",
    "bg_soft": "#F4F5F7",
    "ink": "#23262D",
    "ink_soft": "#5F6670",
    "rule": "#D9DDE3",
    "bg_dark": "#111316",
    "ink_dark": "#E8EAED",
}

# Deck canvas in px (reveal width x height). Render full-slide media at this size
# (or a fraction of it) so text in the render keeps its intended size.
SLIDE_PX = (1920, 1080)
DPI = 100

FONT = ["Inter", "Segoe UI", "Helvetica Neue", "Arial", "DejaVu Sans"]


def use_mpl_style(dark: bool = False, scale: float = 1.0) -> None:
    """Large, clean matplotlib defaults for projection.

    ``scale`` multiplies font sizes and line widths (use <1 for media that sits
    in half a slide but is rendered at full-slide pixels).
    """
    fg = PALETTE["ink_dark"] if dark else PALETTE["ink"]
    soft = "#A9AEB5" if dark else PALETTE["ink_soft"]
    bg = PALETTE["bg_dark"] if dark else PALETTE["bg"]
    mpl.rcParams.update({
        "figure.figsize": (SLIDE_PX[0] / DPI, SLIDE_PX[1] / DPI),
        "figure.dpi": DPI,
        "savefig.dpi": DPI,
        "figure.facecolor": bg,
        "axes.facecolor": bg,
        "savefig.facecolor": bg,
        "font.family": "sans-serif",
        "font.sans-serif": FONT,
        "font.size": 22 * scale,
        "axes.titlesize": 26 * scale,
        "axes.labelsize": 24 * scale,
        "xtick.labelsize": 20 * scale,
        "ytick.labelsize": 20 * scale,
        "legend.fontsize": 20 * scale,
        "legend.frameon": False,
        "lines.linewidth": 3.0 * scale,
        "axes.linewidth": 1.5 * scale,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.edgecolor": soft,
        "axes.labelcolor": fg,
        "text.color": fg,
        "xtick.color": soft,
        "ytick.color": soft,
        "axes.prop_cycle": mpl.cycler(color=[
            PALETTE["teacher"], PALETTE["student"], PALETTE["transfer"],
            *PALETTE["snapshots"],
        ]),
        "mathtext.fontset": "cm",
        "svg.fonttype": "none",
    })


def plotly_template(dark: bool = False):
    """A plotly template with the deck's fonts and colours (for interactive embeds)."""
    import plotly.graph_objects as go

    fg = PALETTE["ink_dark"] if dark else PALETTE["ink"]
    bg = PALETTE["bg_dark"] if dark else PALETTE["bg"]
    grid = "#2A2E35" if dark else PALETTE["rule"]
    return go.layout.Template(layout=dict(
        font=dict(family=", ".join(FONT), size=22, color=fg),
        paper_bgcolor=bg,
        plot_bgcolor=bg,
        colorway=[PALETTE["teacher"], PALETTE["student"], PALETTE["transfer"], *PALETTE["snapshots"]],
        xaxis=dict(gridcolor=grid, zeroline=False),
        yaxis=dict(gridcolor=grid, zeroline=False),
        scene=dict(
            xaxis=dict(gridcolor=grid, backgroundcolor=bg),
            yaxis=dict(gridcolor=grid, backgroundcolor=bg),
            zaxis=dict(gridcolor=grid, backgroundcolor=bg),
        ),
        margin=dict(l=40, r=40, t=40, b=40),
    ))
