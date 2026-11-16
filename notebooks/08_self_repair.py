# %% [markdown]
# # 08: self-repairing memory (talk only, not in the paper)
#
# Slide: Results, "Self-repairing memory", right after the F_max player.
# Output: inline SVG in slides/index.html, between the `self-repair:begin/end` markers
# (inline, not an <img>, so its columns and curves can be reveal fragments).
#
# The student already holds digits 0, 2, 7 (W_S = the teacher's weights, `pretrain`). Replay runs
# as in the transfer slides (paper parameters, seed 106). At the lesion we cut the student
# synapses that only digit 7 uses: W_S <- W_S - u u^T W_S, u = the part of m_7 orthogonal to
# m_0 and m_2 (unit norm). 0 and 2 are untouched, 7 loses 79 % of itself. The student then
# surprises the teacher only along u, the drive pushes replay there, the student relearns it.
#
# Cost: simulation ~30 s once, then cached in outputs/cache.

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
from talkviz.slidesvg import digit_image, digit_png_b64, recall_top_half, write_inline
from prioritized_memory_transfer import ModelConfig
from prioritized_memory_transfer import diagnostics as dg
from prioritized_memory_transfer.memory import build_memory, zero_diag
from prioritized_memory_transfer.model import TwoPopModel

# %% Settings (paper values of the transfer run)
DIGIT_LABELS = (0, 2, 7)
DAMAGED = 2                       # index into DIGIT_LABELS: digit 7
SIDE = 28
DT_STEP = 0.5
N_BEFORE = 1_000                  # steps of healthy replay before the lesion
N_AFTER = 6_000                   # steps after it
RECORD_EVERY = 10
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

# lesion direction: what only the damaged digit uses
others = patterns[:, [k for k in range(P) if k != DAMAGED]]
Q, _ = torch.linalg.qr(others)
u = patterns[:, DAMAGED] - Q @ (Q.T @ patterns[:, DAMAGED])
print(f"digit {DIGIT_LABELS[DAMAGED]}: share of the memory only it uses {float(u.norm()):.2f}")
u = u / u.norm()

# %% Recall from the top half (isolated student, steady state, as the paper's recall figure)
def recall_all(W):
    return recall_top_half(W, patterns, SIDE)


# %% Simulate (cached)
cache_path = CACHE / f"self_repair_seed{SEED}_d{DIGIT_LABELS[DAMAGED]}_{N_BEFORE}_{N_AFTER}.npz"
cache_path.parent.mkdir(parents=True, exist_ok=True)
if cache_path.exists():
    run = dict(np.load(cache_path))
    print(f"loaded {cache_path.name}")
else:
    t0 = time.time()
    torch.manual_seed(SEED)
    teacher = build_memory(patterns, act=None)
    U_T = dg.manifold_basis(teacher.M_op)
    pi_st = -PI_ST_FRACTION * dg.spectral_gap(teacher.M_op.T @ teacher.M_op)
    cfg = ModelConfig(d=d, P=P, pi_T=1.0, pi_TS=1.0, pi_S=0.5, pi_ST=pi_st, tau_T=10.0, tau_S=1.0,
                      eta=0.005, sigma_xi=0.05, r0=1.0, pattern_kind="orthonormal", activation=None,
                      seed=SEED, device="cpu", dtype=torch.float64)
    model = TwoPopModel(teacher.W, cfg, pi_ST=pi_st, patterns=patterns)
    model.pretrain(list(range(P)))                 # the student already holds all three
    g0 = torch.Generator().manual_seed(SEED + 10_000)
    c0 = torch.randn(P, generator=g0, dtype=torch.float64)
    model.x_T = U_T @ (c0 / c0.norm())
    model.x_S = model.solve_xS_steady(model.x_T)
    gen = torch.Generator().manual_seed(SEED + 20_000)

    rec = {k: [] for k in ("time", "overlap", "error")}

    def record(t):
        rec["time"].append(t)
        rec["overlap"].append((patterns.T @ model.x_T / model.x_T.norm()).numpy())
        rec["error"].append(model.pattern_residual().numpy())   # |m| = 1: relative error

    recalls = {"stored": recall_all(model.W_S)}
    record(0.0)
    for step in range(1, N_BEFORE + N_AFTER + 1):
        if step == N_BEFORE + 1:
            model.W_S = zero_diag(model.W_S - torch.outer(u, u @ model.W_S))
            recalls["lesion"] = recall_all(model.W_S)
        model.macro.step(DT_STEP, gen, mode="full")
        if step % RECORD_EVERY == 0:
            record(step * DT_STEP)
    recalls["repaired"] = recall_all(model.W_S)
    run = {k: np.asarray(v) for k, v in rec.items()}
    run.update({f"recall_{k}": v for k, v in recalls.items()})
    run["patterns"] = patterns.numpy()
    np.savez_compressed(cache_path, **run)
    print(f"simulated in {time.time() - t0:.0f} s -> {cache_path.name}")

