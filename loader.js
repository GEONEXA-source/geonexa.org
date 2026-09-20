// GeoNEXA AI — Site-wide Loading Overlay
// Drop this one file into any page: <script src="loader.js"></script>
// Then call showLoader("Message…") before an async action and hideLoader() when done.
// No other setup needed — this injects its own CSS and HTML automatically.

(function () {
  const STYLE = `
    #geonexaLoaderOverlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(10, 14, 20, 0.75);
      backdrop-filter: blur(2px);
      display: none;
      align-items: center; justify-content: center;
      flex-direction: column; gap: 14px;
    }
    #geonexaLoaderOverlay.open { display: flex; }
    .geonexa-spinner {
      width: 42px; height: 42px;
      border: 3px solid rgba(20,184,166,0.25);
      border-top-color: #14b8a6;
      border-radius: 50%;
      animation: geonexaSpin 0.8s linear infinite;
    }
    @keyframes geonexaSpin { to { transform: rotate(360deg); } }
    #geonexaLoaderText {
      color: #e8edf2; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 260px; text-align: center;
    }
  `;

  function injectStyle() {
    if (document.getElementById("geonexaLoaderStyle")) return;
    const s = document.createElement("style");
    s.id = "geonexaLoaderStyle";
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function injectOverlay() {
    if (document.getElementById("geonexaLoaderOverlay")) return;
    const div = document.createElement("div");
    div.id = "geonexaLoaderOverlay";
    div.innerHTML = `
      <div class="geonexa-spinner"></div>
      <div id="geonexaLoaderText">Loading…</div>
    `;
    document.body.appendChild(div);
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(() => {
    injectStyle();
    injectOverlay();
  });

  // Show the loader. message is optional; defaults to "Loading…".
  window.showLoader = function (message) {
    injectStyle();
    injectOverlay();
    const overlay = document.getElementById("geonexaLoaderOverlay");
    const text = document.getElementById("geonexaLoaderText");
    if (text) text.textContent = message || "Loading…";
    if (overlay) overlay.classList.add("open");
  };

  // Hide the loader.
  window.hideLoader = function () {
    const overlay = document.getElementById("geonexaLoaderOverlay");
    if (overlay) overlay.classList.remove("open");
  };

  // Convenience wrapper: shows the loader, runs an async function, always
  // hides the loader afterward (even on error), and rethrows any error so
  // your existing try/catch logic still works unchanged.
  //
  // Example:
  //   await withLoader("Loading users…", () => loadUsers());
  //
  window.withLoader = async function (message, asyncFn) {
    window.showLoader(message);
    try {
      return await asyncFn();
    } finally {
      window.hideLoader();
    }
  };
})();
