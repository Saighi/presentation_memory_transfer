"""Download reveal.js, KaTeX and the Inter font into slides/vendor/ so the deck runs offline.

    python tools/fetch_vendor.py            # everything
    python tools/fetch_vendor.py inter      # only the named ones

Pulls the pinned npm tarballs from registry.npmjs.org (Inter from its GitHub
release) and keeps only the files the deck loads. Safe to re-run (replaces
slides/vendor/<pkg>).
"""

from __future__ import annotations

import io
import shutil
import sys
import tarfile
import urllib.request
import zipfile
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


INTER_VERSION = "4.1"
INTER_KEEP = {"web/InterVariable.woff2", "web/InterVariable-Italic.woff2", "LICENSE.txt"}


def fetch_inter() -> None:
    """Inter variable font (SIL OFL); slides/css/talk.css declares the @font-face."""
    url = f"https://github.com/rsms/inter/releases/download/v{INTER_VERSION}/Inter-{INTER_VERSION}.zip"
    print(f"inter {INTER_VERSION}  <-  {url}")
    data = urllib.request.urlopen(url).read()
    dest = VENDOR / "inter"
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for rel in INTER_KEEP:
            (dest / Path(rel).name).write_bytes(zf.read(rel))
    (dest / "VERSION").write_text(INTER_VERSION + "\n")
    print(f"  -> {dest}")


if __name__ == "__main__":
    wanted = set(sys.argv[1:])
    for name, (version, keep) in PACKAGES.items():
        if not wanted or name in wanted:
            fetch(name, version, keep)
    if not wanted or "inter" in wanted:
        fetch_inter()
