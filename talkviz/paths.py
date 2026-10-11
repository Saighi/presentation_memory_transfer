"""Folder layout. Finished renders go to slides/media/<kind>/, drafts to outputs/."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLIDES = ROOT / "slides"
MEDIA = SLIDES / "media"
OUTPUTS = ROOT / "outputs"
CACHE = OUTPUTS / "cache"

# Paper repo: the simulation engine is src/prioritized_memory_transfer there.
PAPER_REPO = ROOT.parent / "Prioritized-Memory-Transfer"
if str(PAPER_REPO / "src") not in sys.path:
    sys.path.insert(0, str(PAPER_REPO / "src"))

KINDS = ("animations", "figures", "schematics", "interactive")


def media_path(kind: str, name: str, draft: bool = False) -> Path:
    """Path for a render. ``draft=True`` writes to outputs/<kind>/ instead of the deck."""
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {KINDS}, got {kind!r}")
    base = OUTPUTS if draft else MEDIA
    path = base / kind / name
    path.parent.mkdir(parents=True, exist_ok=True)
    return path
