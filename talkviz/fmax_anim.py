"""Animation of the teacher tracking the F_max state on a SMACOF map (talk style).

Ported from notebook 01 (which keeps its own inline copy). Layout at 1920x1080:

- map (main display): memory dots coloured by their settled student free energy (a new memory
  pulses), the F_max state (green ring) with a dashed link from the teacher, the teacher with
  its path in the current stage;
- under the map: colour scale and legend;
- right column: badge ("adding a memory" / "student plasticity OFF" / "student learning") and
  the exact F_max and angle traces;
- optional left inset: ``inset`` object with ``build(fig, rect, anim) -> dict of artists`` and
  ``draw(artists, anim, i, frame_pos)``; the map shifts right to make room.

Sizes are for a projector (read from the back of the room); override any entry of ``STYLE``
through ``FmaxAnimation(..., style={...})``.
"""

from __future__ import annotations

import time

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.colors import LinearSegmentedColormap, Normalize, to_rgb
from matplotlib.lines import Line2D
from matplotlib.animation import FFMpegWriter

from . import tracking as tr
from .paths import media_path
from .richtext import rich_legend, rich_title
from .style import PALETTE as P_, use_mpl_style

def surprise_cmap(stored_color="#E3E6EA"):
    """Memory free-energy colours: stored (low) -> new (dark red)."""
    return LinearSegmentedColormap.from_list(
        "surprise", [stored_color, "#F2B36B", P_["student"], "#7A1F0E"])


Q_CMAP = surprise_cmap()

STYLE = dict(
    trail_steps=1_500,        # fading teacher trail, drawn through every record
    off_color="#E4B94F",
    learn_color="#BFE3CB",
    add_color="#7A1F0E",      # same dark red as a new memory's dot
    fade_out=0.1,             # F_max ring and link hidden below this fraction of the peak
    mem_size=650,
    stored_color="#E3E6EA",   # memory dot colour once stored (low end of the scale)
    pulse=1.4,                # extra size of a just-acquired memory
    pulse_frames=12,          # decay time of the pulse, frames
    teacher_size=900,
    ring_size=3000,
    trail_width=6,
    link_width=3.5,
    mem_label_size=26,
    mem_label_offset=58,      # points, away from the map centre
    phase_size=36,
    tick_size=22,
    axis_label_size=26,
    math_size=38,             # F_max in titles and legend
    legend_size=28,           # legend words
    legend_math_size=34,      # F_max in the legend
    cbar_label_size=24,       # "memory's free energy" above the colour scale
    note_size=16,
    map_pad=0.13,             # room for the memory labels
    inset_width=0.14,         # figure fraction taken by the left inset, if any
    inset_gap=0.03,           # space between the inset and the map
    cbar_width=0.18,          # colour scale under the map, figure fraction
    legend_gap=0.035,         # space between the colour scale and the legend
)


