// Scale and maths for poster.html.
//   poster.html            fits the window (preview)
//   poster.html?size=A0    print size for Chrome's print-to-pdf: A1 (default), A0, or B1 / custom widths
//   poster.html?zoom=1     true A1 size on screen
(function () {
  "use strict";

  const WIDTH_REM = 59.4, HEIGHT_REM = 84.1;
  const SIZES = { A1: 594, A0: 841 };     // page width in mm; A-series keeps the aspect ratio
  const params = new URLSearchParams(location.search);
  const widthMm = SIZES[params.get("size")] || SIZES.A1;
  const root = document.documentElement;

  root.style.setProperty("--root-print", widthMm / WIDTH_REM + "mm");
  const page = document.createElement("style");
  page.textContent = `@page { size: ${widthMm}mm ${(widthMm * HEIGHT_REM) / WIDTH_REM}mm; margin: 0; }`;
  document.head.appendChild(page);

  function fit() {
    const zoom = parseFloat(params.get("zoom"));
    const px = zoom ? zoom * (10 * 96) / 25.4 : Math.min(innerWidth / WIDTH_REM, innerHeight / HEIGHT_REM);
    root.style.setProperty("--root-screen", px + "px");
  }
  fit();
  addEventListener("resize", fit);

  addEventListener("DOMContentLoaded", () => {
    renderMathInElement(document.body, {
      delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
      // kappa is the one violet symbol, as in the talk
      // (through a one-argument macro: KaTeX unescapes "##" only when a macro takes arguments)
      macros: { "\\cKc": "\\textcolor{##8E44AD}{#1}", "\\cK": "\\cKc{\\kappa}" },
    });
  });
})();
