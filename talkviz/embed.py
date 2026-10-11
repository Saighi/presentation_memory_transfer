"""2D landscapes by SMACOF on a few hundred landmarks, everything else placed on the fixed map.

SMACOF costs O(n^2) per iteration, so it only sees the landmarks. Any other point (every
trajectory record, every F_max state) is placed by minimizing its own stress against its
k nearest landmarks with the landmarks held fixed (local Guttman updates, vectorized). The
map is computed once, so frames never jitter.
"""

from __future__ import annotations

import time

import numpy as np
from sklearn.manifold import smacof


def pairwise(A: np.ndarray, B: np.ndarray) -> np.ndarray:
    """Euclidean distances (len(A), len(B))."""
    d2 = (A * A).sum(1)[:, None] + (B * B).sum(1)[None] - 2 * A @ B.T
    return np.sqrt(np.clip(d2, 0, None))


def landmark_layout(points: np.ndarray, max_iter: int = 300, n_init: int = 1,
                    seed: int = 0) -> tuple[np.ndarray, float]:
    """Metric SMACOF of ``points`` into 2D. Returns (Y, normalized stress-1)."""
    t0 = time.time()
    Y, stress = smacof(pairwise(points, points), n_components=2, metric=True, n_init=n_init,
                       max_iter=max_iter, random_state=seed, normalized_stress=True)
    print(f"SMACOF: {len(points)} landmarks, stress-1 {stress:.3f}, {time.time() - t0:.1f}s")
    return Y, stress


def place(points: np.ndarray, landmarks: np.ndarray, Y: np.ndarray, k: int = 12,
          n_iter: int = 40, return_stress: bool = False):
    """Place new high-D ``points`` on the fixed 2D map ``Y`` of ``landmarks``.

    Each point independently minimizes its weighted stress to its k nearest landmarks
    (weights 1/delta^2), by the SMACOF (Guttman) update with the landmarks held fixed.
    ``return_stress`` also returns each point's leftover normalized stress,
    sqrt(sum w (|y - Y_j| - delta_j)^2 / sum w delta_j^2).
    """
    D = pairwise(points, landmarks)
    nn = np.argpartition(D, k, axis=1)[:, :k]               # (m, k), unordered
    delta = np.take_along_axis(D, nn, axis=1)               # target distances
    Yn = Y[nn]                                              # (m, k, 2)
    w = 1.0 / (delta + 1e-3) ** 2                           # nearer landmarks count more
    w /= w.sum(1, keepdims=True)
    y = (w[..., None] * Yn).sum(1)                          # start: weighted centroid
    for _ in range(n_iter):
        diff = y[:, None] - Yn
        dist = np.linalg.norm(diff, axis=-1, keepdims=True) + 1e-9
        y = (w[..., None] * (Yn + delta[..., None] * diff / dist)).sum(1)
    if not return_stress:
        return y
    resid = np.linalg.norm(y[:, None] - Yn, axis=-1) - delta
    stress = np.sqrt((w * resid ** 2).sum(1) / (w * delta ** 2).sum(1).clip(1e-12))
    return y, stress


def farthest_points(points: np.ndarray, n: int, seed: int = 0) -> np.ndarray:
    """Indices of ``n`` points covering ``points`` evenly (greedy farthest-point sampling)."""
    rng = np.random.default_rng(seed)
    idx = [int(rng.integers(len(points)))]
    d = np.linalg.norm(points - points[idx[0]], axis=1)
    for _ in range(n - 1):
        idx.append(int(d.argmax()))
        d = np.minimum(d, np.linalg.norm(points - points[idx[-1]], axis=1))
    return np.asarray(idx)
