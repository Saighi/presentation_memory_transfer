// Reveal.js setup shared by index.html and layouts.html.
// Everything is loaded from slides/vendor/ (see tools/fetch_vendor.py) so the
// deck runs offline.

// KaTeX macros: role colours (match css/talk.css) plus the paper's notation.
const MACROS = {
  // teacher / student / transfer: kept as markup, rendered in ink (no coloured maths but kappa)
  "\\cT": "{#1}",
  "\\cS": "{#1}",
  "\\cX": "{#1}",
  // kappa, the sign-reversed coupling: always violet (text only, never arrows). Through a one-argument
  // macro: KaTeX unescapes "##" only when a macro takes arguments, and a bare "#" breaks aligned blocks
  "\\cKc": "\\textcolor{##8E44AD}{#1}",
  "\\cK": "\\cKc{\\kappa}",
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
    if (s.matches(".title, .fmax-slide, .sphere-slide, .mech-slide")) return;                // no footer there
    const f = document.createElement("div");
    f.className = "slide-footer";
    f.textContent = src.textContent;
    s.appendChild(f);
  });
  src.remove();
})();

// Slide tag, top right of every slide but the title slides: where we are in the talk and the slide
// number. The talk has two groups (data-group on the top-level sections): previous research, split
// into parts (data-part), and research intent. Both groups are always listed, the current one bold;
// the parts of the current group follow it, the current part underlined. A section with no group
// (Supplementary) is added at the end. The number is the slide's position in the deck, the same as
// reveal's own count (and its "go to slide").
(function placeSlideTag() {
  const tops = [...document.querySelectorAll(".reveal .slides > section")];
  const GROUPS = ["Previous research", "Research intent"];
  const partsOf = (g) => [...new Set(tops
    .filter((t) => t.dataset.group === g && t.dataset.part && t.dataset.part !== g)
    .map((t) => t.dataset.part))];
  const leaves = [...document.querySelectorAll(".reveal .slides section")]
    .filter((s) => !s.querySelector(":scope > section"));
  leaves.forEach((s, k) => {
    if (s.matches(".title")) return;
    const top = tops.find((t) => t === s || t.contains(s));
    const group = top && top.dataset.group;
    const part = top && top.dataset.part;
    const items = GROUPS.map((g) => {
      const subs = g === group ? partsOf(g) : [];
      const head = `<span class="part group${g === group ? " on" : ""}${subs.length ? " has-subs" : ""}">${g}</span>`;
      return subs.length
        ? head + '<span class="subs">' +
          subs.map((p) => `<span class="sub${p === part ? " on" : ""}">${p}</span>`).join("") + "</span>"
        : head;
    });
    if (!group && part) items.push(`<span class="part on">${part}</span>`);
    const tag = document.createElement("div");
    tag.className = "slide-tag";
    tag.innerHTML = `<span class="parts">${items.join("")}</span><span class="num">${k + 1}</span>`;
    s.appendChild(tag);
  });
})();

// Home-screen web app (iPad "Add to Home Screen"): html.standalone, used by css/talk.css to drop the
// progress bar there. navigator.standalone is Safari's flag, display-mode the standard one.
if (window.navigator.standalone || matchMedia("(display-mode: standalone)").matches)
  document.documentElement.classList.add("standalone");

// index.html?export: html.export, used by css/talk.css to hide the on-screen controls (player
// sliders, corner buttons, progress bar) for the PDF screenshots of tools/export_pdf.py
if (new URLSearchParams(location.search).has("export"))
  document.documentElement.classList.add("export");

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
