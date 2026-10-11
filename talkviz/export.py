"""Write renders in formats the deck plays well.

Animations default to MP4 (H.264, yuv420p): full colour, small, and the
browser can pause or restart them. GIF is kept as an option, but its 256-colour
palette bands smooth colormaps.
"""

import shutil
import subprocess
from pathlib import Path

import matplotlib as mpl

from .paths import media_path

FFMPEG = shutil.which("ffmpeg") or r"C:\FFmpeg\bin\ffmpeg.exe"
mpl.rcParams["animation.ffmpeg_path"] = FFMPEG

# H.264 settings that every browser decodes; even dimensions are required.
_H264 = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "slow",
         "-movflags", "+faststart", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2"]


def save_mpl_animation(anim, name: str, fps: int = 30, draft: bool = False) -> Path:
    """Save a matplotlib FuncAnimation as .mp4 (or .gif if ``name`` ends with .gif)."""
    from matplotlib.animation import FFMpegWriter, PillowWriter

    path = media_path("animations", name, draft)
    if path.suffix == ".gif":
        anim.save(path, writer=PillowWriter(fps=fps))
    else:
        writer = FFMpegWriter(fps=fps, codec="libx264", extra_args=_H264[2:-2])
        anim.save(path.with_suffix(".mp4"), writer=writer)
        path = path.with_suffix(".mp4")
    return path


def frames_to_video(frame_glob: str, name: str, fps: int = 30, draft: bool = False) -> Path:
    """Encode numbered PNG frames (e.g. ``outputs/frames/f_%04d.png``) to an MP4 in the deck."""
    path = media_path("animations", name, draft).with_suffix(".mp4")
    subprocess.run([FFMPEG, "-y", "-framerate", str(fps), "-i", frame_glob, *_H264, str(path)],
                   check=True)
    return path


def gif_to_mp4(gif: str | Path, name: str | None = None, draft: bool = False) -> Path:
    """Convert an existing GIF (e.g. from the paper repo notebooks) to a deck MP4."""
    gif = Path(gif)
    path = media_path("animations", name or gif.stem + ".mp4", draft).with_suffix(".mp4")
    subprocess.run([FFMPEG, "-y", "-i", str(gif), *_H264, str(path)], check=True)
    return path


def save_figure(fig, name: str, kind: str = "figures", draft: bool = False) -> Path:
    """Save a static matplotlib figure. Use .svg for line art, .png for images."""
    path = media_path(kind, name, draft)
    fig.savefig(path, bbox_inches="tight", pad_inches=0.1)
    return path


def save_plotly_html(fig, name: str, draft: bool = False) -> Path:
    """Save an interactive plotly figure for an <iframe> in the deck.

    plotly.js is written once next to it (``include_plotlyjs="directory"``), so
    the slide works offline.
    """
    path = media_path("interactive", name, draft).with_suffix(".html")
    fig.write_html(path, include_plotlyjs="directory", full_html=True,
                   config={"displayModeBar": False, "responsive": True})
    return path
