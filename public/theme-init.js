/* Applies the saved theme before first paint to avoid a flash. Kept as an external
   script so the Content Security Policy can stay free of 'unsafe-inline'. */
(function () {
  try {
    var mode = localStorage.getItem('edgeqr:theme') || 'system';
    var dark =
      mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    /* storage unavailable – default to system preference via CSS */
  }
})();
