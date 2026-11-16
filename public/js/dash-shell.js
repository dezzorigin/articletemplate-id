(function () {
  var root = document.documentElement;
  var shell = document.getElementById('dash-shell');
  // Terapkan status lipat yang dibaca skrip <head> (kelas di <html>).
  if (shell && root.classList.contains('at-sidebar-collapsed')) {
    shell.classList.add('dash-collapsed');
    var c0 = document.getElementById('dash-collapse');
    if (c0) {
      c0.setAttribute('aria-expanded', 'false');
      c0.setAttribute('aria-label', 'Buka sidebar');
    }
  }
  // Lipat sidebar (desktop).
  var collapseBtn = document.getElementById('dash-collapse');
  if (collapseBtn && shell) {
    collapseBtn.addEventListener('click', function () {
      var collapsed = shell.classList.toggle('dash-collapsed');
      collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      collapseBtn.setAttribute('aria-label', collapsed ? 'Buka sidebar' : 'Lipat sidebar');
      try {
        localStorage.setItem('at-sidebar-collapsed', collapsed ? '1' : '0');
      } catch (e) {}
    });
  }
  // Toggle tema gelap/terang (benar-benar mengganti variabel warna).
  var themeBtn = document.getElementById('dash-theme');
  function paintTheme(theme) {
    root.setAttribute('data-theme', theme);
    if (!themeBtn) return;
    var dark = theme === 'dark';
    themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    themeBtn.setAttribute('aria-label', dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap');
  }
  if (themeBtn) {
    paintTheme(root.getAttribute('data-theme') || 'light');
    themeBtn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('at-theme', next);
      } catch (e) {}
      paintTheme(next);
    });
  }
  // Sheet menu (HP).
  var menuBtn = document.getElementById('dash-menu');
  var sheet = document.getElementById('dash-sheet');
  var overlay = document.getElementById('dash-overlay');
  var closeBtn = document.getElementById('dash-sheet-close');
  if (!menuBtn || !sheet || !overlay || !closeBtn) return;
  var lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    sheet.hidden = false;
    overlay.hidden = false;
    requestAnimationFrame(function () {
      sheet.classList.add('open');
      overlay.classList.add('open');
    });
    document.body.style.overflow = 'hidden';
    menuBtn.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
  }
  function close() {
    sheet.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    menuBtn.setAttribute('aria-expanded', 'false');
    setTimeout(function () {
      sheet.hidden = true;
      overlay.hidden = true;
    }, 220);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  menuBtn.addEventListener('click', function () {
    if (sheet.classList.contains('open')) close();
    else open();
  });
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheet.classList.contains('open')) close();
  });
})();

