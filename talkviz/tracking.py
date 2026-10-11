"""Sequential free-energy tracking (paper section sec:sequential-free-energy-tracking), recorded
for animation.

Same recipe as the paper notebook
``paper_figure/notebook/07_sequential_free_energy_tracking_v2_plus_selection_drive_workbench.py``:
memories acquired one at a time by the teacher, student plasticity off for the first
``plasticity_off_steps`` of each stage. Memories are either the paper's orthogonal patterns with
disjoint supports (``memories="orthogonal"``) or MNIST digits (``memories="mnist"``, see
``talkviz.mnist``). On top of the paper's scalar traces, every record keeps the full teacher and
student states, and either the student weights or N_S in memory coordinates
(``store_weights=False``, for large networks), so the settled free energy can be evaluated
anywhere on the teacher memory sphere at any frame.

Memory coordinates: Q is the orthonormal basis of the memories from a QR decomposition in
acquisition order (columns 1..k span the first k memories; Q = memories when they are
orthonormal). Memory i has coordinates ``mem[:, i]`` in that frame.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, asdict, field
from pathlib import Path

import numpy as np
import torch

from .paths import CACHE


@dataclass(frozen=True)
class TrackingConfig:
    n_memories: int = 8
    neurons_per_direction: int = 3
    memory_seed: int = 4
    teacher_speedup: float = 2.0
    pi_T: float = 1.0          # multiplied by teacher_speedup
    pi_S: float = 0.5
    pi_TS: float = 1.0
    kappa: float = 0.5         # multiplied by teacher_speedup; code pi_ST = -kappa
    tau_T: float = 1.0
    tau_S: float = 0.1
    eta: float = 0.04
    teacher_noise: float = 0.05
    teacher_norm: float = 1.0
    n_steps: int = 300_000
    dt: float = 0.05
    dynamics_seed: int = 12
    plasticity_off_steps: int = 10_000
    record_every: int = 100
    dense_every: int = 0       # >0: record every `dense_every` steps in the first
    dense_window: int = 0      # `dense_window` steps of each stage (the climb to F_max)
    retrain_lr: float = 0.15
    retrain_tol: float = 1e-8
    retrain_max_epochs: int = 5000
    memories: str = "orthogonal"   # or "mnist"
    mnist_side: int = 14
    mnist_candidates: int = 300
    mnist_typicality: float = 0.5
    store_weights: bool = True     # False: store N_S in memory coordinates instead of W_S

    @property
    def event_steps(self) -> tuple[int, ...]:
        n, m = self.n_steps, self.n_memories
        return tuple(int(round((n * i / m) / 100)) * 100 for i in range(1, m))

    def key(self) -> str:
        # fields added after the first runs only enter the key when changed, so old caches stay valid
        d = asdict(self)
        for name in ("memories", "mnist_side", "mnist_candidates", "mnist_typicality",
                     "store_weights"):
            if d[name] == TrackingConfig.__dataclass_fields__[name].default:
                d.pop(name)
        return json.dumps(d, sort_keys=True)


def memory_basis(cfg: TrackingConfig) -> np.ndarray:
    """Orthonormal memories with disjoint supports, (d, P), same as the paper."""
    P, k = cfg.n_memories, cfg.neurons_per_direction
    d = P * k
    basis = torch.zeros(d, P, dtype=torch.float64)
    for i in range(P):
        basis[i * k:(i + 1) * k, i] = 1.0 / np.sqrt(k)
    gen = torch.Generator().manual_seed(cfg.memory_seed)
    return basis[torch.randperm(d, generator=gen)].numpy()


def memory_patterns(cfg: TrackingConfig) -> np.ndarray:
    """Unit-norm memories (d, P) in acquisition order."""
    if cfg.memories == "orthogonal":
        return memory_basis(cfg)
    if cfg.memories == "mnist":
        from .mnist import select_digits
        M, _ = select_digits(cfg.n_memories, cfg.mnist_side, cfg.mnist_candidates,
                             cfg.mnist_typicality)
        return M
    raise ValueError(f"unknown memories {cfg.memories!r}")


def memory_frame(basis: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Q (d,P) orthonormal, nested in acquisition order, and memory coordinates mem (P,P), with
    basis = Q @ mem and mem upper triangular with a positive diagonal."""
    Q, Rm = np.linalg.qr(basis)
    s = np.sign(np.diag(Rm))
    return Q * s, Rm * s[:, None]


