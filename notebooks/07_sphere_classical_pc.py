# %% [markdown]
# # 07: The same transfer run with a classical PC teacher (control for slide 25)
#
# Slide: Results, right after the transfer-gap map ("gap" layout of 02, data-left="classical"). Same digits, seed, noise,
# initial state and every parameter as notebooks/02_sphere_transfer.py; only the sign of the
# teacher's interface precision changes: pi_ST = +0.45 x spectral gap (classical PC, the teacher
# descends the interface error, pulled toward what the student already predicts) instead of
# -0.45 x spectral gap (ours, the teacher climbs it).
# Output: slides/media/interactive/sphere_classical.data.js, drawn by slides/js/sphere-player.js.
#
# Cost: simulation ~1 min once, then cached in outputs/cache.

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
import torch

import talkviz as tv  # also puts the paper engine on sys.path
from talkviz.paths import CACHE, PAPER_REPO
from prioritized_memory_transfer import ModelConfig
from prioritized_memory_transfer import diagnostics as dg
from prioritized_memory_transfer.memory import build_memory
from prioritized_memory_transfer.model import TwoPopModel

# %% Settings (as 02, only the sign of pi_ST differs)
DIGIT_LABELS = (0, 2, 7)
DISPLAY_DIGITS = (2, 7, 0)
SIDE = 28
N_STEPS = 15_000
DT_STEP = 0.5
RECORD_EVERY = 10
SEED = 106
PI_ST_FRACTION = 0.45
PI_ST_SIGN = +1                   # classical PC; 02 uses -1

# %% Memories
from torchvision.datasets import MNIST

dataset = MNIST(root=str(PAPER_REPO / "data"), train=True, download=False)
images = dataset.data.to(torch.float64) / 255.0
idx = [int(torch.nonzero(dataset.targets == lab, as_tuple=False)[0]) for lab in DIGIT_LABELS]
raw = images[idx].reshape(len(DIGIT_LABELS), -1).T.contiguous()
patterns = raw / raw.norm(dim=0, keepdim=True)
d, P = patterns.shape

# %% Simulate (cached)
cache_path = CACHE / f"sphere_classical_seed{SEED}_every{RECORD_EVERY}.npz"
cache_path.parent.mkdir(parents=True, exist_ok=True)
if cache_path.exists():
    run = dict(np.load(cache_path))
    print(f"loaded {cache_path.name}")
else:
    t0 = time.time()
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    teacher = build_memory(patterns, act=None)
    U_T = dg.manifold_basis(teacher.M_op)
    assert U_T.shape[1] == P
    pi_st = PI_ST_SIGN * PI_ST_FRACTION * dg.spectral_gap(teacher.M_op.T @ teacher.M_op)
    cfg = ModelConfig(d=d, P=P, pi_T=1.0, pi_TS=1.0, pi_S=0.5, pi_ST=pi_st, tau_T=10.0, tau_S=1.0,
                      eta=0.005, sigma_xi=0.05, r0=1.0, pattern_kind="orthonormal", activation=None,
                      seed=SEED, device="cpu", dtype=torch.float64)
    model = TwoPopModel(teacher.W, cfg, pi_ST=pi_st, patterns=patterns)
    g0 = torch.Generator().manual_seed(SEED + 10_000)
    c0 = torch.randn(P, generator=g0, dtype=torch.float64)
    model.x_T = U_T @ (c0 / c0.norm())
    model.x_S = torch.zeros(d, dtype=torch.float64)
    gen = torch.Generator().manual_seed(SEED + 20_000)

    rec = {k: [] for k in ("time", "x_T", "x_S", "c_T", "gap_modes", "gap_vecs", "total", "drive", "dW")}

    def record(t):
        msu = model.M_S @ U_T
        lam, vec = torch.linalg.eigh(msu.T @ msu)       # ascending
        rec["time"].append(t)
        rec["x_T"].append(model.x_T.numpy().copy())
        rec["x_S"].append(model.x_S.numpy().copy())
        rec["c_T"].append((U_T.T @ model.x_T).numpy())
        rec["gap_modes"].append(lam.flip(0).clamp_min(0).numpy())
        rec["gap_vecs"].append(vec.flip(1).numpy())
        rec["total"].append(float(msu.norm()))
        rec["drive"].append(float(abs(model.pi_ST) * model.eps_TS().norm()))
        rate = model.rate_W_S().clone()
        rate.fill_diagonal_(0)
        rec["dW"].append(float(rate.norm()))

    record(0.0)
    for step in range(1, N_STEPS + 1):
        model.macro.step(DT_STEP, gen, mode="full")
        if step % RECORD_EVERY == 0:
            record(step * DT_STEP)
    run = {k: np.asarray(v) for k, v in rec.items()}
    run["U_T"] = U_T.numpy()
    run["patterns"] = patterns.numpy()
    run["pi_ST"] = np.array(pi_st)
    np.savez_compressed(cache_path, **run)
    print(f"simulated in {time.time() - t0:.0f} s -> {cache_path.name}")

time_, gap, c_T = run["time"], run["gap_modes"], run["c_T"]
print(f"pi_ST = {float(run['pi_ST']):+.4f}, {len(time_)} records")

# %% Compare with ours (02's cache): per-mode gap at a few times
ours_path = CACHE / f"sphere_transfer_seed{SEED}_every{RECORD_EVERY}_v2.npz"
ours = dict(np.load(ours_path)) if ours_path.exists() else None
for t in (0, 430, 1_380, 3_000, 5_000, 7_500):
    k = int(np.argmin(np.abs(time_ - t)))
    line = f"t={t:5d}  classical gaps {np.round(gap[k], 3)}"
    if ours is not None:
        line += f"   ours {np.round(ours['gap_modes'][k], 3)}"
    print(line)
speed = np.linalg.norm(np.diff(c_T, axis=0), axis=1)
print(f"mean step on the sphere: classical {speed.mean():.4f}"
      + (f", ours {np.linalg.norm(np.diff(ours['c_T'], axis=0), axis=1).mean():.4f}" if ours is not None else ""))

# %% Preview
import matplotlib.pyplot as plt

fig, ax = plt.subplots(1, 2, figsize=(11, 4))
ax[0].plot(time_, gap)
ax[0].set_title("classical PC: per-mode gap")
if ours is not None:
    ax[1].plot(ours["time"], ours["gap_modes"])
    ax[1].set_title("ours: per-mode gap")
for a in ax:
    a.set_xlabel("time")
    a.set_ylim(-0.05, 1.25)
plt.show()

# %% Export for the HTML player (same camera as 02)
from talkviz.web_export import export_sphere

AXIS_ORDER = (1, 2, 0)
display = [DIGIT_LABELS.index(dg_) for dg_ in DISPLAY_DIGITS]
export_sphere("sphere_classical", run, labels=[str(l) for l in DIGIT_LABELS], display=display,
              side=SIDE, axis_order=AXIS_ORDER, elev=18, azim=120,
              # no numbered moments: the teacher stays at its start, the markers would pile up there
              stops=(7_500,))
