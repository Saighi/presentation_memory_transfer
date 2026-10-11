"""MNIST digits as teacher memories, chosen so each new digit stays mostly novel.

Digits are raw pixel intensities, average-pooled to ``side`` x ``side`` and normalized to unit
length, as in the paper's MNIST figure (no centring). For classes 0, 1, 2, ... in order, the
example kept is, among the first ``n_candidates`` of its class, the one maximizing

    novelty + typicality_weight * typicality

novelty = norm of its component orthogonal to the digits already chosen (= cosine between the
digit and the F_max state it creates once the old digits are learned), typicality = cosine to
the class mean image (keeps it recognizable).
"""

from __future__ import annotations

import numpy as np

from .paths import PAPER_REPO


def load_mnist(side: int = 14) -> tuple[np.ndarray, np.ndarray]:
    """Training images as unit-norm rows (n, side*side) and labels, from the paper repo's data/."""
    import torch
    import torch.nn.functional as F
    from torchvision.datasets import MNIST

    ds = MNIST(root=str(PAPER_REPO / "data"), train=True, download=False)
    x = (ds.data.double() / 255.0).unsqueeze(1)
    if side != 28:
        x = F.avg_pool2d(x, 28 // side)
    X = x.reshape(len(x), -1).numpy()
    return X / np.linalg.norm(X, axis=1, keepdims=True), ds.targets.numpy()


def select_digits(n: int = 8, side: int = 14, n_candidates: int = 300,
                  typicality_weight: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """Unit-norm digit memories (side*side, n) for classes 0..n-1, and per-digit novelty."""
    X, y = load_mnist(side)
    chosen = []
    for cls in range(n):
        cand = X[np.flatnonzero(y == cls)[:n_candidates]]
        proto = X[y == cls].mean(0)
        typicality = cand @ (proto / np.linalg.norm(proto))
        if chosen:
            Q, _ = np.linalg.qr(np.array(chosen).T)
            novelty = np.linalg.norm(cand - (cand @ Q) @ Q.T, axis=1)
        else:
            novelty = np.ones(len(cand))
        chosen.append(cand[np.argmax(novelty + typicality_weight * typicality)])
    M = np.array(chosen).T
    novelty = np.array([1.0] + [
        np.linalg.norm(M[:, k] - M[:, :k] @ np.linalg.lstsq(M[:, :k], M[:, k], rcond=None)[0])
        for k in range(1, n)])
    return M, novelty
