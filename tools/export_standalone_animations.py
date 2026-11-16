"""Save the talk's two live animations as single HTML files that run anywhere, offline.

    python tools/export_standalone_animations.py

Writes outputs/standalone_animations/two_spheres.html and fmax_tracking.html. Data, player script,
styles and fonts are inlined, so each file opens with a double-click and can be moved or sent alone.
Same players and same settings as the slides (light theme, fixed camera on the spheres). Rerun after
changing a player or its exported data.
"""

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLIDES = ROOT / "slides"
OUT = ROOT / "outputs" / "standalone_animations"

KATEX = "vendor/katex/dist/fonts/KaTeX_{}.woff2"
FONTS = [  # family, weight, style, file under slides/
    ("Inter", "100 900", "normal", "vendor/inter/InterVariable.woff2"),
    ("Inter", "100 900", "italic", "vendor/inter/InterVariable-Italic.woff2"),
    ("KaTeX_Math", "400", "italic", KATEX.format("Math-Italic")),
    ("KaTeX_Math", "700", "italic", KATEX.format("Math-BoldItalic")),
    ("KaTeX_Main", "400", "normal", KATEX.format("Main-Regular")),
    ("KaTeX_Caligraphic", "400", "normal", KATEX.format("Caligraphic-Regular")),
]

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
{fonts}
{player_css}
html, body {{ margin: 0; height: 100%; background: #FFFFFF; overflow: hidden; }}
body {{ display: flex; flex-direction: column; align-items: center; justify-content: center;
       font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #23262D; }}
h1 {{ margin: 0; padding: 2.2vh 3vw 0; font-size: 4vh; font-weight: 700; letter-spacing: -0.01em; text-align: center; }}
.player {{ width: min(100vw, calc((100vh - {reserve}) * 16 / 9)); cursor: pointer; }}
.help {{ position: fixed; left: 50%; {help_at}: 8px; transform: translateX(-50%); margin: 0; white-space: nowrap;
        font-size: 14px; font-weight: 600; color: #5F6670; transition: opacity 0.6s; }}
.help.faded {{ opacity: 0; }}
</style>
</head>
<body>
{heading}<div class="player {player_class}" {attrs}></div>
<p class="help">{help}</p>
<script>{data}</script>
<script>{player_js}</script>
<script>
const elm = document.querySelector(".player"), player = elm.{handle}, help = document.querySelector(".help");
let fade;
const poke = () => {{ help.classList.remove("faded"); clearTimeout(fade); fade = setTimeout(() => help.classList.add("faded"), 5000); }};
// next while a segment plays finishes it, as in the deck
const next = () => {{ if (!(player.finish && player.finish())) player.next(); }};
// a click advances, a drag (turning a sphere) does not, and the player's own controls keep their clicks
let down = null;
elm.addEventListener("pointerdown", (e) => {{ down = [e.clientX, e.clientY]; }});
elm.addEventListener("click", (e) => {{
  const moved = down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5;
  if (!moved && !e.target.closest(".fp-speed, .fp-toggle")) {{ next(); poke(); }}
}});
document.addEventListener("keydown", (e) => {{
  const k = e.key;
  if (k === "ArrowRight" || k === " " || k === "PageDown" || k === "Enter") next();
  else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") player.prev();
  else if (k === "r" || k === "R") player.goTo(0, false);
  else return;
  e.preventDefault();
  poke();
}});
poke();
</script>
</body>
</html>
"""

ANIMATIONS = {
    "two_spheres": dict(
        title="Memory reactivation",
        heading="<h1>Memory reactivation: the teacher replays, the student follows</h1>\n",
        reserve="10vh",
        help_at="bottom",
        player_class="sphere-player",
        attrs='data-sphere="sphere_transfer" data-layout="network" data-theme="light" data-follow="off"',
        handle="_sphere",
        data="sphere_transfer.data.js",
        script="sphere-player.js",
        help="Click or &rarr; to play &middot; &larr; back &middot; R restart &middot; drag a sphere to turn it",
    ),
    "fmax_tracking": dict(
        title="F_max tracking",
        heading="",
        reserve="0px",
        help_at="top",  # the sliders fill the bottom edge of this one
        player_class="fmax-player",
        attrs='data-fmax="fmax_tracking" data-theme="light"',
        handle="_fmax",
        data="fmax_tracking.data.js",
        script="fmax-player.js",
        help="Click or &rarr; for each step (add memory, climb, learn) &middot; &larr; back &middot; R restart",
    ),
}


def font_face(family, weight, style, path):
    b64 = base64.b64encode((SLIDES / path).read_bytes()).decode("ascii")
    return (f'@font-face {{ font-family: "{family}"; font-weight: {weight}; font-style: {style}; font-display: block; '
            f'src: url("data:font/woff2;base64,{b64}") format("woff2"); }}')


def script_text(path):
    # a literal closing tag would end the inline script early
    return path.read_text(encoding="utf-8").replace("</script", "<\\/script")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    fonts = "\n".join(font_face(*f) for f in FONTS)
    player_css = (SLIDES / "css" / "fmax-player.css").read_text(encoding="utf-8")
    for name, a in ANIMATIONS.items():
        html = PAGE.format(
            title=a["title"], heading=a["heading"], reserve=a["reserve"], help_at=a["help_at"], fonts=fonts,
            player_css=player_css,
            player_class=a["player_class"], attrs=a["attrs"], handle=a["handle"], help=a["help"],
            data=script_text(SLIDES / "media" / "interactive" / a["data"]),
            player_js=script_text(SLIDES / "js" / a["script"]),
        )
        path = OUT / f"{name}.html"
        path.write_text(html, encoding="utf-8")
        print(f"{path}: {path.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
