# Presentation: memory transfer

Talk on *Selective hippocampal reactivation* (paper repo:
`../Prioritized-Memory-Transfer`). Slides are HTML (reveal.js) so animations of the
network dynamics play natively. New simulations and visualizations for the talk
live here too.

## Layout

```
presentation_memory_transfer/
├── slides/                  the deck, self-contained (open or serve this folder)
│   ├── index.html           the talk
│   ├── layouts.html         gallery of slide layouts to copy from (not presented)
│   ├── fmax_tracking.html   standalone page of the F_max player (GitHub Pages / sharing)
│   ├── css/talk.css         theme + layout classes, colour tokens
│   ├── css/fmax-player.css  sizing of the live F_max player
│   ├── js/deck.js           reveal config, KaTeX macros (\cT \cS \cX)
│   ├── js/fmax-player.js    live SVG animation of the F_max tracking run
│   ├── js/sphere-player.js  Results transfer slides: live two-sphere view + static flat maps
│   ├── js/arch.js           Model architecture drawings (two networks, unit diagram) in inline SVG
│   ├── media/
│   │   ├── animations/      .mp4 (preferred) or .gif
│   │   ├── figures/         static plots, .svg / .png
│   │   ├── schematics/      network / brain drawings
│   │   └── interactive/     plotly .html for <iframe>, *.data.js for the live players
│   └── vendor/              reveal.js + KaTeX + Inter font (fetched, not committed)
├── notebooks/               VS Code #%% scripts, one per visualization
│   └── 00_template.py       copy to start a new one
├── talkviz/                 shared style + export helpers
│   ├── style.py             PALETTE, use_mpl_style(), plotly_template()
│   ├── export.py            save_mpl_animation, gif_to_mp4, frames_to_video, save_plotly_html
│   ├── web_export.py        export_fmax / export_sphere: run data for the JS players
│   ├── flatmap.py           Hammer map of the memory sphere, cut placed off the trajectory
│   └── paths.py             media_path(kind, name, draft=False)
├── notes/                   short write-ups of observations made while building the talk
├── outputs/                 drafts and frame dumps (gitignored)
├── tools/fetch_vendor.py    downloads reveal.js 5.2.1 + KaTeX 0.16.11 + Inter 4.1 into slides/vendor
├── tools/build_offline.py   zips slides/ into outputs/ as a copy that runs offline anywhere
└── tools/serve.py           serves slides/ with caching off (python tools/serve.py)
```

## Setup (once)

```bash
python tools/fetch_vendor.py
```

## Run the deck

```bash
python tools/serve.py
```

(`tools/serve.py` = `http.server` with caching off: with plain `python -m http.server`
the browser can keep running old css/js for a while after you edit them, even after F5.)

Then open http://localhost:8765. Keys: `s` speaker view (notes + timer),
`f` fullscreen, `o` overview, `Esc` exit. Opening `slides/index.html` directly also
works, but the speaker view needs the server.

PDF of the deck (one page per slide, as shown after its last click, live players at their
final state, on-screen controls hidden; pages are 1920x1080 images):

```bash
python tools/export_pdf.py
```

writes `outputs/memory_transfer_talk.pdf` (~1 min, needs Chrome). For selectable text instead,
open http://localhost:8765/?print-pdf in Chrome or Edge and print to PDF (the players then show
their empty first state).

## Offline copy for another computer

After any change to the slides, rebuild the zip (it does not update by itself):

```bash
python tools/build_offline.py
```

This writes `outputs/memory_transfer_talk_offline.zip` (~7 MB). On the other computer:
unzip it (do not open it from inside the zip), then double-click `index.html`. It
needs only Chrome, Edge or Firefox: no internet, no Python, no fonts (Inter, reveal.js and
KaTeX are bundled). The live animations work, since their data loads as plain `<script>` files.
The speaker view (`s`) may not work from a double-clicked file; if Python is on that computer,
run `python -m http.server` inside the unzipped folder and open http://localhost:8000.

## Make a visualization

1. Copy `notebooks/00_template.py` to `notebooks/NN_<name>.py`.
2. Simulate with the paper engine (`import prioritized_memory_transfer`, put on the path
   by `talkviz`), in the `pytorch` env.
3. Render drafts with `draft=True` (to `outputs/`), the final one to `slides/media/`.
4. Drop it in a slide:

```html
<video data-autoplay data-restart loop muted playsinline src="media/animations/NAME.mp4"></video>
```

`data-restart` replays from the first frame each time you enter the slide.

Conventions:

- Colours: teacher/hippocampus blue, student/neocortex orange, transfer green.
  Defined in `talkviz/style.py` and `slides/css/talk.css`; keep them in sync.
- Animations as MP4 (`save_mpl_animation`, H.264). GIF bands smooth colormaps.
  Old GIFs convert with `tv.gif_to_mp4(path)`.
- Full-slide renders at 1920x1080 px (`tv.SLIDE_PX`), the deck's canvas size.
- plotly cannot export video here (no kaleido): use matplotlib for videos, plotly
  for interactive `<iframe>` embeds.

## Live animations (HTML player)

Instead of a video, the F_max tracking animation (notebook 01) is drawn by the browser:
`js/fmax-player.js` reads the run exported by the notebook's last cell
(`talkviz.web_export.export_fmax` -> `media/interactive/fmax_tracking.data.js`, ~2 MB) and
draws it in SVG, sharp at any projector resolution.

- In the deck, three "next" per memory: (1) the memory is added, frozen, with its new F_max
  ring; (2) the teacher climbs to F_max with student plasticity OFF, and holds just before
  plasticity resumes; (3) plasticity resumes, the student learns, and the stage holds on its last
  frame. "Previous" goes back one step. Entering the slide from later shows the final state.
- Speed slider, bottom right (faint until hovered, double-click = 1x): remembered per browser.
- Options on the `<div class="fmax-player">`: `data-theme="dark|light"` (light: also drop the
  slide's dark background), `data-speed="1.5"`, `data-controls="none"` (no slider),
  `data-autoplay` + `data-steps="none"`.
- Pacing (steps per second per phase) comes from the notebook's `STRIDES`/`FPS`; rerun the
  export cell (seconds) after changing it or the simulation.
- Standalone: `fmax_tracking.html` (keys: arrows/click, three per memory, `A` autoplay, `T` theme, `+`/`-`
  speed, `R` reset; `?theme=light`, `?autoplay`, `?speed=1.5` in the URL). The `slides/`
  folder works as-is on GitHub Pages. A README on GitHub cannot run JavaScript: link to the
  Pages URL there.
- Mechanism slide (right before the F_max player): `js/mech-player.js` draws
  `notebooks/10_mechanism_climb.py`'s 64-neuron toy (teacher stores O and X, student only O), four clicks:
  teacher settles, student settles, interface error = gradient of q (the pause frame), climb to F_max.
  `index.html?mech=3.5` shows a frame half way through the 4th click (for headless renders).
- Keep the MP4 render as the backup (the PDF export shows the player's empty first state).

