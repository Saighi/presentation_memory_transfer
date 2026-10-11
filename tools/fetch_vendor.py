"""Download reveal.js and KaTeX into slides/vendor/ so the deck runs offline.

    python tools/fetch_vendor.py

Pulls the pinned npm tarballs from registry.npmjs.org and keeps only the files
the deck loads. Safe to re-run (replaces slides/vendor/<pkg>).
"""

from __future__ import annotations

import io
import shutil
import tarfile
import urllib.request
from pathlib import Path

VENDOR = Path(__file__).resolve().parents[1] / "slides" / "vendor"

PACKAGES = {
    # name: (version, subpaths kept from the tarball's package/ dir)
    "reveal.js": ("5.2.1", ["dist", "plugin/math", "plugin/notes", "LICENSE"]),
    "katex": ("0.16.11", ["dist", "LICENSE"]),
}


def fetch(name: str, version: str, keep: list[str]) -> None:
    url = f"https://registry.npmjs.org/{name}/-/{name}-{version}.tgz"
    print(f"{name} {version}  <-  {url}")
    data = urllib.request.urlopen(url).read()
    dest = VENDOR / name
    if dest.exists():
        shutil.rmtree(dest)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar.getmembers():
            rel = member.name[len("package/"):] if member.name.startswith("package/") else member.name
            if member.isfile() and any(rel == k or rel.startswith(k + "/") for k in keep):
                out = dest / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(tar.extractfile(member).read())
    (dest / "VERSION").write_text(version + "\n")
    print(f"  -> {dest}")


if __name__ == "__main__":
    for name, (version, keep) in PACKAGES.items():
        fetch(name, version, keep)
