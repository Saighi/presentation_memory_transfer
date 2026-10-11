# %% [markdown]
# # 01: Teacher activity tracks the F_max state (SMACOF landscape)
#
# Slide: Results, "Teacher activity tracks the largest settled student free energy, and
# plasticity reduces it" (paper sec:sequential-free-energy-tracking).
# Output: slides/media/animations/fmax_tracking_smacof.mp4
#
# Same protocol as the paper figure (orthogonal memories acquired one at a time, student
# plasticity off at the start of each stage), with shorter stages. The memory sphere (P dims)
# is flattened by SMACOF once, on all ±memories plus trajectory landmarks; every record is
# then placed on that fixed map.
#
# On the map: memory dots coloured by their settled student free energy
# q(m_i) = pi_TS/2 m_i^T N_S m_i (exact; a new memory pulses when acquired), the F_max state
# (green ring) with a dashed link from the teacher, both fading as F_max -> 0, and the teacher
# (blue) with its path in the current stage. Positions on the map are approximate (stress
# printed below); the side traces are exact.
#
# Landmarks: evenly spaced records beat farthest-point sampling and memory-arc scaffolds on
# both checks below (2026-10-06, 8 memories: corr 0.84 vs 0.78-0.84 for distance-to-target,
# 0.51 vs 0.37-0.45 for step size).
#
# Cost: simulation ~20 s once (cached in outputs/cache), everything else seconds,
# draft video ~1 min.

# %% Setup
import sys
import time
from pathlib import Path

try:
    ROOT = Path(__file__).resolve().parents[1]
except NameError:  # interactive window without __file__
    ROOT = Path.cwd().parent if Path.cwd().name == "notebooks" else Path.cwd()
sys.path.insert(0, str(ROOT))

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.colors import LinearSegmentedColormap, Normalize, to_rgb
from matplotlib.lines import Line2D
from matplotlib.patches import Circle, FancyArrowPatch
from matplotlib.animation import FFMpegWriter

import talkviz as tv
import talkviz.tracking as tr
import talkviz.embed as em
from talkviz.richtext import rich_legend, rich_title

P_ = tv.PALETTE

# %% Simulation settings
N_MEMORIES = 8
STAGE_STEPS = 16_000          # simulation time between memory introductions
PLASTICITY_OFF = 3_000        # paper: 10_000 (the climb takes ~400 steps)
CLIMB_WINDOW = 600            # recorded every 10 steps after each acquisition
TEACHER_NOISE = 0.05          # teacher noise std per step (paper 0.05); lower = cleaner, re-simulates

cfg = tr.TrackingConfig(
    n_memories=N_MEMORIES,
    teacher_noise=TEACHER_NOISE,
    n_steps=N_MEMORIES * STAGE_STEPS,
    plasticity_off_steps=PLASTICITY_OFF,
    record_every=50,
    dense_every=10,
    dense_window=CLIMB_WINDOW,
)

# %% Simulate (cached)
R = tr.simulate(cfg)
t0 = time.time()
A = tr.analyze(R, cfg)
steps = R["step"]
print(f"{len(steps)} records | analysis {time.time() - t0:.1f}s | "
      f"leakage off memory span: median {np.median(A['leak']):.3f}, max {A['leak'].max():.3f}")

# %% SMACOF landscape: ±memories + trajectory landmarks, then place everything
N_LANDMARKS = 400

P = N_MEMORIES
memories = np.vstack([np.eye(P), -np.eye(P)])            # ±m_i in memory coordinates
lm_idx = np.linspace(0, len(steps) - 1, N_LANDMARKS).astype(int)
landmarks = np.vstack([memories, A["c"][lm_idx]])
Y_lm, stress = em.landmark_layout(landmarks)

