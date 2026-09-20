// GeoNEXA AI - PWA registration
// Include this on every page (via <script src="./pwa-register.js"></script>)
// right before the closing </body> tag.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        console.log('GeoNEXA SW registered:', reg.scope);
      })
      .catch((err) => {
        console.warn('GeoNEXA SW registration failed:', err);
      });
  });
}