class FmaxAnimation:
    def __init__(self, R, A, Y_x, Y_v, Y_mem, plasticity_off, *, labels, inset=None,
                 mem_index=None,
                 climb_window=600, learn_window=3_500, strides=(10, 300, 50, 300),
                 hold_frames=45, fps=30, style=None, show_angle=True,
                 note="2D map of the teacher memory sphere (SMACOF): distances approximate"):
        self.R, self.A = R, A
        self.Y_x, self.Y_v, self.Y_mem = Y_x, Y_v, Y_mem
        self.P = A["q_mem"].shape[1]
        # memory shown by each map point: default 2P points, +memories then -memories
        self.mem_index = (np.r_[np.arange(self.P), np.arange(self.P)] if mem_index is None
                          else np.asarray(mem_index))
        self.labels = labels                     # one string per map point
        self.inset = inset
        self.show_angle = show_angle             # False: F_max trace alone in the right column
        self.plasticity_off = plasticity_off
        self.note = note
        self.fps = fps
        self.s = {**STYLE, **(style or {})}
        self.steps = R["step"]
        self.has_v = ~np.isnan(Y_v[:, 0])
        self.F_peak = A["F_max"].max()
        self.q_norm = Normalize(0, self.F_peak)
        self.q_cmap = surprise_cmap(self.s["stored_color"])

        frames, self.stage_of, self.stage_starts = tr.frame_plan(
            R, plasticity_off, climb_window=climb_window, learn_window=learn_window,
            strides=strides, hold_on_acquisition=hold_frames)
        self.frames = np.asarray(frames)
        first = {}
        self.since_acq = np.array([p - first.setdefault(self.stage_of[i], p)
                                   for p, i in enumerate(self.frames)])
        self.in_pause = (self.stage_of[self.frames] > 0) & (self.since_acq <= hold_frames)

        centre = Y_x.mean(0)
        d = Y_mem - centre
        self.out_dir = d / np.linalg.norm(d, axis=1, keepdims=True)
        print(f"{len(self.frames)} frames, {len(self.frames) / fps:.0f} s at {fps} fps")

    # ---------- figure ----------
    def _rc(self):
        s = self.s
        use_mpl_style()
        plt.rcParams.update({"font.weight": "bold", "axes.labelweight": "bold",
                             "xtick.labelsize": s["tick_size"], "ytick.labelsize": s["tick_size"],
                             "axes.labelsize": s["axis_label_size"], "axes.linewidth": 2.0,
                             "xtick.major.width": 2.0, "ytick.major.width": 2.0,
                             "xtick.major.size": 7, "ytick.major.size": 7,
                             # math in the same bold sans as the text (cm is thin from far)
                             "mathtext.fontset": "custom", "mathtext.rm": "sans:bold",
                             "mathtext.it": "sans:italic:bold", "mathtext.bf": "sans:bold"})

    def build_figure(self):
        s, P, Y_x, Y_mem = self.s, self.P, self.Y_x, self.Y_mem
        self._rc()
        fig = plt.figure(figsize=(19.2, 10.8))
        art = {}

        x0 = 0.01
        if self.inset is not None:
            art["inset"] = self.inset.build(fig, [0.0, 0.17, s["inset_width"], 0.81], self)
            x0 = s["inset_width"] + s["inset_gap"]

        # ---- main display: the map ----
        ax = fig.add_axes([x0, 0.17, 0.58 - x0, 0.81])
        allY = np.vstack([np.percentile(Y_x, [1, 99], axis=0), Y_mem])
        lo, hi = allY.min(0), allY.max(0)
        pad = s["map_pad"] * (hi - lo).max()
        ax.set_xlim(lo[0] - pad, hi[0] + pad)
        ax.set_ylim(lo[1] - pad, hi[1] + pad)
        ax.set_aspect("equal")
        ax.axis("off")
        art["past"], = ax.plot([], [], color=P_["teacher"], alpha=0.2, lw=2, zorder=1)
        art["trail"] = LineCollection([], linewidths=s["trail_width"], capstyle="round", zorder=2)
        ax.add_collection(art["trail"])
        art["link"], = ax.plot([], [], color=P_["transfer"], lw=s["link_width"], ls=(0, (3, 2)),
                               zorder=2)
        art["mem"] = ax.scatter(*Y_mem.T, s=s["mem_size"], c=np.zeros(len(Y_mem)), cmap=self.q_cmap,
                                norm=self.q_norm, edgecolor=P_["ink"], linewidth=2.2, zorder=3)
        art["labels"] = []
        for lab, (x, y), (ux, uy) in zip(self.labels, Y_mem, self.out_dir):
            art["labels"].append(ax.annotate(
                lab, (x, y), xytext=(s["mem_label_offset"] * ux, s["mem_label_offset"] * uy),
                textcoords="offset points", ha="center", va="center",
                fontsize=s["mem_label_size"], weight="bold", color=P_["ink"], zorder=3))
        art["vmark"] = ax.scatter([], [], s=s["ring_size"], facecolor="none",
                                  edgecolor=P_["transfer"], linewidth=6, zorder=4)
        art["x"] = ax.scatter([], [], s=s["teacher_size"], color=P_["teacher"], edgecolor="white",
                              linewidth=3.5, zorder=5)

        # ---- under the map: colour scale + legend ----
        cax = fig.add_axes([x0 + 0.02, 0.08, s["cbar_width"], 0.03])
        cb = fig.colorbar(plt.cm.ScalarMappable(self.q_norm, self.q_cmap), cax=cax,
                          orientation="horizontal")
        cb.outline.set_linewidth(1.5)
        cb.set_ticks([0, self.F_peak])
        cb.set_ticklabels(["stored", "new"])
        cb.ax.tick_params(labelsize=s["tick_size"])
        cb.set_label("memory's free energy", fontsize=s["cbar_label_size"], weight="bold",
                     labelpad=6)
        cb.ax.xaxis.set_label_position("top")
        # legend right after the colour scale (its label is wider than the bar)
        legend_x = x0 + 0.02 + s["cbar_width"] + s["legend_gap"]
        rich_legend(fig, (legend_x, 0.095), [
            (dict(marker="o", ms=26, color=P_["teacher"], mec="white", mew=3), ["teacher"]),
            (dict(marker="o", ms=34, mfc="none", mec=P_["transfer"], mew=5),
             [r"$F_{\mathrm{max}}$", "state"]),
        ], s["legend_size"], s["legend_math_size"], P_["ink"])
        fig.text(0.01, 0.012, self.note, fontsize=s["note_size"], weight="normal",
                 color=P_["ink_soft"])

        # ---- right column: badge + exact traces ----
        art["phase"] = fig.text(0.815, 0.905, "", fontsize=s["phase_size"], weight="bold",
                                ha="center", va="center", color=P_["ink"],
                                bbox=dict(boxstyle="round,pad=0.45", lw=0))
        if self.show_angle:
            axF = fig.add_axes([0.64, 0.50, 0.33, 0.27])
            axA = fig.add_axes([0.64, 0.13, 0.33, 0.27], sharex=axF)
            trace_axes = (axF, axA)
        else:
            axF = fig.add_axes([0.64, 0.32, 0.33, 0.27])   # same size, centred in the column
            trace_axes = (axF,)
        for a in trace_axes:
            for st in self.stage_starts:
                a.axvspan(st / 1e3, (st + self.plasticity_off) / 1e3, color=s["off_color"],
                          alpha=0.35, lw=0)
        art["traceF"], = axF.plot([], [], color=P_["student"], lw=3.5)
        rich_title(axF, ["largest student free energy", r"$F_{\mathrm{max}}$"],
                   s["axis_label_size"], s["math_size"], P_["ink"])
        axF.set_ylim(0, self.F_peak * 1.1)
        axF.set_yticks([0, round(self.F_peak, 2)])
        art["curF"] = axF.axvline(0, color=P_["ink"], lw=2.5)
        bottom = axF
        if self.show_angle:
            axF.tick_params(labelbottom=False)
            art["traceA"], = axA.plot([], [], color=P_["teacher"], lw=2)
            rich_title(axA, ["teacher's angle to the", r"$F_{\mathrm{max}}$", "state (°)"],
                       s["axis_label_size"], s["math_size"], P_["ink"])
            axA.set_ylim(0, 92)
            axA.set_yticks([0, 45, 90])
            art["curA"] = axA.axvline(0, color=P_["ink"], lw=2.5)
            bottom = axA
        bottom.set_xlabel("network updates (×10³)")
        bottom.set_xlim(0, self.steps[-1] / 1e3)
        return fig, art

    # ---------- one frame ----------
    def draw(self, art, frame_pos):
        s, P, R, A = self.s, self.P, self.R, self.A
        steps, Y_x, Y_v = self.steps, self.Y_x, self.Y_v
        i = self.frames[frame_pos]
        k = int(R["active"][i])
        stage_start = np.searchsorted(steps, self.stage_starts[self.stage_of[i]])

        # memories: only the acquired ones, coloured by their own free energy; the new one pulses
        q = A["q_mem"][i][self.mem_index]
        alive = self.mem_index < k
        size = np.full(len(self.mem_index), float(s["mem_size"]))
        if k > 1:
            size[self.mem_index == k - 1] *= 1 + s["pulse"] * np.exp(
                -self.since_acq[frame_pos] / s["pulse_frames"])
        art["mem"].set_array(q)
        art["mem"].set_sizes(size)
        art["mem"].set_alpha(alive.astype(float))
        for lab, a in zip(art["labels"], alive):
            lab.set_visible(bool(a))

        # teacher: faint path since this stage began, fading recent trail, dot
        art["past"].set_data(*Y_x[stage_start:i + 1].T)
        recent = Y_x[np.searchsorted(steps, steps[i] - s["trail_steps"]):i + 1]
        if len(recent) > 1:
            art["trail"].set_segments(np.stack([recent[:-1], recent[1:]], axis=1))
            rgba = np.tile([*to_rgb(P_["teacher"]), 1.0], (len(recent) - 1, 1))
            rgba[:, 3] = np.linspace(0.05, 1, len(recent) - 1)
            art["trail"].set_color(rgba)
        else:
            art["trail"].set_segments([])
        art["x"].set_offsets(Y_x[i][None])

        # F_max state and the teacher's link to it, hidden once F_max is learned away
        strength = float(np.clip(A["F_max"][i] / self.F_peak, 0, 1))
        strength = strength if strength > s["fade_out"] else 0.0
        if self.has_v[i]:
            art["vmark"].set_offsets(Y_v[i][None])
            art["vmark"].set_alpha(strength)
            art["link"].set_data(*np.stack([Y_x[i], Y_v[i]]).T)
            art["link"].set_alpha(strength)

        # badge: acquisition pause, then plasticity phase
        plastic = bool(R["plasticity"][i])
        if self.in_pause[frame_pos]:
            art["phase"].set_text("adding a memory")
            art["phase"].set_color("white")
            art["phase"].get_bbox_patch().set_facecolor(s["add_color"])
        else:
            art["phase"].set_text("student learning" if plastic else "student plasticity OFF")
            art["phase"].set_color(P_["ink"])
            art["phase"].get_bbox_patch().set_facecolor(
                s["learn_color"] if plastic else s["off_color"])

        art["traceF"].set_data(steps[:i + 1] / 1e3, A["F_max"][:i + 1])
        art["curF"].set_xdata([steps[i] / 1e3] * 2)
        if self.show_angle:
            art["traceA"].set_data(steps[:i + 1] / 1e3, A["angle"][:i + 1])
            art["curA"].set_xdata([steps[i] / 1e3] * 2)

        if self.inset is not None:
            self.inset.draw(art["inset"], self, i, frame_pos)

    # ---------- outputs ----------
    def frame_in_stage(self, stage, m):
        """Frame position of moment ``m`` in ``stage``: an int offset, or a float fraction."""
        in_stage = np.flatnonzero(self.stage_of[self.frames] == stage)
        return in_stage[int(m * (len(in_stage) - 1))] if isinstance(m, float) else in_stage[m]

    def preview(self, stage, moments, name):
        """Render key moments of one stage to drafts and show them as an inline grid."""
        fig, art = self.build_figure()
        paths = []
        for n, m in enumerate(moments):
            self.draw(art, self.frame_in_stage(stage, m))
            paths.append(media_path("figures", f"{name}_s{stage}_{n}.png", draft=True))
            fig.savefig(paths[-1], dpi=50)
        plt.close(fig)
        rows = (len(paths) + 1) // 2
        grid, axes = plt.subplots(rows, 2, figsize=(16, 4.5 * rows))
        for a in axes.flat:
            a.axis("off")
        for a, p in zip(axes.flat, paths):
            a.imshow(plt.imread(p))
        grid.subplots_adjust(0, 0, 1, 1, 0.01, 0.01)
        out = media_path("figures", f"{name}_s{stage}_grid.png", draft=True)
        grid.savefig(out, dpi=60)
        plt.show()
        return out

    def render(self, name, draft=True, frame_range=None):
        """Write the video: draft = half resolution into outputs/, else full HD into the deck."""
        sel = range(len(self.frames))[frame_range] if frame_range else range(len(self.frames))
        path = media_path("animations", name, draft=draft)
        fig, art = self.build_figure()
        writer = FFMpegWriter(fps=self.fps, codec="libx264",
                              extra_args=["-pix_fmt", "yuv420p", "-crf", "20", "-preset", "fast"])
        t0 = time.time()
        with writer.saving(fig, str(path), dpi=50 if draft else 100):
            for p in sel:
                self.draw(art, p)
                writer.grab_frame()
        plt.close(fig)
        print(f"{len(sel)} frames -> {path} in {time.time() - t0:.0f}s")
        return path
