# %% [markdown]
# # 02: Teacher activity tracks the F_max state, with MNIST digits as memories
#
# Slide: Results, "Teacher activity tracks the largest settled student free energy, and
# plasticity reduces it" (paper sec:sequential-free-energy-tracking).
#
# Same protocol and parameters as notebook 01, with 8 MNIST digits (14x14, raw, unit norm, as in
# the paper's MNIST figure) acquired one at a time instead of orthogonal patterns. Built step by
# step:
#
# 1. digits + simulation + does F_max behave as in the paper figure?   <- this version
# 2. SMACOF map of the memory sphere
# 3. trajectory on the map
# 4. teacher and student activity displayed as digit images
#
# With correlated digits the F_max state is the part of the new digit not shared with the digits
# already stored, so digits are picked to be mostly novel (talkviz.mnist).
#
# Cost: digit choice ~2 s, simulation once (cached in outputs/cache), checks seconds.

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
from talkviz.mnist import select_digits

P_ = tv.PALETTE

# %% Settings (protocol as notebook 01)
N_MEMORIES = 8
STAGE_STEPS = 16_000          # simulation time between memory introductions
PLASTICITY_OFF = 3_000
CLIMB_WINDOW = 600
TEACHER_NOISE = 0.05          # teacher noise std per step (paper 0.05); lower = cleaner, re-simulates

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
    mnist_typicality=0.5,      # weight of "looks like its class" vs "novel"
    store_weights=False,       # 196x196 weights per record would be ~350 MB
)
SIDE = cfg.mnist_side

# %% Digits: novelty = cosine between each new digit and the F_max state it creates
digits, novelty = select_digits(N_MEMORIES, SIDE, cfg.mnist_candidates, cfg.mnist_typicality)
overlap = np.abs(digits.T @ digits)[~np.eye(N_MEMORIES, dtype=bool)].mean()
print(f"novelty per stage {np.round(novelty, 2)} | mean overlap between digits {overlap:.2f}")
fig, axes = plt.subplots(1, N_MEMORIES, figsize=(12, 2))
for k, a in enumerate(axes):
    a.imshow(digits[:, k].reshape(SIDE, SIDE), cmap="gray_r")
    a.set_title(f"m{k + 1}  nov {novelty[k]:.2f}", fontsize=10)
    a.axis("off")
plt.show()

# %% Simulate (cached)
t0 = time.time()
R = tr.simulate(cfg)
A = tr.analyze(R, cfg)
steps = R["step"]
print(f"{len(steps)} records | load/sim + analysis {time.time() - t0:.1f}s | leakage off memory "
      f"span: median {np.median(A['leak']):.3f}, 90th pct {np.percentile(A['leak'], 90):.3f}")

# %% Step 1 check: angle to F_max state, F_max, selection drive (as the paper figure)
kappa = cfg.kappa * cfg.teacher_speedup
drive = kappa * np.linalg.norm(R["x_S"] - R["x_T"], axis=1)
stage_starts = np.array([0, *R["events"]])
t = steps / 1e3

fig, axes = plt.subplots(4, 1, figsize=(12, 10), sharex=True)
panels = [
    (A["angle_full"], "angle to nearest\nF_max state (°)", P_["teacher"]),
    (A["F_max"], "F_max", P_["student"]),
    (drive, "selection drive\nκ‖ε_TS‖", P_["ink"]),
    (A["leak"], "teacher leakage\noff memory span", P_["ink_soft"]),
]
for a, (y, label, color) in zip(axes, panels):
    for s in stage_starts:
        a.axvspan(s / 1e3, (s + PLASTICITY_OFF) / 1e3, color="#E4B94F", alpha=0.3, lw=0)
    a.plot(t, y, color=color, lw=1)
    a.set_ylabel(label, fontsize=11)
    a.tick_params(labelsize=10)
