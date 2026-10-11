"""Flat (Hammer) map of the teacher memory sphere, for the static Results slides.

The sphere is drawn as a Hammer equal-area ellipse (2:1, like a world map). Which way the
sphere is turned before flattening decides where the cut (the back meridian, drawn as the
left and right ends of the ellipse) falls. ``best_rotation`` picks a turn where

* the trajectory never crosses the cut (no jump from one end of the map to the other),
* every stored memory (both signs) sits well inside the ellipse, away from the stretched rim,
* the trajectory is compact vertically (the map is twice as wide as tall).

Random rotations are scored; the choice is deterministic for a given seed.
"""

from __future__ import annotations

import numpy as np

SQ2 = np.sqrt(2.0)


def hammer(v):
    """Unit vectors (..., 3) -> Hammer x in [-2√2, 2√2], y in [-√2, √2], and longitude."""
    lon = np.arctan2(v[..., 1], v[..., 0])
    lat = np.arcsin(np.clip(v[..., 2], -1.0, 1.0))
    den = np.sqrt(1.0 + np.cos(lat) * np.cos(lon / 2.0))
    return 2.0 * SQ2 * np.cos(lat) * np.sin(lon / 2.0) / den, SQ2 * np.sin(lat) / den, lon


def best_rotation(path, memories, *, n=12_000, seed=0, mem_rim=0.55):
    """Rotation matrix R (3x3): map frame = R @ sphere frame.

    ``path``: (T, 3) unit vectors in time order; ``memories``: (P, 3) unit vectors, both signs
    are placed. ``mem_rim``: memories beyond this squared normalised radius of the ellipse are
    penalised.
    """
    from scipy.spatial.transform import Rotation

    mem = np.vstack([memories, -memories])
    best, best_R = np.inf, np.eye(3)
    for R in Rotation.random(n, random_state=seed).as_matrix():
        x, y, lon = hammer(path @ R.T)
        if np.any(np.abs(np.diff(lon)) > np.pi):          # crosses the cut
            continue
        mx, my, _ = hammer(mem @ R.T)
        rim = (mx / (2 * SQ2)) ** 2 + (my / SQ2) ** 2
        score = (4 * np.quantile(np.abs(y), 0.99) + 0.5 * np.quantile(np.abs(x), 0.99)
                 + 20 * np.clip(rim - mem_rim, 0, None).sum())
        if score < best:
            best, best_R = score, R
    if not np.isfinite(best):
        raise RuntimeError("no rotation keeps the path off the cut; raise n")
    return best_R
