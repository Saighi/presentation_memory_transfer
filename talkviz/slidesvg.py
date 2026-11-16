"""Helpers for result slides drawn as inline SVG by a notebook (08 self-repair, 09 continual).

The notebook builds the SVG as a string and writes it into slides/index.html between
``<!-- NAME:begin -->`` / ``<!-- NAME:end -->`` markers, so parts of it can be reveal fragments.
"""

from __future__ import annotations

import base64
import io
import re

import numpy as np

from .paths import SLIDES

# activity LUT of the players (js/sphere-player.js, js/fmax-player.js): negative white,
# zero mid grey, positive black
DIGIT_STOPS = ["#FFFFFF", "#D9D9D9", "#B0B0B0", "#8C8C8C", "#666666", "#383838", "#0A0A0A"]


def _lut(stops, n=255):
    rgb = np.array([[int(s[i:i + 2], 16) for i in (1, 3, 5)] for s in stops], float)
    t = np.linspace(0, len(stops) - 1, n)
    j = np.minimum(t.astype(int), len(stops) - 2)
    f = (t - j)[:, None]
    return np.round(rgb[j] + (rgb[j + 1] - rgb[j]) * f).astype(np.uint8)


_DIG_LUT = _lut(DIGIT_STOPS)


def digit_png_b64(x, side, vmax):
    """A flat activity vector as a side x side PNG in the players' black/white LUT (base64)."""
    import matplotlib.pyplot as plt

    q = np.clip(np.round(np.asarray(x) / vmax * 127), -127, 127).astype(int) + 127
    buf = io.BytesIO()
    plt.imsave(buf, _DIG_LUT[q].reshape(side, side, 3), format="png")
    return base64.b64encode(buf.getvalue()).decode()


def digit_image(x, y, size, png_b64):
    """SVG <image> of a digit, drawn pixelated."""
    return (f'<image x="{x}" y="{y}" width="{size}" height="{size}" preserveAspectRatio="none" '
            f'style="image-rendering: pixelated; image-rendering: crisp-edges" '
            f'href="data:image/png;base64,{png_b64}"/>')


def recall_top_half(W, patterns, side):
    """Recall of each pattern by the isolated linear network W from the top half of the digit:
    the top rows are clamped to the pattern, the rest settle to the free-energy minimum
    (steady state, as the paper's recall figure). ``W`` (d, d) and ``patterns`` (d, P), torch."""
    import torch

    d = W.shape[0]
    M = torch.eye(d, dtype=W.dtype) - W
    S = M.T @ M
    known = torch.zeros(side, side, dtype=torch.bool)
    known[: side // 2] = True
    known = known.reshape(-1)
    hid, kn = torch.nonzero(~known, as_tuple=True)[0], torch.nonzero(known, as_tuple=True)[0]
    out = []
    for j in range(patterns.shape[1]):
        m = patterns[:, j]
        x = torch.zeros_like(m)
        x[kn] = m[kn]
        x[hid] = torch.linalg.solve(S[hid][:, hid], -S[hid][:, kn] @ m[kn])
        out.append(x.numpy())
    return np.stack(out)


def write_inline(name, svg):
    """Replace the content between the ``name`` markers in slides/index.html with ``svg``."""
    index = SLIDES / "index.html"
    html = index.read_text(encoding="utf-8")
    pat = re.compile(rf"(<!-- {re.escape(name)}:begin -->\n)(.*?)(\s*<!-- {re.escape(name)}:end -->)", re.S)
    if not pat.search(html):
        raise ValueError(f"markers <!-- {name}:begin/end --> not found in {index}")
    index.write_text(pat.sub(lambda m: m.group(1) + svg + m.group(3), html), encoding="utf-8")
    print(f"wrote {len(svg) / 1e3:.0f} kB of SVG into {index.name} ({name})")