axes[0].set_ylim(0, 92)
axes[-1].set_xlabel("network updates (×10³)", fontsize=11)
fig.tight_layout()
tv.save_figure(fig, "02_step1_fmax_check.png", draft=True)
plt.show()

# Per-stage summary: does the teacher reach the F_max state, and does learning remove F_max?
for k in range(N_MEMORIES):
    s0 = stage_starts[k]
    climb = (steps > s0 + CLIMB_WINDOW) & (steps <= s0 + PLASTICITY_OFF)
    end = (steps > s0 + STAGE_STEPS - 1000) & (steps < s0 + STAGE_STEPS)
    print(f"stage {k + 1}: F_max {A['F_max'][climb].mean():.3f} -> {A['F_max'][end].mean():.4f} | "
          f"angle after climb (plasticity off) median {np.median(A['angle_full'][climb]):4.1f}° | "
          f"memory's own q at stage end {A['q_mem'][end][:, k].mean():.4f}")

# %% [markdown]
# ## Step 2: SMACOF map of the memory sphere
#
# Same construction as notebook 01: ±memories plus evenly spaced teacher records as landmarks
# (records give the best map, see 01), in memory-span coordinates; every record and F_max state
# is then placed on the fixed map.
#
# Each memory is repeated MEM_REPEATS times among the landmarks (a weight in SMACOF). With one
# copy, the hundreds of trajectory landmarks around each F_max state outweigh the memory dot,
# and the F_max ring landed next to its own memory in only 29% of the climbed records (100% in
# the full space); with 10 copies, 86%, same distance-to-target fidelity (2026-10-06).

# %% SMACOF landscape
import talkviz.embed as em

N_LANDMARKS = 400
MEM_REPEATS = 10
P = N_MEMORIES
mem_pts = np.vstack([A["mem"].T, -A["mem"].T])           # ±m_i in memory-span coordinates
lm_idx = np.linspace(0, len(steps) - 1, N_LANDMARKS).astype(int)
landmarks = np.vstack([np.repeat(mem_pts, MEM_REPEATS, axis=0), A["c"][lm_idx]])
Y_lm, stress = em.landmark_layout(landmarks)

t0 = time.time()
Y_mem = Y_lm[:2 * P * MEM_REPEATS].reshape(2 * P, MEM_REPEATS, 2).mean(1)
Y_x = em.place(A["c"], landmarks, Y_lm)
has_v = np.linalg.norm(A["v"], axis=1) > 0
Y_v = np.full_like(Y_x, np.nan)
Y_v[has_v] = em.place(A["v"][has_v], landmarks, Y_lm)
print(f"placed {2 * len(steps)} points in {time.time() - t0:.1f}s")

r = np.corrcoef(np.linalg.norm(Y_x - Y_v, axis=1)[has_v], A["angle"][has_v])[0, 1]
r_step = np.corrcoef(np.linalg.norm(np.diff(A["c"], axis=0), axis=1),
                     np.linalg.norm(np.diff(Y_x, axis=0), axis=1))[0, 1]
D_mem = em.pairwise(mem_pts[:P], mem_pts[:P])
r_mem = np.corrcoef(D_mem[np.triu_indices(P, 1)],
                    em.pairwise(Y_mem[:P], Y_mem[:P])[np.triu_indices(P, 1)])[0, 1]
climbed = ((steps - stage_starts[R["active"] - 1]) > CLIMB_WINDOW) & (R["plasticity"] == 0) \
    & (R["active"] > 1) & has_v
ring_near_own = (em.pairwise(Y_v[climbed], Y_mem).argmin(1) % P) == R["active"][climbed] - 1
print(f"F_max ring nearest to its own memory dot (teacher climbed): {ring_near_own.mean():.0%}")
print(f"corr(2D distance to F_max state, true angle) = {r:.2f} | "
      f"corr(2D step, true step) = {r_step:.2f} | corr(2D, true distances between digits) = {r_mem:.2f}")

