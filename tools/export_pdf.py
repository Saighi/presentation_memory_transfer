"""PDF of the deck: one page per slide, as the audience sees it after the slide's last click.

    python tools/export_pdf.py              # -> outputs/memory_transfer_talk.pdf

Headless Chrome screenshots every slide at 1920x1080 (index.html?export#/h/v/999: all fragments
shown, the live players run to their final state under virtual time, on-screen controls hidden),
then the pages are joined into one PDF. Pages are images: what is projected, not selectable text
(for that, reveal's ?print-pdf, which shows the players' empty first state).
"""

import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "slides" / "index.html"
OUT = ROOT / "outputs" / "memory_transfer_talk.pdf"
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
VIRTUAL_MS = 20_000          # enough for the F_max player to play its last stage
WORKERS = 4


class _Slides(HTMLParser):
    """(h, v) of every slide: top-level <section>s of div.slides, and the sections nested in them."""

    def __init__(self):
        super().__init__()
        self.depth = 0            # <section> nesting depth
        self.in_slides = False
        self.div_depth = 0
        self.slides = []
        self.h = -1
        self.v = 0

    def handle_starttag(self, tag, attrs):
        if tag == "div":
            if self.in_slides:
                self.div_depth += 1
            elif "slides" in (dict(attrs).get("class") or "").split():
                self.in_slides, self.div_depth = True, 1
        elif tag == "section" and self.in_slides:
            self.depth += 1
            if self.depth == 1:
                self.h += 1
                self.v = 0
                self.slides.append((self.h, None))      # placeholder: replaced if it is a stack
            elif self.depth == 2:
                if self.slides and self.slides[-1] == (self.h, None):
                    self.slides.pop()
                self.slides.append((self.h, self.v))
                self.v += 1

    def handle_endtag(self, tag):
        if tag == "section" and self.in_slides:
            self.depth -= 1
        elif tag == "div" and self.in_slides:
            self.div_depth -= 1
            if self.div_depth == 0:
                self.in_slides = False


def slide_list():
    p = _Slides()
    p.feed(INDEX.read_text(encoding="utf-8"))
    return [(h, 0 if v is None else v) for h, v in p.slides]


def shoot(args):
    (h, v), png, profile = args
    url = INDEX.as_uri() + f"?export#/{h}/{v}/999"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    f"--user-data-dir={profile}", "--window-size=1920,1080",
                    f"--virtual-time-budget={VIRTUAL_MS}", f"--screenshot={png}", url],
                   check=True, capture_output=True, timeout=300)
    return png


def main():
    slides = slide_list()
    print(f"{len(slides)} slides")
    tmp = Path(tempfile.mkdtemp(prefix="talk_pdf_"))
    try:
        jobs = [(hv, tmp / f"{i:03d}.png", tmp / f"profile{i:03d}") for i, hv in enumerate(slides)]
        with ThreadPoolExecutor(WORKERS) as ex:
            for i, png in enumerate(ex.map(shoot, jobs)):
                print(f"  {i + 1}/{len(slides)}", end="\r")
        pages = [Image.open(j[1]).convert("RGB") for j in jobs]
        OUT.parent.mkdir(parents=True, exist_ok=True)
        pages[0].save(OUT, save_all=True, append_images=pages[1:], resolution=144, quality=92)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{len(pages)} pages -> {OUT}  ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    sys.exit(main())