t0 = time.time()
Y_mem = Y_lm[:2 * P]
Y_x = em.place(A["c"], landmarks, Y_lm)                  # teacher, every record
has_v = np.linalg.norm(A["v"], axis=1) > 0
Y_v = np.full_like(Y_x, np.nan)
Y_v[has_v] = em.place(A["v"][has_v], landmarks, Y_lm)    # F_max state, every record
print(f"placed {2 * len(steps)} points in {time.time() - t0:.1f}s")

# How faithful is the map for what we show?
r = np.corrcoef(np.linalg.norm(Y_x - Y_v, axis=1)[has_v], A["angle"][has_v])[0, 1]
r_step = np.corrcoef(np.linalg.norm(np.diff(A["c"], axis=0), axis=1),
                     np.linalg.norm(np.diff(Y_x, axis=0), axis=1))[0, 1]
print(f"corr(2D distance to F_max state, true angle) = {r:.2f} | "
      f"corr(2D step, true step) = {r_step:.2f}")

# %% Pacing: video time only, no re-simulation needed (then rerun preview / render)
FPS = 24                      # lower = whole video slower (30 was 25% faster)
PAUSE_FRAMES = 60             # pause when a memory is added: 60 frames = 2.5 s at 24 fps
# simulation steps per video frame in each phase of a stage (smaller = slower on screen):
# (climb to F_max, rest of plasticity OFF, student learning, wandering).
# Must be multiples of the recording interval (10 during the climb, 50 elsewhere).
STRIDES = (10, 300, 50, 300)

# %% Frame plan: slow motion on the climb, faster through holds and wandering
frames, stage_of, stage_starts = tr.frame_plan(
    R, PLASTICITY_OFF, climb_window=CLIMB_WINDOW, learn_window=3_500,
    strides=STRIDES, hold_on_acquisition=PAUSE_FRAMES)
frames = np.asarray(frames)
# frames since the current stage's first frame (drives the acquisition pulse and badge)
first = {}
since_acq = np.array([p - first.setdefault(stage_of[i], p) for p, i in enumerate(frames)])
in_pause = (stage_of[frames] > 0) & (since_acq <= PAUSE_FRAMES)
print(f"{len(frames)} frames, {len(frames) / FPS:.0f} s at {FPS} fps")

# %% Static check: the whole trajectory on the landscape, coloured by stage
fig, ax = plt.subplots(figsize=(9, 9))
ax.scatter(*Y_x.T, c=stage_of, cmap="viridis", s=3)
ax.scatter(*Y_mem.T, s=60, color="white", edgecolor="black", zorder=3)
for i, (x, y) in enumerate(Y_mem):
    ax.annotate(f"{'-' if i >= P else ''}{i % P + 1}", (x, y), xytext=(6, 6),
                textcoords="offset points", fontsize=11)
ax.set_aspect("equal")
ax.set_title(f"trajectory by stage (stress-1 {stress:.2f})", fontsize=14)
ax.axis("off")
tv.save_figure(fig, "01_fmax_tracking_overview.png", draft=True)
plt.show()

# %% Style constants (sized for a projector: read from the back of the room)
Q_CMAP = LinearSegmentedColormap.from_list(
    "surprise", ["#E3E6EA", "#F2B36B", P_["student"], "#7A1F0E"])
F_PEAK = A["F_max"].max()
Q_NORM = Normalize(0, F_PEAK)
TRAIL_STEPS = 1_500           # fading teacher trail, drawn through every record
OFF_COLOR = "#E4B94F"
LEARN_COLOR = "#BFE3CB"
ADD_COLOR = "#7A1F0E"         # same dark red as a new memory's dot
TEACHER_RGB = to_rgb(P_["teacher"])
FADE_OUT = 0.1                # F_max ring and link hidden below this fraction of the peak

MEM_SIZE = 650                # memory dots (points^2)
PULSE = 1.4                   # extra size of a just-acquired memory, decays over ~12 frames
TEACHER_SIZE = 900
RING_SIZE = 3000
TRAIL_WIDTH = 6
LINK_WIDTH = 3.5