# %% Static check: whole trajectory coloured by stage, memories labelled
stage_of_rec = R["active"] - 1
fig, ax = plt.subplots(figsize=(9, 9))
ax.scatter(*Y_x.T, c=stage_of_rec, cmap="viridis", s=3)
ax.scatter(*Y_mem.T, s=80, color="white", edgecolor="black", zorder=3)
for i, (x, y) in enumerate(Y_mem):
    ax.annotate(f"{'-' if i >= P else ''}{i % P}", (x, y), xytext=(6, 6),
                textcoords="offset points", fontsize=13, weight="bold")
ax.set_aspect("equal")
ax.set_title(f"teacher trajectory by stage, digits labelled (stress-1 {stress:.2f})", fontsize=13)
ax.axis("off")
tv.save_figure(fig, "02_step2_map.png", draft=True)
plt.show()

# %% [markdown]
# ## Step 3: trajectory on the map (notebook 01's animation, no inset yet)

# %% Pacing: video time only, no re-simulation needed (then rerun preview / render)
FPS = 24                      # lower = whole video slower (30 was 25% faster)
PAUSE_FRAMES = 60             # pause when a memory is added: 60 frames = 2.5 s at 24 fps
# simulation steps per video frame in each phase of a stage (smaller = slower on screen):
# (climb to F_max, rest of plasticity OFF, student learning, wandering).
# Must be multiples of the recording interval (10 during the climb, 50 elsewhere).
STRIDES = (10, 300, 50, 300)
# F_max ring and teacher->ring link: hidden when F_max < RING_THRESHOLD x its peak over the
# run; above it their opacity is F_max / peak (lower = ring stays visible longer)
RING_THRESHOLD = 0.1

# %% Animation setup
from talkviz.fmax_anim import FmaxAnimation

labels = [f"{k}" for k in range(P)] + [f"−{k}" for k in range(P)]   # digit classes 0..7
anim = FmaxAnimation(R, A, Y_x, Y_v, Y_mem, PLASTICITY_OFF, labels=labels,
                     climb_window=CLIMB_WINDOW, hold_frames=PAUSE_FRAMES, strides=STRIDES,
                     fps=FPS, style=dict(fade_out=RING_THRESHOLD))

# %% Preview: key moments of one stage, inline (seconds; run before the video)
anim.preview(stage=4, moments=[0, 3, 30, 55, 0.5, -1], name="02_preview")

# %% Render video (draft: half resolution into outputs/, ~80 s)
anim.render("mnist_fmax_tracking.mp4", draft=True, frame_range=None)

# %% [markdown]
# ## Step 4: teacher and student activity as digit images (left inset)
#
# Cortex (student) on top, hippocampus (teacher) below: raw activity, paper's red/blue colormap
# centred at zero, one fixed scale for the whole run. Replay arrow constant; prediction-error
# arrow width follows |eps_TS|. During the climb the teacher image converges to the novel part
# of the new digit (notes/fmax_state_is_the_mismatch.md) while the student shows the shared part.

# %% Animation with the digit inset
from talkviz.digit_inset import DigitInset

inset = DigitInset(R["x_T"], R["x_S"], SIDE)
anim4 = FmaxAnimation(R, A, Y_x, Y_v, Y_mem, PLASTICITY_OFF, labels=labels, inset=inset,
                      climb_window=CLIMB_WINDOW, hold_frames=PAUSE_FRAMES, strides=STRIDES,
                      fps=FPS,
                      style=dict(inset_width=0.17, cbar_width=0.15, fade_out=RING_THRESHOLD))

# %% Preview: key moments of one stage, inline (seconds; run before the video)
anim4.preview(stage=4, moments=[0, 3, 30, 55, 0.5, -1], name="02_step4_preview")

# %% Render video (draft: half resolution into outputs/, ~90 s)
anim4.render("mnist_fmax_tracking_digits.mp4", draft=True, frame_range=None)
