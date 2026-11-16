(function () {
  try {
    var stored = localStorage.getItem('at-theme');
    var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    if (localStorage.getItem('at-sidebar-collapsed') === '1') {
      document.documentElement.classList.add('at-sidebar-collapsed');
    }
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

