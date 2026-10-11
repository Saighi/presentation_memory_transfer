# %% [markdown]
# # 05: reactivation fades over days in the same environment (Giri et al. 2019, Fig. 5 redrawn)
#
# Slide: Intro, "Reactivation is selective" (under the Kudrimoti panel, as a fragment).
# Output: slides/media/figures/giri2019_fig5.svg
#
# One rat (rat R), same environment (Env 1) on days 1, 2, 3; 3 h of sleep after each session.
# Explained variance (EV) of the session's pairwise correlation pattern in sleep, against its
# chance level (reversed EV). Curves digitized from the published image, see
# notebooks/data/giri2019_fig5_digitized.json. The paper's SD band and sleep-stage shading are
# left out.

# %% Setup
import json
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

# %% Data
DATA = json.loads((ROOT / "notebooks" / "data" / "giri2019_fig5_digitized.json").read_text())
DAYS = DATA["days"]


def rolling_median(y, k=9):
    """Chance curve is partly hidden under the EV curve on day 3: smooth the digitization noise."""
    y = np.asarray(y)
    pad = np.pad(y, k // 2, mode="edge")
    return np.array([np.median(pad[i:i + k]) for i in range(len(y))])


# %% Style
INK, SOFT = P["ink"], P["ink_soft"]
HIPP = P["teacher"]                 # hippocampal reactivation, as in the Kudrimoti panel
CHANCE = "#A9AEB5"

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

# %% Figure: 840 x 400 px, three days side by side, shared y
W_PX, H_PX, DPI = 840, 400, 100
fig = plt.figure(figsize=(W_PX / DPI, H_PX / DPI), dpi=DPI)
X0, Y0, PW, PH, GAP = 170, 60, 174, 220, 64      # first panel box (px, y from the top)

axes = []
for k, day in enumerate(DAYS):
    ax = fig.add_axes(((X0 + k * (PW + GAP)) / W_PX, 1 - (Y0 + PH) / H_PX, PW / W_PX, PH / H_PX))
    t = np.asarray(day["t"])
    ax.plot(t, 100 * rolling_median(day["chance"]), color=CHANCE, lw=3.0, zorder=2)
    ax.plot(t, 100 * np.asarray(day["ev"]), color=HIPP, lw=4.5, zorder=3, solid_joinstyle="round")
    ax.set_xlim(0, 3)
    ax.set_ylim(0, 25)
    ax.xaxis.set_major_locator(MultipleLocator(1))
    ax.yaxis.set_major_locator(MultipleLocator(10))
    ax.tick_params(labelcolor=INK)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_title(f"day {k + 1}", loc="left", fontsize=28, fontweight="semibold", pad=10)
    if k:
        ax.tick_params(axis="y", labelleft=False)
    axes.append(ax)

axes[0].set_ylabel("reactivation\n(% EV)", labelpad=12, linespacing=1.1)
axes[0].text(1.55, 3.2, "chance", color=SOFT, fontsize=24, ha="left", va="bottom")
fig.text((X0 + 1.5 * PW + GAP) / W_PX, 1 - (Y0 + PH + 70) / H_PX, "hours of sleep after the session",
         ha="center", va="top", fontsize=27, color=INK)

out = tv.paths.media_path("figures", "giri2019_fig5.svg")
fig.savefig(out, facecolor="white", transparent=False)
fig.savefig(tv.paths.media_path("figures", "giri2019_fig5_preview.png", draft=True), facecolor="white")
print("wrote", out)
plt.show() if "ipykernel" in sys.modules else plt.close(fig)
