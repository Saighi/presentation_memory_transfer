# %% [markdown]
# Candidate colour maps for neural activity (digits, memory thumbnails) in the talk.
#
# Activity is signed (the teacher visits -m as often as +m), so the map is diverging: the zero
# colour fills most of each tile. Constraint: no blue / orange-red (hippocampus / cortex), little
# green (transfer, modes) or violet (selection drive). Stops are written as in the JS players.
# Output: outputs/figures/activity_colormaps.png

# %%
import sys
from pathlib import Path

import numpy as np
import matplotlib
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

ROOT = Path(__file__).resolve().parents[2]
run = dict(np.load(ROOT / "outputs/cache/sphere_transfer_seed106_every10_v2.npz"))
vmax = float(np.percentile(np.abs(run["x_T"]), 99.5))
t = run["time"]
k = int(np.argmin(np.abs(t - 1300)))
pat = run["patterns"]                         # (784, 3): digits 0, 2, 7
tiles = [("+2", pat[:, 1]), ("−7", -pat[:, 2]), ("+0", pat[:, 0]),
         ("hippocampus, t=1300", run["x_T"][k]), ("cortex, t=1300", run["x_S"][k])]

CANDIDATES = {
    "A  viridis (current)": ["#440154", "#482878", "#3E4A89", "#31688E", "#26828E", "#1F9E89",
                             "#35B779", "#6DCD59", "#B4DE2C", "#FDE725"],
    "B  dark zero: pink / lime (like the paper's dark tiles)":
        ["#FFC8F2", "#E77FCF", "#A3388E", "#4A1A45", "#15121A", "#1D4A2C", "#3F8F43", "#8FD15C", "#E0F7A0"],
    "C  white zero: magenta / ink":
        ["#8E0152", "#C51B7D", "#E9A3C9", "#F7F7F7", "#BDBDBD", "#636363", "#141414"],
    "D  white zero: pink / green (PiYG)":
        ["#8E0152", "#C51B7D", "#F1B6DA", "#F7F7F7", "#B8E186", "#4D9221", "#276419"],
    "E  grey zero: white / black (photo negative)":
        ["#FFFFFF", "#D9D9D9", "#B0B0B0", "#8C8C8C", "#666666", "#383838", "#0A0A0A"],
    "F  dark zero: teal-free magma (neg pink, pos yellow)":
        ["#FCC5C0", "#E7629F", "#8C1F6E", "#2B0B3F", "#0D0A12", "#3B2A06", "#9C6A06", "#E8B820", "#FFF3A6"],
}

fig, axes = plt.subplots(len(CANDIDATES), len(tiles) + 1, figsize=(15, 2.55 * len(CANDIDATES)),
                         gridspec_kw={"width_ratios": [1] * len(tiles) + [0.18]})
fig.patch.set_facecolor("white")
for row, (name, stops) in enumerate(CANDIDATES.items()):
    cmap = LinearSegmentedColormap.from_list(name, stops)
    for col, (lab, x) in enumerate(tiles):
        ax = axes[row, col]
        ax.imshow(x.reshape(28, 28), cmap=cmap, vmin=-vmax, vmax=vmax, interpolation="nearest")
        ax.set_xticks([]); ax.set_yticks([])
        for sp in ax.spines.values():
            sp.set_linewidth(2.5); sp.set_color("#23262D")
        if row == 0:
            ax.set_title(lab, fontsize=15, fontweight="bold")
    cb = axes[row, -1]
    cb.imshow(np.linspace(1, -1, 256)[:, None], cmap=cmap, aspect="auto")
    cb.set_xticks([]); cb.set_yticks([0, 255]); cb.set_yticklabels(["+", "−"], fontsize=16, fontweight="bold")
    cb.yaxis.tick_right()
    axes[row, 0].set_ylabel(name.split()[0], rotation=0, fontsize=30, fontweight="bold", labelpad=30, va="center")
    axes[row, 2].text(0.5, -0.12, name[3:], transform=axes[row, 2].transAxes, ha="center", va="top", fontsize=15)
fig.tight_layout(h_pad=2.2)
out = ROOT / "outputs/figures/activity_colormaps.png"
out.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(out, dpi=80)
print(out)
