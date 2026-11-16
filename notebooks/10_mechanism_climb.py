# %% [markdown]
# # 10: the mechanism, neuron by neuron (talk only)
#
# Slide: Results, right after "Replay climbs the student's surprise" and before the F_max player.
# Output: slides/media/interactive/mechanism_climb.data.js, drawn live by slides/js/mech-player.js.
#
# A 64-neuron toy (8x8 grid) so every neuron can be drawn. The teacher stores two glyphs, O and X, coded
# +1 on the glyph and -1 elsewhere (black on white with the deck's activity greys, much easier to read than
# 0/1 glyphs on the mid-grey zero). The thin rounded ring and the thin X share no cell, so exactly half the
# cells agree: orthogonal in this code too. The student has learned only O (`pretrain`, the zero-diagonal
# covPCN for O). Paper precisions (pi_T = pi_TS = 1, pi_S = 0.5, tau_T = 10, tau_S = 1), no noise, student
# plasticity OFF (as in the climb phase of the F_max player), kappa = pi_TS.
# (Tried 2026-10-19 and dropped: a student storing O and Y, an X look-alike, to show a distorted copy of X.)
#
# Four phases, one click each on the slide:
#   A  teacher settles alone from a noisy state onto its memory subspace, half way between O and X;
#   B  student settles with the teacher held: it copies O but only ~2/3 of X;
#   C  (no simulation) the interface error eps_TS = x_T - x_S* = N_S x_T = grad q / pi_TS;
#   D  coupled run, student settled at every step (adiabatic, the theorem's setting): the drive
#      kappa eps_TS rotates the teacher toward X, the error grows, up to x_T = X where q = F_max.
#
# With this student N_S m_O = 0 and N_S m_X = 0.34 m_X up to 1e-3 (n = pi_S / (pi_TS + pi_S) = 1/3 for an
# ideal student; checked below), so eps_TS ~ n sin(theta) X: always the X glyph, only its amplitude grows.
# A and B are written out with the model equations (checked against the engine's rates); D runs the engine.
#
# Cost: < 1 s.

# %% Setup
import sys
from pathlib import Path

try:
    ROOT = Path(__file__).resolve().parents[1]
except NameError:  # interactive window without __file__
    ROOT = Path.cwd().parent if Path.cwd().name == "notebooks" else Path.cwd()
sys.path.insert(0, str(ROOT))

import numpy as np
import torch

import talkviz as tv  # also puts the paper engine on sys.path
from talkviz.web_export import export_mechanism
from prioritized_memory_transfer import ModelConfig
from prioritized_memory_transfer import diagnostics as dg
from prioritized_memory_transfer.memory import build_memory
from prioritized_memory_transfer.model import TwoPopModel

# %% Settings
SIDE = 8
PI_T, PI_TS, PI_S = 1.0, 1.0, 0.5       # paper precisions
TAU_T, TAU_S = 10.0, 1.0
KAPPA = PI_TS                           # zero-sum operating point (the error stays on the teacher's memories)
THETA0 = np.deg2rad(45.0)               # where the teacher settles: half way between O and X
NOISE_SHARE = 0.9                       # off-subspace share of the teacher's starting state
SEED = 3

DT_A, N_A, EVERY_A = 0.25, 280, 4       # teacher settles (70 time units)
DT_B, N_B, EVERY_B = 0.02, 300, 6       # student settles (6 time units)
DT_D, THETA_END, EVERY_D = 0.25, np.deg2rad(89.5), 3   # climb, until 0.5 deg from X

# %% Memories: O (rounded ring, one cell in from the edge) and X (both diagonals), +1 on the glyph, -1 off it
O = -np.ones((SIDE, SIDE)); O[1, 2:6] = O[6, 2:6] = O[2:6, 1] = O[2:6, 6] = 1
X = -np.ones((SIDE, SIDE))
for i in range(SIDE):
    X[i, i] = X[i, SIDE - 1 - i] = 1
m_O, m_X = (a.ravel() / np.linalg.norm(a) for a in (O, X))
assert abs(m_O @ m_X) < 1e-12
patterns = torch.tensor(np.stack([m_O, m_X], 1))
d, P = patterns.shape

# %% Networks: teacher stores O and X, student only O
teacher = build_memory(patterns, act=None)
cfg = ModelConfig(d=d, P=P, pi_T=PI_T, pi_TS=PI_TS, pi_S=PI_S, pi_ST=-KAPPA, tau_T=TAU_T, tau_S=TAU_S,
                  eta=0.0, sigma_xi=0.0, r0=1.0, pattern_kind="orthonormal", activation=None,
                  seed=SEED, device="cpu", dtype=torch.float64)
model = TwoPopModel(teacher.W, cfg, pi_ST=-KAPPA, patterns=patterns)
model.pretrain([0])

M_T, M_S = model.M_T.numpy(), model.M_S.numpy()
S_T, S_S = M_T.T @ M_T, M_S.T @ M_S
N_S = model.novelty_operator().numpy()
n = PI_S / (PI_TS + PI_S)
print(f"|N_S m_X - n m_X| = {np.abs(N_S @ m_X - n * m_X).max():.1e},  |N_S m_O| = {np.abs(N_S @ m_O).max():.1e}   (n = {n:.3f})")
print(f"teacher spectral gap {float(dg.spectral_gap(model.M_T.T @ model.M_T)):.3f}")

def q_of(x_T):
    """Student surprise after settling: q = (pi_TS / 2) x_T^T N_S x_T."""
    return 0.5 * PI_TS * x_T @ N_S @ x_T

