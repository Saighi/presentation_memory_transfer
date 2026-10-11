"""Left inset for FmaxAnimation: teacher and student activity shown as digit images.

Cortex (student) on top, hippocampus (teacher) below, each the raw activity of its network as a
side x side image in the paper's red/blue colormap centred at zero (red positive, blue negative),
on one fixed scale for the whole run, so a fainter student image means weaker activity. Between
them: a constant replay arrow (teacher -> student) and a prediction-error arrow (student ->
teacher) whose width follows |eps_TS| = |x_S - x_T|. The teacher's frame thickens while a memory
is being added.
"""

from __future__ import annotations

import numpy as np
from matplotlib.colors import TwoSlopeNorm
from matplotlib.patches import FancyArrowPatch

from .style import PALETTE as P_

FIG_ASPECT = 1920 / 1080


class DigitInset:
    def __init__(self, x_T, x_S, side, *, cmap="RdBu_r", scale_pct=99.5, err_width=(3, 18),
                 replay_width=6, frame_width=7, pulse_width=16, label_size=28, img_frac=0.72):
        self.x_T, self.x_S, self.side = x_T, x_S, side
        self.cmap = cmap
        vmax = np.percentile(np.abs(x_T), scale_pct)
        self.norm = TwoSlopeNorm(0.0, -vmax, vmax)
        eps = np.linalg.norm(x_S - x_T, axis=1)
        self.eps_scale = np.clip(eps / np.percentile(eps, 99), 0, 1)
        self.err_width = err_width
        self.replay_width = replay_width
        self.frame_width = frame_width
        self.pulse_width = pulse_width
        self.label_size = label_size
        self.img_frac = img_frac            # image width as a fraction of the inset width

    def build(self, fig, rect, anim):
        x, y, w, h = rect
        iw = w * self.img_frac
        ih = iw * FIG_ASPECT                # square on screen
        ix = x + (w - iw) / 2
        label_h = 0.075
        yS = y + h - label_h - ih           # student image bottom
        yT = y + label_h                    # teacher image bottom
        art = {}
        blank = np.zeros((self.side, self.side))
        for role, iy, name, above in (("student", yS, "cortex (student)", True),
                                      ("teacher", yT, "hippocampus (teacher)", False)):
            ax = fig.add_axes([ix, iy, iw, ih])
            art[f"img_{role}"] = ax.imshow(blank, cmap=self.cmap, norm=self.norm,
                                           interpolation="nearest")
            ax.set_xticks([])
            ax.set_yticks([])
            for sp in ax.spines.values():
                sp.set_visible(True)
                sp.set_edgecolor(P_[role])
                sp.set_linewidth(self.frame_width)
            art[f"frame_{role}"] = list(ax.spines.values())
            words = name.replace(" (", "\n(")
            fig.text(x + w / 2, iy + ih + 0.012 if above else iy - 0.012, words,
                     ha="center", va="bottom" if above else "top", fontsize=self.label_size,
                     weight="bold", color=P_[role], linespacing=1.05)
        gap = 0.02                          # labels sit outside: arrows use the whole gap
        y_lo, y_hi = yT + ih + gap, yS - gap
        art["replay"] = FancyArrowPatch((x + w * 0.3, y_lo), (x + w * 0.3, y_hi),
                                        transform=fig.transFigure, arrowstyle="-|>",
                                        mutation_scale=30, lw=self.replay_width,
                                        color=P_["teacher"])
        art["error"] = FancyArrowPatch((x + w * 0.7, y_hi), (x + w * 0.7, y_lo),
                                       transform=fig.transFigure, arrowstyle="-|>",
                                       mutation_scale=30, lw=self.err_width[0],
                                       color=P_["student"])
        fig.add_artist(art["replay"])
        fig.add_artist(art["error"])
        return art

    def draw(self, art, anim, i, frame_pos):
        s = self.side
        art["img_teacher"].set_data(self.x_T[i].reshape(s, s))
        art["img_student"].set_data(self.x_S[i].reshape(s, s))
        e = self.eps_scale[i]
        art["error"].set_linewidth(self.err_width[0] + (self.err_width[1] - self.err_width[0]) * e)
        art["error"].set_mutation_scale(28 + 30 * e)
        pulse = (np.exp(-anim.since_acq[frame_pos] / anim.s["pulse_frames"])
                 if anim.in_pause[frame_pos] else 0.0)
        lw = self.frame_width + (self.pulse_width - self.frame_width) * pulse
        for sp in art["frame_teacher"]:
            sp.set_linewidth(lw)