time_, ov, err = run["time"], np.abs(run["overlap"]), run["error"]
t_lesion = N_BEFORE * DT_STEP
pre, post = time_ <= t_lesion, time_ > t_lesion
print("mean |overlap| before / first 1500 after:", ov[pre].mean(0).round(2),
      ov[post & (time_ < t_lesion + 1500)].mean(0).round(2))
print("error just after lesion / end:", err[post][0].round(3), err[-1].round(3))
for k in ("stored", "lesion", "repaired"):
    rc = run[f"recall_{k}"]
    e = np.linalg.norm(rc - run["patterns"].T, axis=1)
    print(f"recall error {k:9s}", e.round(2))

# %% Preview
import matplotlib.pyplot as plt

fig, axs = plt.subplots(2, 1, figsize=(9, 6), sharex=True)
for j, lab in enumerate(DIGIT_LABELS):
    axs[0].plot(time_, ov[:, j], label=str(lab))
    axs[1].plot(time_, err[:, j], label=str(lab))
for a in axs:
    a.axvline(t_lesion, c="k")
    a.legend()
axs[0].set_ylabel("|cos(x_T, m)|")
axs[1].set_ylabel("student error")
fig2, axs2 = plt.subplots(3, 3, figsize=(5, 5))
for c, k in enumerate(("stored", "lesion", "repaired")):
    for r in range(P):
        axs2[r, c].imshow(run[f"recall_{k}"][r].reshape(SIDE, SIDE), cmap="gray_r")
        axs2[r, c].axis("off")
plt.show() if "ipykernel" in sys.modules else plt.close("all")

# %% SVG for the slide
# Canvas = the slide body at 1:1 (1760 wide), so font sizes are rendered sizes.
# colours live in css/talk.css (.repair-svg)
VMAX = float(np.abs(run["patterns"]).max())
SMOOTH = 3                                 # records, light smoothing of the noisy traces


def smooth(y, s=SMOOTH):
    k = np.exp(-0.5 * (np.arange(-3 * s, 3 * s + 1) / s) ** 2)
    k /= k.sum()
    yp = np.pad(y, (3 * s, 3 * s), mode="edge")
    return np.convolve(yp, k, mode="valid")


# left: recall thumbnails, 3 columns x 3 rows
TH, GAP, X0, Y0 = 168, 34, 0, 160
cols = ("stored", "lesion", "repaired")
col_head = {"stored": "stored", "lesion": "after lesion", "repaired": "after replay"}
col_frag = {"stored": None, "lesion": 1, "repaired": 2}

# right: two plots sharing time
PX0, PX1 = 860, 1560
PLOTS = {"replay": (88, 318), "error": (470, 700)}     # (top, bottom) of each plot area
T_MAX = float(time_[-1])


def tx(t):
    return PX0 + (PX1 - PX0) * t / T_MAX


def ty(v, plot):
    top, bot = PLOTS[plot]
    return bot - (bot - top) * v


def poly(t, y, plot, cls):
    pts = " ".join(f"{tx(a):.1f},{ty(b, plot):.1f}" for a, b in zip(t, y))
    return f'<polyline class="{cls}" points="{pts}"/>'


def frag(i):
    return "" if i is None else f' class="fragment" data-fragment-index="{i}"'


out = []
out.append('<svg viewBox="0 0 1760 790" class="arch-svg repair-svg" role="img" aria-label="Student recall of digits 0, 2 and 7 before and after a lesion of digit 7, and after replay; teacher replay similarity to each digit and student error on each digit over time">')
out.append(f'<text class="head" x="{X0}" y="44">Student recall</text>')
out.append(f'<text class="sub" x="{X0}" y="86">from the top half of each digit</text>')
for c, k in enumerate(cols):
    x = X0 + c * (TH + GAP)
    g = [f'<g{frag(col_frag[k])}>',
         f'<text class="colh" x="{x + TH / 2:.0f}" y="{Y0 - 22}">{col_head[k]}</text>']
    for r in range(P):
        y = Y0 + r * (TH + GAP)
        g.append(digit_image(x, y, TH, digit_png_b64(run[f"recall_{k}"][r], SIDE, VMAX)))
        g.append(f'<rect class="thumb" x="{x}" y="{y}" width="{TH}" height="{TH}"/>')
    g.append("</g>")
    out.append("".join(g))