# F_max on the memory circle: largest eigenvalue of q restricted to span{O, X}; its eigenvector is X
U = patterns.numpy()
lam, vec = np.linalg.eigh(0.5 * PI_TS * U.T @ N_S @ U)
F_MAX = float(lam[-1])
assert abs(abs(vec[1, -1]) - 1) < 1e-9 and abs(F_MAX - q_of(m_X)) < 1e-12
print(f"F_max = q(X) = {F_MAX:.4f}")

# %% A: teacher settles alone (no student, no drive):  tau_T dx_T = -pi_T S_T x_T dt, |x_T| = 1
rng = np.random.default_rng(SEED)
xi = rng.standard_normal(d)
xi -= patterns.numpy() @ (patterns.numpy().T @ xi)          # off the memory subspace
x_T = np.sqrt(1 - NOISE_SHARE**2) * (np.cos(THETA0) * m_O + np.sin(THETA0) * m_X) \
    + NOISE_SHARE * xi / np.linalg.norm(xi)
x_S = np.zeros(d)

# the written-out teacher rate is the engine's (no interface term when x_S = x_T)
model.x_T, model.x_S = torch.tensor(x_T), torch.tensor(x_T)
assert np.allclose(model.rate_x_T_det().numpy(), -PI_T * S_T @ x_T / TAU_T)

frames, phase = [], []
def rec(ph):
    frames.append(np.concatenate([x_T, x_S])); phase.append(ph)

rec(0)
for k in range(1, N_A + 1):
    x_T = x_T - DT_A * PI_T * S_T @ x_T / TAU_T
    x_T /= np.linalg.norm(x_T)
    if k % EVERY_A == 0:
        rec(0)
off = np.linalg.norm(x_T - patterns.numpy() @ (patterns.numpy().T @ x_T))
theta_A = np.arctan2(x_T @ m_X, x_T @ m_O)
print(f"A: off-subspace {off:.1e}, settled {np.rad2deg(theta_A):.1f} deg from O")

# %% B: student settles, teacher held:  tau_S dx_S = (-pi_S S_S x_S + pi_TS (x_T - x_S)) dt
model.x_T, model.x_S = torch.tensor(x_T), torch.tensor(0.3 * x_T)
assert np.allclose(model.rate_x_S().numpy(), (-PI_S * S_S @ (0.3 * x_T) + PI_TS * 0.7 * x_T) / TAU_S)
for k in range(1, N_B + 1):
    x_S = x_S + DT_B * (-PI_S * S_S @ x_S + PI_TS * (x_T - x_S)) / TAU_S
    if k % EVERY_B == 0:
        rec(1)
x_S_star = model.solve_xS_steady(torch.tensor(x_T)).numpy()
eps = x_T - x_S_star
print(f"B: |x_S - x_S*| = {np.linalg.norm(x_S - x_S_star):.1e}")
print(f"C: eps_TS = grad q / pi_TS: {np.abs(eps - N_S @ x_T).max():.1e};  "
      f"cos(eps, X) = {eps @ m_X / np.linalg.norm(eps):.6f}")

# %% D: the climb, engine step (student settled each step, teacher Euler + norm, no noise, no learning)
model.x_T, model.x_S = torch.tensor(x_T), torch.tensor(x_S_star)
t_D = 0
while np.arctan2(x_T @ m_X, x_T @ m_O) < THETA_END:
    model.macro.step(DT_D, None, mode="adiabatic")
    t_D += 1
    if t_D % EVERY_D == 0:
        x_T = model.x_T.numpy().copy()
        x_S = model.solve_xS_steady(model.x_T).numpy()      # settled on the recorded x_T
        rec(2)
x_T = model.x_T.numpy().copy()
x_S = model.solve_xS_steady(model.x_T).numpy()
rec(2)
print(f"D: {t_D} steps ({t_D * DT_D:.0f} time units), q = {q_of(x_T):.4f} of F_max = {F_MAX:.4f}, "
      f"off-subspace {np.linalg.norm(x_T - patterns.numpy() @ (patterns.numpy().T @ x_T)):.1e}")

frames, phase = np.array(frames), np.array(phase)
print({ph: int((phase == ph).sum()) for ph in (0, 1, 2)}, "frames")

# %% Preview: the four held states (teacher / student / error x 1/n)
import matplotlib.pyplot as plt

holds = [0, int(np.flatnonzero(phase == 0)[-1]), int(np.flatnonzero(phase == 1)[-1]), len(frames) - 1]
vmax = np.abs(np.r_[m_O, m_X]).max()
fig, axs = plt.subplots(3, 4, figsize=(8, 6))
for j, h in enumerate(holds):
    xt, xs = frames[h, :d], frames[h, d:]
    for i, (v, nm) in enumerate([(xs, "student"), ((xt - xs) / n, "error x1/n"), (xt, "teacher")]):
        axs[i, j].imshow(v.reshape(SIDE, SIDE), cmap="gray_r", vmin=-vmax, vmax=vmax)
        axs[i, j].set_xticks([]); axs[i, j].set_yticks([])
        if j == 0:
            axs[i, j].set_ylabel(nm)
plt.tight_layout()
plt.show() if "ipykernel" in sys.modules else plt.close(fig)

# %% Export for the player
export_mechanism("mechanism_climb", frames, phase, side=SIDE, memories=np.stack([m_O, m_X]),
                 labels=("O", "X"), n=n, pi_TS=PI_TS, kappa=KAPPA, f_max=F_MAX, N_S=N_S, gain=3)
