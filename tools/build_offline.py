"""Zip the deck into a self-contained copy that runs offline on any computer.

    python tools/build_offline.py      # -> outputs/memory_transfer_talk_offline.zip

Unzip anywhere and double-click index.html: no server, no internet. Everything the
deck loads is in slides/ (vendor JS and fonts, data.js files for the players).
Run tools/fetch_vendor.py first if slides/vendor/ is missing.
"""

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLIDES = ROOT / "slides"
OUT = ROOT / "outputs" / "memory_transfer_talk_offline.zip"
TOP = "memory_transfer_talk"          # folder name inside the zip

SKIP_NAMES = {".gitkeep", "layouts.html"}
SKIP_SUFFIXES = {".map", ".mjs"}
# unused by the deck; reveal's theme fonts also push unzipped paths past Windows' 260-char limit
SKIP_DIRS = {"vendor/reveal.js/dist/theme"}


def skipped(path: Path) -> bool:
    rel = path.relative_to(SLIDES).as_posix()
    return (path.name in SKIP_NAMES or path.suffix in SKIP_SUFFIXES
            or path.name.endswith(".esm.js") or any(rel.startswith(d + "/") for d in SKIP_DIRS))

README = """Memory transfer talk, offline copy

Open index.html in Chrome, Edge or Firefox (double-click it). No internet needed.

  arrows / space   next, previous
  F                fullscreen
  Esc / O          slide overview
  S                speaker notes window (may not work from a double-clicked file, see below)

Keep the folder together: index.html loads css/, js/, media/ and vendor/ next to it.

Speaker notes: if S does nothing useful and Python is installed, run
    python -m http.server
inside this folder and open http://localhost:8000 instead.
"""


def main() -> None:
    for need in ("vendor/reveal.js", "vendor/katex", "vendor/inter"):
        if not (SLIDES / need).is_dir():
            raise SystemExit(f"slides/{need} missing: run python tools/fetch_vendor.py")
    OUT.parent.mkdir(exist_ok=True)
    n = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(SLIDES.rglob("*")):
            if not path.is_file() or skipped(path):
                continue
            zf.write(path, f"{TOP}/{path.relative_to(SLIDES).as_posix()}")
            n += 1
        zf.writestr(f"{TOP}/README.txt", README)
    print(f"{n} files -> {OUT}  ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
