# %% [markdown]
# # 03: fast transfer of correlated memories (talk version)
#
# Slide: Results, "Replay transfers correlated groups faster" (after the student-recall slide).
# Output: slides/media/figures/correlated_transfer.svg
#
# Same run as the paper figure `fig:fast-redistribution-continuous` (staged acquisition of four
# correlated groups): the simulation is NOT rerun, the paper notebook's cache is loaded
# (paper_figure/notebook/.cache/staged_correlated_transfer/, written by
# 06_staged_correlated_transfer_v2_workbench.py). Redrawn for projection: Gram matrix in greys,
# transfer gap with direct labels instead of a legend, intrinsic transfer in the kappa violet.

# %% Setup
import sys
from pathlib import Path

try:
    ROOT = Path(__file__).resolve().parents[1]
except NameError:  # interactive window without __file__
    ROOT = Path.cwd().parent if Path.cwd().name == "notebooks" else Path.cwd()
sys.path.insert(0, str(ROOT))

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.ticker import MultipleLocator

import talkviz as tv

P = tv.PALETTE

# %% Run (paper cache) and corpus
CACHE = (tv.paths.PAPER_REPO / "paper_figure" / "notebook" / ".cache"
         / "staged_correlated_transfer" / "run_6907442272d4.npz")
run = dict(np.load(CACHE))

GROUP_SIZES = (8, 7, 6, 5)          # as in the paper notebook
RHO = 0.80
EVENT_STEPS = (57_300, 124_800, 187_600)
N_STEPS = 300_000

# Gram matrix of the corpus: exact by construction, (1 - rho) I + rho 11^T inside a group, 0 across
n_mem = sum(GROUP_SIZES)
GRAM = np.zeros((n_mem, n_mem))
edges = np.concatenate(([0], np.cumsum(GROUP_SIZES)))
for a, b in zip(edges[:-1], edges[1:]):
    GRAM[a:b, a:b] = RHO
np.fill_diagonal(GRAM, 1.0)

t = run["step"] / 1_000
gap_int, gap_reh = run["intrinsic_gap"], run["rehearsal_gap"]
print(f"final gap: intrinsic {gap_int[-1]:.3f}, rehearsal {gap_reh[-1]:.3f}")

# %% Style
INK, SOFT, RULE = P["ink"], P["ink_soft"], "#C9CED6"
INTRINSIC = "#8E44AD"              # kappa violet: the coupling that makes replay selective
REHEARSAL = "#6B7075"
GREYS = LinearSegmentedColormap.from_list("ink", ["#FFFFFF", INK])

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Segoe UI", "Inter", "Helvetica Neue", "Arial", "DejaVu Sans"],
    "font.size": 28, "axes.labelsize": 30, "xtick.labelsize": 26, "ytick.labelsize": 26,
    "axes.linewidth": 2.0, "xtick.major.width": 2.0, "ytick.major.width": 2.0,
    "xtick.major.size": 8, "ytick.major.size": 8, "xtick.major.pad": 8, "ytick.major.pad": 8,
    "axes.edgecolor": SOFT, "xtick.color": SOFT, "ytick.color": SOFT,
    "axes.labelcolor": INK, "text.color": INK,
    "svg.fonttype": "none",
})

# %% Figure: Gram matrix (left) + active transfer gap (right). 1760 x 740 px, the slide body width
W_PX, H_PX, DPI = 1760, 740, 100
fig = plt.figure(figsize=(W_PX / DPI, H_PX / DPI), dpi=DPI)


def px_axes(x, y, w, h):
    """Axes from a pixel box, y measured from the top."""
    return fig.add_axes((x / W_PX, 1 - (y + h) / H_PX, w / W_PX, h / H_PX))


