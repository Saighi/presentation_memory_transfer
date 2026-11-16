# %% [markdown]
# # 09: continual learning by synthesis (talk only, not in the paper)
#
# Slide: Results, "Continual learning", right after the self-repair slide.
# Output: inline SVG in slides/index.html, between the `continual:begin/end` markers.
#
# Old network: holds digits 0, 2, 7 (covPCN weights). New network: holds digit 9 alone. Two ways
# to end up with one network that holds all four:
# - naive: keep training the old network, clamped to 9 only (no rehearsal), to convergence.
#   MNIST digits overlap (cosine 0.4-0.7), so learning 9 rewrites the old memories: 9 leaks in.
# - synthesis: a plastic network, started as a copy of the old one, coupled to ONE of the two
#   networks at a time, alternating (interleaved replay, the engine's `interleave_merge`, as in
#   the paper repo's continual loop). Each bout is a short transfer run of the slides' model.
#
# 14x14 digits (d = 196): 28x28 made the synthesis ~16x slower (minutes); here ~20 s, cached.

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
import torch.nn.functional as F

import talkviz as tv  # also puts the paper engine on sys.path
from talkviz.paths import CACHE, PAPER_REPO
from talkviz.slidesvg import digit_image, digit_png_b64, recall_top_half, write_inline
from prioritized_memory_transfer import diagnostics as dg
from prioritized_memory_transfer.config import SimConfig
from prioritized_memory_transfer.interleaved import interleave_merge
from prioritized_memory_transfer.macro import CouplingInterface, MacroNetwork, Population
from prioritized_memory_transfer.memory import build_memory, zero_diag

# %% Settings
OLD_LABELS = (0, 2, 7)
NEW_LABEL = 9
SIDE = 14
SEED = 106
KAPPA_FRACTION = 0.45      # kappa = -0.45 x the teacher's spectral gap, as the transfer slides
SIGMA = 0.05               # replay noise (transfer slides)
ETA = 0.01                 # synthesis learning rate
N_BOUTS = 200              # alternating new / old
BOUT_STEPS = 200
DT = 0.5

# %% Memories: first MNIST example of each class, 14x14, unit norm (as the paper's MNIST figure)
from torchvision.datasets import MNIST