MEM_LABEL_SIZE = 26
MEM_LABEL_OFFSET = 58         # points, away from the map centre
PHASE_SIZE = 36
TICK_SIZE = 22
AXIS_LABEL_SIZE = 26
MATH_SIZE = 38                # F_max in titles and legend
LEGEND_SIZE = 28              # legend words
LEGEND_MATH_SIZE = 34         # F_max in the legend
CBAR_LABEL_SIZE = 24
NOTE_SIZE = 16

# label each memory dot on the side facing away from the map centre, so +m and -m labels
# of nearby dots do not collide
centre = Y_x.mean(0)
out_dir = (Y_mem - centre) / np.linalg.norm(Y_mem - centre, axis=1, keepdims=True)

# coupling inset (left strip): two nodes, a constant replay arrow and a prediction-error arrow
# whose width follows the interface error |eps_TS| = |x_S - x_T| (the drive on the teacher)
eps_TS = np.linalg.norm(R["x_S"] - R["x_T"], axis=1)
eps_scale = np.clip(eps_TS / np.percentile(eps_TS, 99), 0, 1)
NODE_R = 0.36                 # node radius, inset data units (inset is 1 wide)
NODE_EDGE = 7
NODE_LABEL_SIZE = 28
ERR_WIDTH = (3, 18)           # error arrow line width, from no error to the 99th pct
REPLAY_WIDTH = 6
STUDENT_DOT_SIZE = 420
NODE_TINT = 0.12             # node fill: role colour at this opacity

tv.use_mpl_style()
plt.rcParams.update({"font.weight": "bold", "axes.labelweight": "bold",
                     "xtick.labelsize": TICK_SIZE, "ytick.labelsize": TICK_SIZE,
                     "axes.labelsize": AXIS_LABEL_SIZE, "axes.linewidth": 2.0,
                     "xtick.major.width": 2.0, "ytick.major.width": 2.0,
                     "xtick.major.size": 7, "ytick.major.size": 7,
                     # math in the same bold sans as the text (cm is thin from far)
                     "mathtext.fontset": "custom", "mathtext.rm": "sans:bold",
                     "mathtext.it": "sans:italic:bold", "mathtext.bf": "sans:bold"})


