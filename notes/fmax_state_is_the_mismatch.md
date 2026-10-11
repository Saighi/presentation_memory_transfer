# The F_max state is the mismatch, not the new memory

Observed in `notebooks/02_mnist_fmax_tracking.py` (8 MNIST digits acquired one at a time).

When the teacher acquires a new memory while the student already stores the previous ones, the
state the teacher is pulled toward (the F_max state) is

$$
u_{\text{new}} \;\propto\; m_{\text{new}} - \Pi_{\text{known}}\, m_{\text{new}}
$$

- $m_{\text{new}}$: the memory the teacher just acquired (here, the new digit).
- $\Pi_{\text{known}}$: orthogonal projector onto the span of the memories the student has already
  learned (here, the previous digits). $\Pi_{\text{known}} m_{\text{new}}$ is the part of the new
  memory the student can already predict, because it is shared with what it knows.
- $m_{\text{new}} - \Pi_{\text{known}} m_{\text{new}}$: what is left, the part of the new memory the
  student cannot predict. $u_{\text{new}}$ is this residual normalized to unit length (up to sign).

**Meaning.** The F_max state is the direction of the teacher's memory space that the student
reproduces worst. Once the old memories are learned, that is exactly the novel part of the new
memory. So the hippocampus does not replay the new memory as stored: it replays the mismatch
between what has to be learned and what the cortex already knows.

**Why.** On the teacher's memory sphere the settled student free energy is
$q(x) = \tfrac{\pi_{TS}}{2}\, x^\top N_S\, x$, and the F_max state is the top eigenvector of $N_S$
restricted to that sphere. Learned memories have $N_S \approx 0$ on their span, so the only
direction left with large $N_S$ is the component of $m_{\text{new}}$ orthogonal to that span.
This holds when the previous memories are fully learned and the new one not at all, i.e. right
after an acquisition.

**Check (cached simulation, plasticity-off intervals).** The simulated F_max state matches
$u_{\text{new}}$ to $|\cos| = 1.0000$ at every stage. Its angle to the new digit itself:

| stage (new digit) | 2 (1) | 3 (2) | 4 (3) | 5 (4) | 6 (5) | 7 (6) | 8 (7) |
|---|---|---|---|---|---|---|---|
| angle F_max state to $m_{\text{new}}$ | 20° | 31° | 34° | 33° | 36° | 35° | 36° |

With orthogonal memories (notebook 01) $\Pi_{\text{known}} m_{\text{new}} = 0$, so the F_max state
is the memory itself, and the ring sits on the memory dot. With overlapping digits it sits
20–36° away, and the new digit's own free energy is lower than $\mathcal F_{\max}$ (its dot is
orange, not the darkest red), because the student already knows part of it.

**For the talk.** "The hippocampus doesn't replay the new memory as stored; it replays the part
the cortex can't yet predict."