# --- Gram matrix ---
G_X, G_Y, G_S = 190, 110, 400
ax = px_axes(G_X, G_Y, G_S, G_S)
img = ax.imshow(GRAM, cmap=GREYS, vmin=0, vmax=1, interpolation="nearest")
for a, b in zip(edges[:-1], edges[1:]):     # thin frame around each correlated block
    ax.add_patch(plt.Rectangle((a - 0.5, a - 0.5), b - a, b - a, fill=False, ec=SOFT, lw=1.5))
ax.set_xticks([])
ax.set_yticks([(a + b - 1) / 2 for a, b in zip(edges[:-1], edges[1:])],
              [f"group {k + 1}" for k in range(len(GROUP_SIZES))])
ax.tick_params(axis="y", length=0, pad=12, labelcolor=INK, labelsize=27)
for s in ax.spines.values():
    s.set_color(SOFT); s.set_linewidth(1.5)
ax.set_title("memory similarity", loc="left", fontsize=30, fontweight="semibold", pad=14)

# horizontal colour bar under the matrix
cax = px_axes(G_X, G_Y + G_S + 40, G_S, 22)
cb = fig.colorbar(img, cax=cax, orientation="horizontal")
cb.set_ticks([0, 0.8, 1], labels=["0", "0.8", "1"])
cb.outline.set_edgecolor(SOFT); cb.outline.set_linewidth(1.5)
cax.tick_params(labelsize=24, length=6, labelcolor=INK)
cb.set_label("cosine", fontsize=26, labelpad=6, color=SOFT)

# --- transfer gap ---
X0, Y0, PW, PH = 820, 110, 680, 490
ax = px_axes(X0, Y0, PW, PH)
for ev in EVENT_STEPS:
    ax.axvline(ev / 1_000, color=RULE, lw=2.5, ls=(0, (5, 4)), zorder=1)
ax.plot(t, gap_reh, color=REHEARSAL, lw=4.5, ls=(0, (4.5, 2.5)), zorder=3)
ax.plot(t, gap_int, color=INTRINSIC, lw=5.5, zorder=4)
ax.set_xlim(0, N_STEPS / 1_000)
ax.set_ylim(0, 1.04)
ax.xaxis.set_major_locator(MultipleLocator(100))
ax.yaxis.set_major_locator(MultipleLocator(0.5))
ax.yaxis.set_major_formatter(lambda v, _: f"{v:g}")
ax.tick_params(labelcolor=INK)
ax.spines[["top", "right"]].set_visible(False)
ax.set_xlabel("plasticity events (×10³)", labelpad=10)
ax.set_ylabel("transfer gap", labelpad=12)

# group arrivals: name above each start (same as the timeline of the protocol slide)
for k, ev in enumerate((0, *EVENT_STEPS)):
    ax.text(ev / 1_000 + 3, 1.05, f"group {k + 1}", transform=ax.get_xaxis_transform(),
            ha="left", va="bottom", fontsize=24, color=SOFT, fontweight="semibold")

# direct labels at the line ends, ink (no coloured text): proximity names the curve
for y_end, label in ((gap_reh[-1], "uniform\nrehearsal"), (gap_int[-1], "intrinsic\ntransfer")):
    ax.annotate(label, xy=(N_STEPS / 1_000, y_end), xytext=(16, 0), textcoords="offset points",
                va="center", ha="left", fontsize=27, fontweight="semibold", linespacing=1.05,
                annotation_clip=False)

out = tv.paths.media_path("figures", "correlated_transfer.svg")
fig.savefig(out, facecolor="white", transparent=False)
fig.savefig(tv.paths.media_path("figures", "correlated_transfer_preview.png", draft=True), facecolor="white")
print("wrote", out)
plt.show() if "ipykernel" in sys.modules else plt.close(fig)

# %% Correlation sweep: the paper figure as is (slide after this one)
import shutil

src = tv.paths.PAPER_REPO / "paper_figure" / "photoshop_figures" / "fig_correlation_sweep_composite.png"
shutil.copy(src, tv.paths.media_path("figures", "correlation_sweep.png"))