# %% Figure and artists (one figure, updated per frame)
def build_figure():
    fig = plt.figure(figsize=(19.2, 10.8))
    art = {}

    # ---- coupling inset: cortex (student) over hippocampus (teacher) ----
    axN = fig.add_axes([0.0, 0.17, 0.14, 0.81])
    w_px, h_px = 0.14 * 1920, 0.81 * 1080
    H = h_px / w_px                         # inset height in data units, aspect 1
    axN.set_xlim(0, 1)
    axN.set_ylim(0, H)
    axN.set_aspect("equal")
    axN.axis("off")
    yS, yT = H * 0.72, H * 0.28
    for y, role, name in ((yS, "student", "cortex\n(student)"),
                          (yT, "teacher", "hippocampus\n(teacher)")):
        c = Circle((0.5, y), NODE_R, facecolor=(*to_rgb(P_[role]), NODE_TINT),
                   edgecolor=P_[role], lw=NODE_EDGE, zorder=2)
        axN.add_patch(c)
        art[f"node_{role}"] = c
        top = role == "student"
        axN.text(0.5, y + (NODE_R + 0.1) * (1 if top else -1), name, ha="center",
                 va="bottom" if top else "top", fontsize=NODE_LABEL_SIZE, weight="bold",
                 color=P_[role], linespacing=1.1)
    gap = 0.08
    art["replay"] = FancyArrowPatch((0.33, yT + NODE_R + gap), (0.33, yS - NODE_R - gap),
                                    arrowstyle="-|>", mutation_scale=30, lw=REPLAY_WIDTH,
                                    color=P_["teacher"], zorder=1)
    art["error"] = FancyArrowPatch((0.67, yS - NODE_R - gap), (0.67, yT + NODE_R + gap),
                                   arrowstyle="-|>", mutation_scale=30, lw=ERR_WIDTH[0],
                                   color=P_["student"], zorder=1)
    axN.add_patch(art["replay"])
    axN.add_patch(art["error"])
    ang = np.pi / 2 - 2 * np.pi * np.arange(P) / P
    art["sdots"] = axN.scatter(0.5 + 0.2 * np.cos(ang), yS + 0.2 * np.sin(ang),
                               s=STUDENT_DOT_SIZE, c=np.zeros(P), cmap=Q_CMAP, norm=Q_NORM,
                               edgecolor=P_["ink"], linewidth=1.8, zorder=3)

    # ---- main display: the map ----
    ax = fig.add_axes([0.17, 0.17, 0.41, 0.81])   # small gap after the inset
    # frame on the memories and the bulk of the trajectory (rare outliers may leave the frame)
    allY = np.vstack([np.percentile(Y_x, [1, 99], axis=0), Y_mem])
    lo, hi = allY.min(0), allY.max(0)
    pad = 0.13 * (hi - lo).max()          # room for the memory labels
    ax.set_xlim(lo[0] - pad, hi[0] + pad)
    ax.set_ylim(lo[1] - pad, hi[1] + pad)
    ax.set_aspect("equal")
    ax.axis("off")

    art["past"], = ax.plot([], [], color=P_["teacher"], alpha=0.2, lw=2, zorder=1)
    art["trail"] = LineCollection([], linewidths=TRAIL_WIDTH, capstyle="round", zorder=2)
    ax.add_collection(art["trail"])
    art["link"], = ax.plot([], [], color=P_["transfer"], lw=LINK_WIDTH, ls=(0, (3, 2)), zorder=2)
    art["mem"] = ax.scatter(*Y_mem.T, s=MEM_SIZE, c=np.zeros(2 * P), cmap=Q_CMAP, norm=Q_NORM,
                            edgecolor=P_["ink"], linewidth=2.2, zorder=3)
    art["labels"] = []
    for i, ((x, y), (ux, uy)) in enumerate(zip(Y_mem, out_dir)):
        art["labels"].append(ax.annotate(
            f"{'−' if i >= P else ''}m{i % P + 1}", (x, y),
            xytext=(MEM_LABEL_OFFSET * ux, MEM_LABEL_OFFSET * uy), textcoords="offset points",
            ha="center", va="center", fontsize=MEM_LABEL_SIZE, weight="bold",
            color=P_["ink"], zorder=3))
    art["vmark"] = ax.scatter([], [], s=RING_SIZE, facecolor="none", edgecolor=P_["transfer"],
                              linewidth=6, zorder=4)
    art["x"] = ax.scatter([], [], s=TEACHER_SIZE, color=P_["teacher"], edgecolor="white",
                          linewidth=3.5, zorder=5)

    # ---- under the map: colour scale + legend ----
    cax = fig.add_axes([0.19, 0.08, 0.17, 0.03])
    cb = fig.colorbar(plt.cm.ScalarMappable(Q_NORM, Q_CMAP), cax=cax, orientation="horizontal")
    cb.outline.set_linewidth(1.5)
    cb.set_ticks([0, F_PEAK])
    cb.set_ticklabels(["stored", "new"])
    cb.ax.tick_params(labelsize=TICK_SIZE)
    cb.set_label("memory's free energy", fontsize=CBAR_LABEL_SIZE, weight="bold", labelpad=6)
    cb.ax.xaxis.set_label_position("top")
    rich_legend(fig, (0.395, 0.095), [
        (dict(marker="o", ms=26, color=P_["teacher"], mec="white", mew=3), ["teacher"]),
        (dict(marker="o", ms=34, mfc="none", mec=P_["transfer"], mew=5),
         [r"$F_{\mathrm{max}}$", "state"]),
    ], LEGEND_SIZE, LEGEND_MATH_SIZE, P_["ink"])
    fig.text(0.01, 0.012, "2D map of the teacher memory sphere (SMACOF): distances approximate",
             fontsize=NOTE_SIZE, weight="normal", color=P_["ink_soft"])

    # ---- right column: plasticity phase + exact traces ----
    art["phase"] = fig.text(0.815, 0.905, "", fontsize=PHASE_SIZE, weight="bold", ha="center",
                            va="center", color=P_["ink"],
                            bbox=dict(boxstyle="round,pad=0.45", lw=0))
    axF = fig.add_axes([0.64, 0.50, 0.33, 0.27])
    axA = fig.add_axes([0.64, 0.13, 0.33, 0.27], sharex=axF)
    for a in (axF, axA):
        for s in stage_starts:
            a.axvspan(s / 1e3, (s + PLASTICITY_OFF) / 1e3, color=OFF_COLOR, alpha=0.35, lw=0)
    art["traceF"], = axF.plot([], [], color=P_["student"], lw=3.5)
    rich_title(axF, ["largest student free energy", r"$F_{\mathrm{max}}$"],
               AXIS_LABEL_SIZE, MATH_SIZE, P_["ink"])
    axF.set_ylim(0, F_PEAK * 1.1)
    axF.set_yticks([0, round(F_PEAK, 2)])
    axF.tick_params(labelbottom=False)
    art["traceA"], = axA.plot([], [], color=P_["teacher"], lw=2)
    rich_title(axA, ["teacher's angle to the", r"$F_{\mathrm{max}}$", "state (°)"],
               AXIS_LABEL_SIZE, MATH_SIZE, P_["ink"])
    axA.set_ylim(0, 92)
    axA.set_yticks([0, 45, 90])
    axA.set_xlabel("network updates (×10³)")
    axA.set_xlim(0, steps[-1] / 1e3)
    art["curF"] = axF.axvline(0, color=P_["ink"], lw=2.5)
    art["curA"] = axA.axvline(0, color=P_["ink"], lw=2.5)
    return fig, art


