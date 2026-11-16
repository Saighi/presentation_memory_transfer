"""Vector PDF of the poster, text and maths selectable, figures embedded at full resolution.

    python poster/export_pdf.py        # A1 -> outputs/poster_A1.pdf
    python poster/export_pdf.py A0     # A0 -> outputs/poster_A0.pdf (same layout, scaled by 1.414)
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")


def main():
    size = sys.argv[1] if len(sys.argv) > 1 else "A1"
    out = ROOT / "outputs" / f"poster_{size}.pdf"
    url = (ROOT / "poster" / "poster.html").as_uri() + f"?size={size}"
    with tempfile.TemporaryDirectory(prefix="poster_pdf_") as profile:
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", f"--user-data-dir={profile}",
                        "--no-pdf-header-footer", "--virtual-time-budget=8000",
                        f"--print-to-pdf={out}", url], check=True, capture_output=True, timeout=180)
    doc = fitz.open(out)
    page = doc[0].rect
    fonts = sorted({f[3] for f in doc[0].get_fonts()})
    mm = 25.4 / 72
    print(f"{out}: {len(doc)} page(s), {page.width * mm:.0f} x {page.height * mm:.0f} mm, "
          f"{out.stat().st_size / 1e6:.1f} MB")
    print("embedded fonts:", ", ".join(fonts))


if __name__ == "__main__":
    sys.exit(main())
