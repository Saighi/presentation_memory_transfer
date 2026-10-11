# %% [markdown]
# # 03: MNIST F_max tracking, showing only the memory states the teacher visits
#
# Slide: Results, "Teacher activity tracks the largest settled student free energy, and
# plasticity reduces it" (paper sec:sequential-free-energy-tracking).
# Output: slides/media/animations/mnist_fmax_tracking_visited.mp4
#
# Same simulation and display as notebook 02 (step 4), with two changes:
#
# 1. Each memory is a pair of states, +m and -m (the model treats them alike). The teacher only
#    goes to one of them, so the map is built from, and shows, only the visited one: the sign of
#    the teacher's overlap with the memory once it has climbed to it in that memory's stage.
# 2. The F_max state is also a pair, +u and -u. Notebook 02 picked the one closer to the current
#    teacher state, so the ring could jump to the other side early in a stage, while the teacher
#    was still far from both. Here it is pinned for the whole stage to the one next to the
#    visited memory, i.e. the target the teacher ends up reaching.
#
# Cost: simulation cached (shared with 02), everything before the video seconds, video ~90 s.

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

import talkviz as tv
import talkviz.tracking as tr
import talkviz.embed as em
from talkviz.fmax_anim import FmaxAnimation
from talkviz.digit_inset import DigitInset

# %% Settings (5 memories: own run, simulated once then cached)
N_MEMORIES = 5
STAGE_STEPS = 16_000          # simulation time between memory introductions
PLASTICITY_OFF = 3_000
CLIMB_WINDOW = 600
TEACHER_NOISE = 0.03          # teacher noise std per step (paper 0.05); lower = cleaner, re-simulates

cfg = tr.TrackingConfig(
    n_memories=N_MEMORIES,
    teacher_noise=TEACHER_NOISE,
    n_steps=N_MEMORIES * STAGE_STEPS,
    plasticity_off_steps=PLASTICITY_OFF,
    record_every=50,
    dense_every=10,
    dense_window=CLIMB_WINDOW,
    memories="mnist",
    mnist_side=14,
    mnist_candidates=300,
    mnist_typicality=0.5,
    store_weights=False,
)
SIDE = cfg.mnist_side
P = N_MEMORIES

R = tr.simulate(cfg)
A = tr.analyze(R, cfg)
steps = R["step"]
stage_starts = np.array([0, *R["events"]])
print(f"{len(steps)} records")

# %% Visited sign of each memory: where the teacher sits once it has climbed in that stage
rel = steps - stage_starts[R["active"] - 1]
climbed = (rel > CLIMB_WINDOW) & (rel <= PLASTICITY_OFF) & (R["plasticity"] == 0)
mem = A["mem"]                                       # memories in memory-span coordinates
sign = np.zeros(P)
for j in range(P):
    on = climbed & (R["active"] == j + 1)
    sign[j] = np.sign(np.median(A["c"][on] @ mem[:, j]))
visited = mem * sign                                 # columns: the visited state of each memory
print("visited sign per memory:", sign.astype(int))

# F_max state pinned, per record, to the side of the current stage's new (visited) memory
has_v = np.linalg.norm(A["v"], axis=1) > 0
new_mem = visited[:, R["active"] - 1].T              # (n, P)
flip = np.sign((A["v"] * new_mem).sum(1))
flip[flip == 0] = 1
v_pinned = A["v"] * flip[:, None]
print(f"F_max sign changed on {np.mean((flip < 0) & has_v):.0%} of records vs notebook 02's choice")

# %% SMACOF map: visited memories + one target per stage (both weighted) + trajectory landmarks
# Memories alone do not tie each target to its memory: the ring sat next to its own memory dot
# in only 5-6 of 7 stages for any memory weight or seed. Adding the stage targets (median pinned
# F_max state while the teacher sits on it) as weighted landmarks makes SMACOF respect "target
# 20-36 deg from its memory, ~90 deg from the others". With 16k-step stages, x10 got 6/7 stages
# right on most seeds; x30 gets 7/7 on all seeds 0-4 (seed 0: ring at most 0.60x as far from its
# own memory as from any other, corr 0.78; 2026-10-06).
N_LANDMARKS = 400
MEM_REPEATS = 30
TARGET_REPEATS = 30
SMACOF_SEED = 0

targets = []
for st in range(2, P + 1):                            # stage 1 has no novel target
    t = np.median(v_pinned[climbed & (R["active"] == st)], axis=0)
    targets.append(t / np.linalg.norm(t))
targets = np.array(targets)

lm_idx = np.linspace(0, len(steps) - 1, N_LANDMARKS).astype(int)
landmarks = np.vstack([np.repeat(visited.T, MEM_REPEATS, axis=0),
                       np.repeat(targets, TARGET_REPEATS, axis=0), A["c"][lm_idx]])
