// Reveal.js setup shared by index.html and layouts.html.
// Everything is loaded from slides/vendor/ (see tools/fetch_vendor.py) so the
// deck runs offline.

// KaTeX macros: role colours (match css/talk.css) plus the paper's notation.
const MACROS = {
  "\\cT": "\\textcolor{##378ADD}{#1}",   // teacher / hippocampus
  "\\cS": "\\textcolor{##D85A30}{#1}",   // student / neocortex
  "\\cX": "\\textcolor{##3A9A5C}{#1}",   // transfer
  "\\R": "\\mathbb{R}",
};

// Footer: the text lives once in <div class="talk-footer">; copy it into every content slide
// so it scales with the slide. A fixed-position footer stays in window pixels and lands on
// the slide content when the window is smaller than 1920x1080.
(function placeFooter() {
  const src = document.querySelector(".talk-footer");
  if (!src) return;
  document.querySelectorAll(".reveal .slides section").forEach((s) => {
    if (s.querySelector(":scope > section")) return;              // a vertical stack
    if (s.matches(".title, .fmax-slide, .sphere-slide")) return;                // no footer there
    const f = document.createElement("div");
    f.className = "slide-footer";
    f.textContent = src.textContent;
    s.appendChild(f);
  });
  src.remove();
})();

Reveal.initialize({
  width: 1920,
  height: 1080,
  margin: 0,
  minScale: 0.1,
  maxScale: 3,
  center: false,
  // arrows walk every slide in order, like space: in the default 2D mode left/right jump
  // between sections and skip the slides stacked under a section divider
  navigationMode: "linear",
  hash: true,
  slideNumber: "c/t",
  showSlideNumber: "speaker",   // numbers on the projector are off; flip to "all" if wanted
  controls: false,
  progress: true,
  transition: "fade",
  transitionSpeed: "fast",
  backgroundTransition: "fade",
  autoPlayMedia: null,          // per-video: data-autoplay
  preloadIframes: true,
  viewDistance: 2,              // keeps heavy videos from all loading at once
  pdfSeparateFragments: false,

  katex: {
    local: "vendor/katex",
    macros: MACROS,
    trust: true,
  },

  plugins: [RevealMath.KaTeX, RevealNotes],
});

// Restart a slide's videos from 0 every time it is entered, so a dynamics
// animation always starts from the initial state when you arrive on it.
Reveal.on("slidechanged", (event) => {
  event.currentSlide.querySelectorAll("video[data-restart]").forEach((v) => {
    v.currentTime = 0;
    v.play();
  });
});