titles = {"replay": "Teacher replay: similarity to each digit",
          "error": "Student error on each digit"}
data = {"replay": ov, "error": err}
role = {"replay": "teacher", "error": "student"}
ticks = {"replay": ((0, "0"), (1, "1")), "error": ((0, "0"), (1, "100 %"))}
for plot, (top, bot) in PLOTS.items():
    out.append(f'<text class="ptitle" x="{PX0 - 120}" y="{top - 34}">{titles[plot]}</text>')
    out.append(f'<line class="axis" x1="{PX0}" y1="{bot}" x2="{PX1}" y2="{bot}"/>')
    out.append(f'<line class="axis" x1="{PX0}" y1="{top}" x2="{PX0}" y2="{bot}"/>')
    for v, lab in ticks[plot]:
        out.append(f'<line class="axis" x1="{PX0 - 12}" y1="{ty(v, plot):.1f}" x2="{PX0}" y2="{ty(v, plot):.1f}"/>')
        out.append(f'<text class="tick end" x="{PX0 - 20}" y="{ty(v, plot) + 10:.1f}">{lab}</text>')
    # before and after the lesion smoothed apart, so the jump does not leak into "before";
    # the error is smooth already and its jump is drawn as a vertical step
    i_les = int(np.searchsorted(time_, t_lesion, side="right"))   # first record after the lesion
    sm = smooth if plot == "replay" else (lambda y: y)
    Y = np.stack([np.r_[sm(data[plot][:i_les, j]), sm(data[plot][i_les:, j])] for j in range(P)], axis=1)
    for seg, sl, fi in (("pre", slice(0, i_les), None), ("post", slice(i_les, None), 2)):
        g = [f'<g{frag(fi)}>']
        for j in [k for k in range(P) if k != DAMAGED] + [DAMAGED]:   # damaged drawn on top
            cls = f"curve {role[plot]}" if j == DAMAGED else "curve other"
            t_seg, y_seg = time_[sl], Y[sl, j]
            if seg == "post":                        # start where "before" ended
                if plot == "error":
                    t_seg, y_seg = np.r_[t_lesion, t_lesion, t_seg], np.r_[Y[i_les - 1, j], y_seg[0], y_seg]
                else:
                    t_seg, y_seg = np.r_[t_lesion, t_seg], np.r_[Y[i_les - 1, j], y_seg]
            g.append(poly(t_seg, y_seg, plot, cls))
        if seg == "post":
            # direct labels at the curve ends
            ends = {j: Y[-1, j] for j in range(P)}
            lab_d = f"digit {DIGIT_LABELS[DAMAGED]}"
            lab_o = " and ".join(str(DIGIT_LABELS[k]) for k in range(P) if k != DAMAGED)
            y_d, y_o = ty(ends[DAMAGED], plot), ty(np.mean([ends[k] for k in range(P) if k != DAMAGED]), plot)
            if abs(y_d - y_o) < 40:                     # keep the two labels apart
                y_d, y_o = (y_d - 22, y_o + 22) if y_d <= y_o else (y_d + 22, y_o - 22)
            g.append(f'<text class="dlab" x="{PX1 + 18}" y="{y_d + 10:.1f}">{lab_d}</text>')
            g.append(f'<text class="olab" x="{PX1 + 18}" y="{y_o + 10:.1f}">{lab_o}</text>')
        g.append("</g>")
        out.append("".join(g))
# time axis label and the lesion marker
out.append(f'<text class="axlab" x="{PX1}" y="{PLOTS["error"][1] + 50}">time</text>')
xl = tx(t_lesion)
out.append(f'<g class="fragment" data-fragment-index="1">'
           + "".join(f'<line class="lesion" x1="{xl:.1f}" y1="{top - 6}" x2="{xl:.1f}" y2="{bot}"/>'
                     for top, bot in PLOTS.values())
           + f'<text class="lesion-t" x="{xl + 14:.1f}" y="{PLOTS["error"][1] + 50}">lesion of {DIGIT_LABELS[DAMAGED]}</text></g>')
out.append("</svg>")
svg = "\n".join(out)

# %% Write into the deck
write_inline("self-repair", svg)