Y_lm, stress = em.landmark_layout(landmarks, seed=SMACOF_SEED)
Y_mem = Y_lm[:P * MEM_REPEATS].reshape(P, MEM_REPEATS, 2).mean(1)
t0 = time.time()
Y_x = em.place(A["c"], landmarks, Y_lm)
Y_v = np.full_like(Y_x, np.nan)
Y_v[has_v] = em.place(v_pinned[has_v], landmarks, Y_lm)
print(f"placed {2 * len(steps)} points in {time.time() - t0:.1f}s")

# checks: ring next to its own memory per stage, distance fidelity, ring jumps while visible
on_target = climbed & (R["active"] > 1) & has_v
ratio = []
for st in range(2, P + 1):
    d = em.pairwise(Y_v[on_target & (R["active"] == st)], Y_mem)
    ratio.append(np.median(d[:, st - 1]) / np.median(np.delete(d, st - 1, axis=1).min(1)))
r = np.corrcoef(np.linalg.norm(Y_x - Y_v, axis=1)[has_v], A["angle"][has_v])[0, 1]
visible = has_v & (A["F_max"] / A["F_max"].max() > 0.1)
same = (np.diff(R["active"]) == 0) & visible[1:] & visible[:-1]
jumps = np.linalg.norm(np.diff(Y_v, axis=0), axis=1)[same] / np.ptp(Y_lm, axis=0).max()
print(f"ring distance to own memory / to nearest other, per stage: {np.round(ratio, 2)} "
      f"(<1 = nearest own) | corr(2D distance to F_max state, true angle) = {r:.2f} | "
      f"largest ring jump while visible {jumps.max():.0%} of the map width")

# %% Static check: trajectory by stage, visited memories labelled
fig, ax = plt.subplots(figsize=(9, 9))
ax.scatter(*Y_x.T, c=R["active"] - 1, cmap="viridis", s=3)
ax.scatter(*Y_mem.T, s=90, color="white", edgecolor="black", zorder=3)
labels = [f"{j}" for j in range(P)]     # one state per memory, so no sign needed
for lab, (x, y) in zip(labels, Y_mem):
    ax.annotate(lab, (x, y), xytext=(7, 7), textcoords="offset points", fontsize=14, weight="bold")
ax.set_aspect("equal")
ax.set_title(f"visited memory states only (stress-1 {stress:.2f})", fontsize=13)
ax.axis("off")
tv.save_figure(fig, "03_map.png", draft=True)
plt.show()

# %% Pacing: video time only, no re-simulation needed (then rerun preview / render)
FPS = 24                      # lower = whole video slower (30 was 25% faster)
PAUSE_FRAMES = 60             # pause when a memory is added: 60 frames = 2.5 s at 24 fps
# simulation steps per video frame in each phase of a stage (smaller = slower on screen):
# (climb to F_max, rest of plasticity OFF, student learning, wandering).
# Must be multiples of the recording interval (10 during the climb, 50 elsewhere).
STRIDES = (10, 300, 50, 300)
# F_max ring and teacher->ring link: hidden when F_max < RING_THRESHOLD x its peak over the
# run; above it their opacity is F_max / peak (lower = ring stays visible longer)
RING_THRESHOLD = 0.025

# %% Animation (same display as notebook 02 step 4)
inset = DigitInset(R["x_T"], R["x_S"], SIDE)
anim = FmaxAnimation(R, A, Y_x, Y_v, Y_mem, PLASTICITY_OFF, labels=labels, inset=inset,
                     mem_index=np.arange(P), climb_window=CLIMB_WINDOW, hold_frames=PAUSE_FRAMES,
                     strides=STRIDES, fps=FPS, show_angle=False,
                     style=dict(inset_width=0.17, cbar_width=0.15, fade_out=RING_THRESHOLD,
                                mem_label_size=34, mem_label_offset=62,
                                stored_color="#9AA0A6"))   # darker grey dots

# %% Preview: key moments of one stage, inline (seconds; run before the video)
anim.preview(stage=4, moments=[0, 3, 30, 55, 0.5, -1], name="03_preview")

# %% Render video (draft: half resolution into outputs/, ~90 s)
anim.render("mnist_fmax_tracking_visited.mp4", draft=True, frame_range=None)

# %% Export for the HTML player (seconds): slides/media/interactive/fmax_tracking.data.js
# The deck draws this run itself (slides/js/fmax-player.js), one click per new memory; the
# MP4 above stays as the backup. Same pacing as the video; the player can override it.
from talkviz.web_export import export_fmax

export_fmax("fmax_tracking", R, A, Y_x, Y_v, Y_mem, labels=[f"{j}" for j in range(P)], side=SIDE,
            plasticity_off=PLASTICITY_OFF, climb_window=CLIMB_WINDOW, strides=STRIDES, fps=FPS,
            ring_threshold=RING_THRESHOLD)   # no pause on a new memory: plays straight away