def simulate(cfg: TrackingConfig = TrackingConfig(), use_cache: bool = True) -> dict:
    """Run the protocol and record x_T, x_S and W_S every ``record_every`` steps.

    Returns arrays: step (n,), x_T (n,d), x_S (n,d), W_S (n,d,d) float32, active (n,) number of
    memories the teacher holds, plasticity (n,) bool, plus ``basis`` (d,P) and ``events``.
    """
    path = CACHE / "tracking" / f"run_{hashlib.sha1(cfg.key().encode()).hexdigest()[:10]}.npz"
    if use_cache and path.exists():
        data = np.load(path, allow_pickle=False)
        if str(data["key"]) == cfg.key():
            return {k: data[k] for k in data.files if k != "key"}

    from prioritized_memory_transfer import ModelConfig
    from prioritized_memory_transfer.memory import build_memory
    from prioritized_memory_transfer.model import TwoPopModel

    torch.set_grad_enabled(False)
    basis = memory_patterns(cfg)
    patterns = torch.from_numpy(np.ascontiguousarray(basis))
    Q, _ = memory_frame(basis)
    d, P = basis.shape
    pi_T = cfg.pi_T * cfg.teacher_speedup
    pi_ST = -cfg.kappa * cfg.teacher_speedup

    def retrain_teacher(W, count):
        # online delta rule on the first `count` memories (linear activation), as in the paper
        for _ in range(cfg.retrain_max_epochs):
            for i in range(count):
                m = patterns[:, i]
                W = W + cfg.retrain_lr * torch.outer(m - W @ m, m)
                W.fill_diagonal_(0)
            if float((patterns[:, :count] - W @ patterns[:, :count]).norm(dim=0).max()) <= cfg.retrain_tol:
                return W
        raise RuntimeError("teacher retraining did not reach tolerance")

    mcfg = ModelConfig(
        d=d, P=P, pi_T=pi_T, pi_S=cfg.pi_S, pi_TS=cfg.pi_TS, pi_ST=pi_ST, tau_T=cfg.tau_T,
        tau_S=cfg.tau_S, eta=cfg.eta, sigma_xi=cfg.teacher_noise, r0=cfg.teacher_norm,
        pattern_kind="nonneg", activation=None, seed=cfg.dynamics_seed, device="cpu",
        dtype=torch.float64,
    )
    model = TwoPopModel(build_memory(patterns[:, :1], act=None).W.clone(), mcfg,
                        pi_ST=pi_ST, patterns=patterns)
    gen = torch.Generator().manual_seed(cfg.dynamics_seed + 12345)
    x0 = patterns[:, :1] @ torch.randn(1, generator=gen, dtype=torch.float64)
    model.x_T = x0 * (model.r0 / x0.norm().clamp_min(1e-12))
    model.x_S = torch.zeros(d, dtype=torch.float64)

    events = cfg.event_steps
    off_starts = (0, *events)
    stage_start = 0
    event_count = dict(zip(events, range(2, P + 1)))
    active = 1
    weights_key = "W_S" if cfg.store_weights else "N_Q"
    rec = {k: [] for k in ("step", "x_T", "x_S", weights_key, "active", "plasticity")}

    def record(step, plastic):
        rec["step"].append(step)
        rec["x_T"].append(model.x_T.numpy().copy())
        rec["x_S"].append(model.x_S.numpy().copy())
        W = model.W_S.numpy()
        if cfg.store_weights:
            rec["W_S"].append(W.astype(np.float32))
        else:
            rec["N_Q"].append(Q.T @ novelty_operator(W, cfg.pi_TS, cfg.pi_S) @ Q)
        rec["active"].append(active)
        rec["plasticity"].append(plastic)

    t0 = time.time()
    record(0, False)
    for step in range(1, cfg.n_steps + 1):
        plastic = not any(s < step <= s + cfg.plasticity_off_steps for s in off_starts)
        model._S.eta = cfg.eta if plastic else 0.0
        model.macro.step(cfg.dt, gen, mode="full", substeps=1)
        if step in event_count:
            record(step, plastic)                     # just before acquisition
            T = model.macro.populations["T"]
            if cfg.memories == "orthogonal":
                T.W = retrain_teacher(T.W, event_count[step])
            else:   # correlated memories: closed-form zero-diagonal fit of the first k
                T.W = build_memory(patterns[:, :event_count[step]], act=None).W.clone()
            active = event_count[step]
            stage_start = step
            record(step, False)                       # just after
        elif step % cfg.record_every == 0 or (
                cfg.dense_every and step - stage_start <= cfg.dense_window
                and step % cfg.dense_every == 0):
            record(step, plastic)
        if step % 50_000 == 0:
            print(f"  {step:,} / {cfg.n_steps:,}  ({time.time() - t0:.0f}s)", flush=True)

    print(f"simulated {cfg.n_steps:,} steps, {len(rec['step'])} records in {time.time() - t0:.0f}s")
    out = {k: np.asarray(v) for k, v in rec.items()}
    out["basis"] = basis
    out["events"] = np.asarray(events)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, key=cfg.key(), **out)
    return out


# ---------- settled student free energy on the teacher memory sphere ----------

def novelty_operator(W_S: np.ndarray, pi_TS: float, pi_S: float) -> np.ndarray:
    """N_S = I - pi_TS H_S^{-1}, H_S = pi_TS I + pi_S M_S^T M_S (paper eq. tracking-novelty-operator)."""
    d = W_S.shape[0]
    M = np.eye(d) - W_S.astype(np.float64)
    H = pi_TS * np.eye(d) + pi_S * M.T @ M
    N = np.eye(d) - pi_TS * np.linalg.inv(H)
    return 0.5 * (N + N.T)


