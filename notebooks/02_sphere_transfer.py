# %% [markdown]
# # 02: Transfer on the teacher memory sphere (paper Fig. reactivation-transfer, panels C + D)
#
# Slide: Results, first slide ("Reactivation transfers memory content").
# Output: slides/media/interactive/sphere_transfer.data.js, drawn live by slides/js/sphere-player.js.
#
# Same run as the paper figure (paper_figure/notebook/01_mnist_transfer_figure_v2_workbench.py:
# digits 0, 2, 7 at 28x28, seed 106, 15k steps), recorded 10x denser (every 10 steps instead of
# 100) so the animation is smooth. Recording draws no random numbers, so the dynamics are
# identical; the check cell compares against the paper's cache.
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

# %% Settings (paper values, only RECORD_EVERY differs)
DIGIT_LABELS = (0, 2, 7)          # simulation order (paper)
DISPLAY_DIGITS = (2, 7, 0)        # paper display order m(1), m(2), m(3)
SIDE = 28
N_STEPS = 15_000
DT_STEP = 0.5
RECORD_EVERY = 10                 # paper: 100
SEED = 106
PI_ST_FRACTION = 0.45

# %% Memories
from torchvision.datasets import MNIST

dataset = MNIST(root=str(PAPER_REPO / "data"), train=True, download=False)
images = dataset.data.to(torch.float64) / 255.0
idx = [int(torch.nonzero(dataset.targets == lab, as_tuple=False)[0]) for lab in DIGIT_LABELS]
raw = images[idx].reshape(len(DIGIT_LABELS), -1).T.contiguous()
patterns = raw / raw.norm(dim=0, keepdim=True)
d, P = patterns.shape
print(f"d={d}, P={P}")

# %% Simulate (cached)
cache_path = CACHE / f"sphere_transfer_seed{SEED}_every{RECORD_EVERY}_v2.npz"   # v2: + drive, dW
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
    pi_st = -PI_ST_FRACTION * dg.spectral_gap(teacher.M_op.T @ teacher.M_op)
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
        # paper panel E: selection drive |kappa| ||eps_TS||, and ||dW_S/dt||_F (no self-connections)
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
    np.savez_compressed(cache_path, **run)
    print(f"simulated in {time.time() - t0:.0f} s -> {cache_path.name}")

time_ = run["time"]
c_T, gap, U_T = run["c_T"], run["gap_modes"], run["U_T"]
print(f"{len(time_)} records, total gap {run['total'][0]:.3f} -> {run['total'][-1]:.3f}")

# %% Check against the paper's cache (every 10th record here = every record there)
paper_cache = sorted((PAPER_REPO / "paper_figure/notebook/.cache/mnist_transfer_v2").glob("run_*.npz"))
if paper_cache:
    ref = np.load(paper_cache[0])
    sub = slice(None, None, 100 // RECORD_EVERY)
    print("max |dc_T| vs paper:", np.abs(c_T[sub] - ref["teacher_coordinates"]).max(),
          "| max |dgap| vs paper:", np.abs(gap[sub] - ref["restricted_error"]).max(),
          "| max |ddrive|:", np.abs(run["drive"][sub] - ref["selection_drive"]).max(),
          "| max |ddW|:", np.abs(run["dW"][sub] - ref["plasticity"]).max())

# %% Memories on the sphere, and which sign the teacher visits
mem = U_T.T @ run["patterns"]                 # (3, P) coordinates of each memory, unit norm
overlap = c_T @ mem                           # (records, P) cosine with each memory
for j, lab in enumerate(DIGIT_LABELS):
    print(f"digit {lab}: |m| on sphere {np.linalg.norm(mem[:, j]):.3f}, "
          f"max overlap +{overlap[:, j].max():.2f} / -{-overlap[:, j].min():.2f}")

# %% Preview: the paper's view (u2, u3, u1 on x, y, z), static
import matplotlib.pyplot as plt

AXIS_ORDER = (1, 2, 0)
fig = plt.figure(figsize=(12, 5))
ax = fig.add_subplot(121, projection="3d")
tr = c_T[:, AXIS_ORDER]
ax.plot(*tr.T, lw=1)
for j, lab in enumerate(DIGIT_LABELS):
    for s in (1, -1):
        p = s * mem[AXIS_ORDER, j]
        ax.scatter(*p, s=60, c="k" if s > 0 else "w", edgecolors="k")
        ax.text(*(1.12 * p), f"{'' if s > 0 else '-'}{lab}")
ax.view_init(elev=22, azim=-48)
ax.set_box_aspect((1, 1, 1))
ax2 = fig.add_subplot(122)
ax2.plot(time_, gap)
ax2.set_xlabel("time")
ax2.set_ylabel("per-mode transfer gap")
plt.show()

# %% Export for the HTML player
# Camera: the paper's view (elev 22, azim -48) leaves 91 % of the run on the far side of the
# sphere (matplotlib draws both halves alike, so it does not show there). elev 18, azim 120 puts
# all of t < 3000 and 90 % of the run on the near side, still looking slightly from above.
from talkviz.web_export import export_sphere

display = [DIGIT_LABELS.index(dg_) for dg_ in DISPLAY_DIGITS]
export_sphere("sphere_transfer", run, labels=[str(l) for l in DIGIT_LABELS], display=display,
              side=SIDE, axis_order=AXIS_ORDER, elev=18, azim=120,
              # pauses: 430 = end of the initial period (first gap down to 0.33, second still 1.0);
              # 1380 = two modes done, just before the drive that transfers the last one;
              # 3000 = most of the transfer done; 7500 = end of the run
              stops=(430, 1_380, 3_000, 7_500))
