# %% [markdown]
# # 06: original figures for "Reactivation is selective" (Kudrimoti 1999 Fig. 3D, Giri 2019 Fig. 5)
#
# Slide: Intro, "Reactivation is selective". Used instead of the redraws of notebooks 04 / 05.
# Outputs: slides/media/figures/kudrimoti1999_fig3d.png, slides/media/figures/giri2019_fig5.png
#
# Cropped from the PDFs in the paper repo's litterature/04_empirical_accounts/ (PMC copies).
# Giri Fig. 5 is vector: rendered at 600 dpi. Kudrimoti Fig. 3 is a 150 dpi scan inside the PDF,
# so panel D stays grainy whatever the render resolution. Crop boxes in 80-dpi page pixels.

# %% Setup
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    ROOT = Path(__file__).resolve().parents[1]
except NameError:  # interactive window without __file__
    ROOT = Path.cwd().parent if Path.cwd().name == "notebooks" else Path.cwd()
sys.path.insert(0, str(ROOT))

from PIL import Image, ImageChops, ImageDraw

import talkviz as tv

LIT = tv.paths.PAPER_REPO / "litterature" / "04_empirical_accounts"
FIGS = {
    # name: (pdf, page, dpi, crop box at 80 dpi, white-out boxes in output px)
    "kudrimoti1999_fig3d.png": (
        "Kudrimoti_Barnes_McNaughton_1999_Reactivation_hippocampal_cell_assemblies.pdf",
        6, 300, (28, 526, 330, 690), [(0, 0, 70, 24)]),          # half-cut panel letter "D"
    "giri2019_fig5.png": (
        "Giri_et_al_2019_Hippocampal_reactivation_extends_hours_novel_experience.pdf",
        6, 600, (15, 62, 425, 156), []),
}


def render_page(pdf: Path, page: int, dpi: int) -> Image.Image:
    with tempfile.TemporaryDirectory() as tmp:
        stem = Path(tmp) / "p"
        subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-singlefile", "-f", str(page), "-l", str(page),
                        str(pdf), str(stem)], check=True, capture_output=True)
        return Image.open(f"{stem}.png").convert("RGB")


def trim(im: Image.Image, pad: int = 12) -> Image.Image:
    """Crop to the non-white content plus a small margin."""
    diff = ImageChops.difference(im, Image.new("RGB", im.size, "white")).convert("L")
    x0, y0, x1, y1 = diff.point(lambda v: 255 if v > 25 else 0).getbbox()
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


# %% Crop
for name, (pdf, page, dpi, box, blanks) in FIGS.items():
    k = dpi / 80
    im = trim(render_page(LIT / pdf, page, dpi).crop(tuple(int(v * k) for v in box)))
    draw = ImageDraw.Draw(im)
    for b in blanks:
        draw.rectangle(b, fill="white")
    out = tv.paths.media_path("figures", name)
    im.save(out, optimize=True)
    print(f"wrote {out}  {im.size}")