def restricted_novelty(W_S, basis, active, pi_TS, pi_S) -> np.ndarray:
    """N_S in memory coordinates on the active subspace, (active, active)."""
    U = basis[:, :active]
    return U.T @ novelty_operator(W_S, pi_TS, pi_S) @ U


def settled_free_energy(c: np.ndarray, N_restricted: np.ndarray, pi_TS: float) -> np.ndarray:
    """q = pi_TS/2 c^T N c for memory coordinates c (..., k), normalized onto the sphere."""
    c = c / np.linalg.norm(c, axis=-1, keepdims=True)
    return 0.5 * pi_TS * np.einsum("...i,ij,...j->...", c, N_restricted, c)


def fmax_state(N_restricted: np.ndarray, pi_TS: float) -> tuple[np.ndarray, float]:
    """Top eigenvector (memory coordinates) and F_max = pi_TS/2 * lambda_max."""
    vals, vecs = np.linalg.eigh(N_restricted)
    return vecs[:, -1], 0.5 * pi_TS * float(vals[-1])


def analyze(R: dict, cfg: TrackingConfig) -> dict:
    """Per-record quantities for the animation, all in memory coordinates (P dims).

    c       (n,P) teacher state projected on the memory span (frame Q), normalized
    v       (n,P) F_max state on the active sphere, sign aligned with the teacher, 0 on
            coordinates of memories not yet acquired
    F_max   (n,)  largest settled student free energy on the active sphere
    angle   (n,)  degrees between the projected teacher and the nearest F_max state
    angle_full (n,) same with the full teacher state (paper's definition, counts leakage)
    q_mem   (n,P) settled free energy of each memory, pi_TS/2 m_i^T N_S m_i
    N_mem   (n,P,P) N_S in the frame Q, so q(c) = pi_TS/2 c^T N_mem c for any c
    mem     (P,P) memory coordinates in the frame Q (columns, unit norm)
    leak    (n,)  fraction of teacher norm off the memory span
    """
    Q, mem = memory_frame(R["basis"])
    X = R["x_T"]
    n, P = len(X), Q.shape[1]
    C = X @ Q
    xnorm = np.linalg.norm(X, axis=1)
    leak = np.linalg.norm(X - C @ Q.T, axis=1) / xnorm
    c = C / np.linalg.norm(C, axis=1, keepdims=True)
    v = np.zeros((n, P))
    F = np.zeros(n)
    q_mem = np.zeros((n, P))
    N_mem = np.zeros((n, P, P))
    for i in range(n):
        if "N_Q" in R:
            N = R["N_Q"][i]
        else:
            N = Q.T @ novelty_operator(R["W_S"][i], cfg.pi_TS, cfg.pi_S) @ Q
        N_mem[i] = N
        q_mem[i] = 0.5 * cfg.pi_TS * np.einsum("ji,jk,ki->i", mem, N, mem)
        k = int(R["active"][i])
        vk, F[i] = fmax_state(N[:k, :k], cfg.pi_TS)
        v[i, :k] = vk if vk @ c[i, :k] >= 0 else -vk
    angle = np.degrees(np.arccos(np.clip(np.abs((v * c).sum(1)), 0, 1)))
    angle_full = np.degrees(np.arccos(np.clip(np.abs((v * C).sum(1)) / xnorm, 0, 1)))
    return dict(c=c, v=v, F_max=F, angle=angle, angle_full=angle_full, q_mem=q_mem,
                N_mem=N_mem, mem=mem, leak=leak)


def frame_plan(R: dict, plasticity_off: int, climb_window: int = 600, learn_window: int = 3_500,
               strides: tuple[int, int, int, int] = (10, 300, 50, 300),
               hold_on_acquisition: int = 15) -> tuple[list[int], np.ndarray, np.ndarray]:
    """Record indices to animate: slow motion on the climb, faster through holds and wandering.

    ``strides`` = steps between frames during (climb, rest of plasticity off, first
    ``learn_window`` steps of learning, wandering). Returns (frames, stage_of, stage_starts).
    """
    steps = R["step"]
    stage_starts = np.array([0, *R["events"]])
    stage_of = R["active"] - 1        # the record just before an acquisition ends its stage
    rel = steps - stage_starts[stage_of]
    stride = np.select([rel <= climb_window, rel <= plasticity_off,
                        rel <= plasticity_off + learn_window], strides[:3], strides[3])
    frames = []
    for i in np.flatnonzero(rel % stride == 0):
        frames.append(int(i))
        if rel[i] == 0 and i > 0 and steps[i - 1] == steps[i]:     # the "just after" record
            frames.extend([int(i)] * hold_on_acquisition)
    return frames, stage_of, stage_starts