dataset = MNIST(root=str(PAPER_REPO / "data"), train=True, download=False)
labels = OLD_LABELS + (NEW_LABEL,)
idx = [int(torch.nonzero(dataset.targets == lab, as_tuple=False)[0]) for lab in labels]
img = F.avg_pool2d(dataset.data[idx].to(torch.float64)[:, None] / 255.0, 28 // SIDE)
raw = img.reshape(len(labels), -1).T.contiguous()
patterns = raw / raw.norm(dim=0, keepdim=True)
d, P = patterns.shape
old, new = patterns[:, :-1], patterns[:, -1:]
print("cosines\n", (patterns.T @ patterns).numpy().round(2))


def errors(W):
    """||m - W m|| per digit (unit-norm m): 0 = stored, 1 = absent."""
    return (patterns - W @ patterns).norm(dim=0).numpy()


# %% Simulate (cached)
cache_path = CACHE / f"continual_synthesis_seed{SEED}_{N_BOUTS}x{BOUT_STEPS}_eta{ETA}.npz"
cache_path.parent.mkdir(parents=True, exist_ok=True)
if cache_path.exists():
    run = dict(np.load(cache_path))
    print(f"loaded {cache_path.name}")
else:
    t0 = time.time()
    W_old = build_memory(old, act=None).W
    W_new = build_memory(new, act=None).W

    # naive: the old network keeps learning, clamped to 9 only (PC rule, to convergence)
    W_naive, m = W_old.clone(), new[:, 0]
    for _ in range(2_000):
        W_naive = zero_diag(W_naive + 0.5 * torch.outer(m - W_naive @ m, m))

    # synthesis: interleaved replay from the new and the old network
    def kappa(W):
        M = torch.eye(d, dtype=W.dtype) - W
        return -KAPPA_FRACTION * dg.spectral_gap(M.T @ M, tol=0.1)

    gen = torch.Generator().manual_seed(SEED)
    T_new = Population("new", W_new.clone(), 1.0, 10.0, sigma_xi=SIGMA, r=1.0)
    T_old = Population("old", W_old.clone(), 1.0, 10.0, sigma_xi=SIGMA, r=1.0)
    S = Population("syn", W_old.clone(), 0.5, 1.0, plastic=True, eta=ETA)
    macro = MacroNetwork([T_new, T_old, S],
                         [CouplingInterface("syn", "new", 1.0, kappa(W_new), active=False),
                          CouplingInterface("syn", "old", 1.0, kappa(W_old), active=False)])
    trace = []
    interleave_merge(macro, ["new", "old"],
                     {"new": dg.orthonormal_basis(new), "old": dg.orthonormal_basis(old)}, "syn",
                     SimConfig(dt=DT, mode="full", bout_steps=BOUT_STEPS, s_substeps=1, progress=False),
                     gen, N_BOUTS, lambda bout, active: trace.append(errors(S.W)))
    W_syn = S.W.clone()

    run = {"patterns": patterns.numpy(), "trace": np.asarray(trace)}
    for k, W in (("old", W_old), ("new", W_new), ("naive", W_naive), ("synthesis", W_syn)):
        run[f"error_{k}"] = errors(W)
        run[f"recall_{k}"] = recall_top_half(W, patterns, SIDE)
    np.savez_compressed(cache_path, **run)
    print(f"simulated in {time.time() - t0:.0f} s -> {cache_path.name}")

for k in ("old", "new", "naive", "synthesis"):
    print(f"error {k:9s}", (100 * run[f"error_{k}"]).round(1), "%")

# %% Preview
import matplotlib.pyplot as plt

fig, axs = plt.subplots(4, P, figsize=(5, 5))
for r, k in enumerate(("old", "new", "naive", "synthesis")):
    for c in range(P):
        axs[r, c].imshow(run[f"recall_{k}"][c].reshape(SIDE, SIDE), cmap="gray_r")
        axs[r, c].axis("off")
    axs[r, 0].set_title(k, loc="left", fontsize=8)
fig2, ax = plt.subplots(figsize=(7, 3))
ax.plot(run["trace"])
ax.set_xlabel("bout")
ax.set_ylabel("synthesis error")
plt.show() if "ipykernel" in sys.modules else plt.close("all")

# %% SVG for the slide (canvas = slide body at 1:1, so font sizes are rendered sizes;
# colours in css/talk.css, .cont-svg)
VMAX = float(np.abs(run["patterns"]).max())
png = {k: [digit_png_b64(x, SIDE, VMAX) for x in run[f"recall_{k}"]] for k in ("naive", "synthesis")}
png["memory"] = [digit_png_b64(x, SIDE, VMAX) for x in run["patterns"].T]

out = ['<svg viewBox="0 0 1760 760" class="arch-svg cont-svg" role="img" aria-label="An old network holding 0, 2 and 7 and a new network holding 9; training the old network on 9 alone makes 9 leak into the old digits, a synthesis network taught by alternating replay of both recalls all four">',
       '<defs><marker id="ct-g" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="30" markerHeight="30" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 L2.5,5 z" fill="#3A9A5C"/></marker>'
       '<marker id="ct-k" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="30" markerHeight="30" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 L2.5,5 z" fill="#5F6670"/></marker></defs>']

# left: the two networks, each with the memories it holds
CARD_W, MT, MG = 440, 116, 16
cards = {"old": (110, "Old network", range(P - 1)), "new": (450, "New network", [P - 1])}
for name, (y0, title, js) in cards.items():
    out.append(f'<rect class="card" x="2" y="{y0}" width="{CARD_W}" height="230" rx="22"/>')
    out.append(f'<text class="ctitle" x="34" y="{y0 + 60}">{title}</text>')
    for i, j in enumerate(js):
        x = 34 + i * (MT + MG)
        out.append(digit_image(x, y0 + 88, MT, png["memory"][j]))
        out.append(f'<rect class="thumb" x="{x}" y="{y0 + 88}" width="{MT}" height="{MT}"/>')

# right: recall of the four digits by the two candidate networks
RX, TH, TG = 660, 150, 26
rows = {"naive": (150, 1, "Old network trained on 9 alone", "no rehearsal",
                  ("9 leaks into", "0, 2 and 7")),
        "synthesis": (480, 2, "Synthesis network", "replay alternates old and new",
                      ("all four", "recalled"))}
for k, (y0, frag, title, sub, verdict) in rows.items():
    g = [f'<g class="fragment" data-fragment-index="{frag}">',
         f'<text class="rtitle" x="{RX}" y="{y0 - 22}">{title}<tspan class="rsub" dx="18">{sub}</tspan></text>']
    for j in range(P):
        x = RX + j * (TH + TG)
        g.append(digit_image(x, y0, TH, png[k][j]))
        g.append(f'<rect class="thumb" x="{x}" y="{y0}" width="{TH}" height="{TH}"/>')
        g.append(f'<text class="err" x="{x + TH / 2}" y="{y0 + TH + 40}">{100 * run[f"error_{k}"][j]:.0f} %</text>')
    xv = RX + P * (TH + TG) + 30
    g.append(f'<text class="verdict" x="{xv}" y="{y0 + 62}">{verdict[0]}</text>')
    g.append(f'<text class="verdict" x="{xv}" y="{y0 + 106}">{verdict[1]}</text>')
    if k == "naive":
        g.append(f'<path class="arr-k" d="M{CARD_W + 16},{225} L{RX - 30},{y0 + TH / 2}" marker-end="url(#ct-k)"/>')
    else:
        g.append(f'<path class="arr-g" d="M{CARD_W + 16},{300} C{CARD_W + 120},{330} {RX - 120},{y0 + 40} {RX - 30},{y0 + 60}" marker-end="url(#ct-g)"/>')
        g.append(f'<path class="arr-g" d="M{CARD_W + 16},{565} C{CARD_W + 100},{565} {RX - 110},{y0 + 100} {RX - 30},{y0 + 95}" marker-end="url(#ct-g)"/>')
    g.append("</g>")
    out.append("".join(g))
out.append(f'<text class="hdr fragment" data-fragment-index="1" x="{RX}" y="72">recall from the top half of each digit, error below</text>')
out.append("</svg>")
svg = "\n".join(out)

# %% Write into the deck
write_inline("continual", svg)
