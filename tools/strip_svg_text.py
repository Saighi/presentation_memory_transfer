"""Copy an SVG without its <text> labels and crop the viewBox to what is left.

    python tools/strip_svg_text.py SRC.svg DST.svg [--pad 8] [--sub OLD NEW ...]

Used for small reminder insets (e.g. the transfer network on the classical-PC slide), where
labels would be unreadable. --sub does plain text replacements on the result, e.g. to turn
the red prediction-error arrow into a blue excitatory one for the "classical PC" variant:
    --sub 'stroke="#D4532A"' 'stroke="#2A78C8"' --sub 'url(#tErrArrow)' 'url(#tDrive)'
Cropping uses circles and path coordinates, enough for the talk_transfer drawings
(rings + arcs).
"""
import argparse
import re
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--pad", type=float, default=8.0)
    ap.add_argument("--sub", nargs=2, action="append", default=[], metavar=("OLD", "NEW"))
    a = ap.parse_args()

    s = Path(a.src).read_text(encoding="utf-8")
    s = re.sub(r"<text\b.*?</text>", "", s, flags=re.S)

    body = re.sub(r"<defs\b.*?</defs>", "", s, flags=re.S)     # markers live in their own frame
    xs, ys = [], []
    for cx, cy, r in re.findall(r'<circle[^>]*cx="([-\d.]+)"[^>]*cy="([-\d.]+)"[^>]*r="([-\d.]+)"', body):
        cx, cy, r = float(cx), float(cy), float(r)
        xs += [cx - r, cx + r]; ys += [cy - r, cy + r]
    for d in re.findall(r'<path[^>]*\sd="([^"]+)"', body):
        nums = [float(v) for v in re.findall(r"-?\d+\.?\d*", d)]
        xs += nums[0::2]; ys += nums[1::2]
    x0, x1, y0, y1 = min(xs) - a.pad, max(xs) + a.pad, min(ys) - a.pad, max(ys) + a.pad
    w, h = x1 - x0, y1 - y0
    s = re.sub(r'viewBox="[^"]*"', f'viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}"', s, count=1)
    s = re.sub(r'(<svg[^>]*?)\swidth="[^"]*"', rf'\1 width="{w:.1f}"', s, count=1)
    s = re.sub(r'(<svg[^>]*?)\sheight="[^"]*"', rf'\1 height="{h:.1f}"', s, count=1)
    for old, new in a.sub:
        if old not in s:
            raise SystemExit(f"--sub: {old!r} not found")
        s = s.replace(old, new)
    Path(a.dst).write_text(s, encoding="utf-8")
    print(f"{a.dst}: viewBox {x0:.0f} {y0:.0f} {w:.0f} {h:.0f}")


if __name__ == "__main__":
    main()