def draw(art, frame_pos):
    i = frames[frame_pos]
    k = int(R["active"][i])
    stage_start = np.searchsorted(steps, stage_starts[stage_of[i]])
    # memories: only the acquired ones, coloured by their own free energy; the new one pulses
    q = np.r_[A["q_mem"][i], A["q_mem"][i]]
    alive = np.r_[np.arange(P) < k, np.arange(P) < k]
    size = np.full(2 * P, float(MEM_SIZE))
    if k > 1:
        size[[k - 1, P + k - 1]] *= 1 + PULSE * np.exp(-since_acq[frame_pos] / 12)
    art["mem"].set_array(q)
    art["mem"].set_sizes(size)
    art["mem"].set_alpha(alive.astype(float))
    # inset: student's memory dots (same colours as the map), error arrow, teacher pulse
    art["sdots"].set_array(A["q_mem"][i])
    art["sdots"].set_alpha((np.arange(P) < k).astype(float))
    e = eps_scale[i]
    art["error"].set_linewidth(ERR_WIDTH[0] + (ERR_WIDTH[1] - ERR_WIDTH[0]) * e)
    art["error"].set_mutation_scale(28 + 30 * e)
    pulse = np.exp(-since_acq[frame_pos] / 12) if in_pause[frame_pos] else 0.0
    art["node_teacher"].set_radius(NODE_R * (1 + 0.22 * pulse))
    for lab, a in zip(art["labels"], alive):
        lab.set_visible(bool(a))
    # teacher: faint path since this stage began, fading recent trail, dot
    art["past"].set_data(*Y_x[stage_start:i + 1].T)
    recent = Y_x[np.searchsorted(steps, steps[i] - TRAIL_STEPS):i + 1]
    if len(recent) > 1:
        art["trail"].set_segments(np.stack([recent[:-1], recent[1:]], axis=1))
        rgba = np.tile([*TEACHER_RGB, 1.0], (len(recent) - 1, 1))
        rgba[:, 3] = np.linspace(0.05, 1, len(recent) - 1)
        art["trail"].set_color(rgba)
    else:
        art["trail"].set_segments([])
    art["x"].set_offsets(Y_x[i][None])
    # F_max state and the teacher's link to it, fading once F_max is learned away
    # (below FADE_OUT of the peak the F_max state is arbitrary, so it is hidden)
    strength = float(np.clip(A["F_max"][i] / F_PEAK, 0, 1))
    strength = strength if strength > FADE_OUT else 0.0
    if has_v[i]:
        art["vmark"].set_offsets(Y_v[i][None])
        art["vmark"].set_alpha(strength)
        art["link"].set_data(*np.stack([Y_x[i], Y_v[i]]).T)
        art["link"].set_alpha(strength)
    # badge: acquisition pause, then plasticity phase
    plastic = bool(R["plasticity"][i])
    if in_pause[frame_pos]:
        art["phase"].set_text("adding a memory")
        art["phase"].set_color("white")
        art["phase"].get_bbox_patch().set_facecolor(ADD_COLOR)
    else:
        art["phase"].set_text("student learning" if plastic else "student plasticity OFF")
        art["phase"].set_color(P_["ink"])
        art["phase"].get_bbox_patch().set_facecolor(LEARN_COLOR if plastic else OFF_COLOR)
    art["traceF"].set_data(steps[:i + 1] / 1e3, A["F_max"][:i + 1])
    art["traceA"].set_data(steps[:i + 1] / 1e3, A["angle"][:i + 1])
    art["curF"].set_xdata([steps[i] / 1e3] * 2)
    art["curA"].set_xdata([steps[i] / 1e3] * 2)


