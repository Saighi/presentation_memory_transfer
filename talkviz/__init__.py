"""Shared style and export helpers for the talk's simulations and visualizations.

Simulation logic lives in the paper repo (``import src``); this package only
makes the renders look the same as the slides and lands them in slides/media/.
"""

from .paths import ROOT, SLIDES, MEDIA, OUTPUTS, media_path
from .style import PALETTE, use_mpl_style, plotly_template, SLIDE_PX
from .export import save_mpl_animation, frames_to_video, gif_to_mp4, save_plotly_html, save_figure

__all__ = [
    "ROOT", "SLIDES", "MEDIA", "OUTPUTS", "media_path",
    "PALETTE", "use_mpl_style", "plotly_template", "SLIDE_PX",
    "save_mpl_animation", "frames_to_video", "gif_to_mp4", "save_plotly_html", "save_figure",
]
