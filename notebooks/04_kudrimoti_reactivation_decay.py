# %% [markdown]
# # 04: reactivation fades after learning (Kudrimoti et al. 1999, Fig. 3D redrawn)
#
# Slide: Intro, "Reactivation is selective".
# Output: slides/media/figures/kudrimoti1999_fig3d.svg
#
# Values read off the published bar plot (PMC6782694, Fig. 3D; 22 track-running sessions,
# 7 rats, familiar track): explained correlation variance (EV, %) of the RUN correlation
# pattern, mean ± SEM. PRE is r^2(RUN, PRE); the POST bars are the partial r^2(RUN, POST | PRE),
# in three consecutive 10-min bins of slow-wave sleep. Decay time constant 30 min (their caption).

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
from matplotlib.ticker import MultipleLocator

import talkviz as tv

P = tv.PALETTE

# %% Data (read off the figure, +-0.2 %)
LABELS = ["before", "10", "20", "30"]
EV = np.array([5.7, 16.2, 10.7, 8.2])
SEM = np.array([2.4, 2.8, 1.7, 2.4])

# %% Style
INK, SOFT = P["ink"], P["ink_soft"]
HIPP = P["teacher"]                 # hippocampal reactivation
BEFORE = "#B7BCC4"

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Segoe UI", "Inter", "Helvetica Neue", "Arial", "DejaVu Sans"],
    "font.size": 28, "axes.labelsize": 30, "xtick.labelsize": 28, "ytick.labelsize": 26,
    "axes.linewidth": 2.0, "xtick.major.width": 2.0, "ytick.major.width": 2.0,
    "xtick.major.size": 8, "ytick.major.size": 8, "xtick.major.pad": 10, "ytick.major.pad": 8,
    "axes.edgecolor": SOFT, "xtick.color": SOFT, "ytick.color": SOFT,
    "axes.labelcolor": INK, "text.color": INK,
    "svg.fonttype": "none",
})

# %% Figure: 840 x 430 px, top of the right column (Giri et al. panel goes under it)
W_PX, H_PX, DPI = 840, 430, 100
fig = plt.figure(figsize=(W_PX / DPI, H_PX / DPI), dpi=DPI)
ax = fig.add_axes((170 / W_PX, 140 / H_PX, 610 / W_PX, 260 / H_PX))

x = np.array([0, 1.35, 2.35, 3.35])     # gap between "before" and the sleep bins
colors = [BEFORE, HIPP, HIPP, HIPP]
ax.bar(x, EV, width=0.78, color=colors, zorder=2)
ax.errorbar(x, EV, yerr=[np.zeros_like(SEM), SEM], fmt="none", ecolor=INK,
            elinewidth=2.5, capsize=9, capthick=2.5, zorder=3)

ax.set_xticks(x, LABELS)
ax.tick_params(axis="x", length=0, labelcolor=INK)
ax.tick_params(axis="y", labelcolor=INK)
ax.set_xlim(-0.6, 3.95)
ax.set_ylim(0, 20)
ax.yaxis.set_major_locator(MultipleLocator(10))
ax.spines[["top", "right"]].set_visible(False)
ax.set_ylabel("reactivation\n(% EV)", labelpad=12, linespacing=1.1)

# bracket naming the sleep bins: minutes of sleep after running
y_br = -0.3
ax.annotate("", xy=(x[1] - 0.39, y_br), xytext=(x[3] + 0.39, y_br), xycoords=("data", "axes fraction"),
            arrowprops=dict(arrowstyle="-", color=SOFT, lw=2.0), annotation_clip=False)
ax.text((x[1] + x[3]) / 2, y_br - 0.04, "min of sleep after running",
        transform=ax.get_xaxis_transform(), ha="center", va="top", fontsize=27, color=INK)

out = tv.paths.media_path("figures", "kudrimoti1999_fig3d.svg")
fig.savefig(out, facecolor="white", transparent=False)
fig.savefig(tv.paths.media_path("figures", "kudrimoti1999_fig3d_preview.png", draft=True), facecolor="white")
print("wrote", out)
plt.show() if "ipykernel" in sys.modules else plt.close(fig)