# %% Preview: key moments of one stage, shown inline (seconds; run this before the video)
PREVIEW_STAGE = 4             # 0-based stage index
MOMENTS = [0, 3, 30, 55, 0.5, -1]   # frame offsets in the stage; a float = fraction of the stage

fig, art = build_figure()
in_stage = np.flatnonzero(stage_of[frames] == PREVIEW_STAGE)
paths = []
for n, m in enumerate(MOMENTS):
    pos = in_stage[int(m * (len(in_stage) - 1))] if isinstance(m, float) else in_stage[m]
    draw(art, pos)
    paths.append(tv.media_path("figures", f"01_preview_s{PREVIEW_STAGE}_{n}.png", draft=True))
    fig.savefig(paths[-1], dpi=50)
plt.close(fig)

grid, axes = plt.subplots(3, 2, figsize=(16, 13.5))
for a, path_ in zip(axes.flat, paths):
    a.imshow(plt.imread(path_))
    a.axis("off")
grid.subplots_adjust(0, 0, 1, 1, 0.01, 0.01)
grid.savefig(tv.media_path("figures", f"01_preview_s{PREVIEW_STAGE}_grid.png", draft=True), dpi=60)
plt.show()

# %% Render video. DRAFT: half resolution into outputs/; final: full HD into slides/media/
DRAFT = True
FRAME_RANGE = None            # e.g. slice(0, 400) to render only the first stages

sel = range(len(frames))[FRAME_RANGE] if FRAME_RANGE else range(len(frames))
path = tv.media_path("animations", "fmax_tracking_smacof.mp4", draft=DRAFT)
fig, art = build_figure()
writer = FFMpegWriter(fps=FPS, codec="libx264",
                      extra_args=["-pix_fmt", "yuv420p", "-crf", "20", "-preset", "fast"])
t0 = time.time()
with writer.saving(fig, str(path), dpi=50 if DRAFT else 100):
    for p in sel:
        draw(art, p)
        writer.grab_frame()
plt.close(fig)
print(f"{len(sel)} frames -> {path} in {time.time() - t0:.0f}s")
