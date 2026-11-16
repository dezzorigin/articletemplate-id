(function () {
  var btn = document.getElementById('menu-btn');
  var sheet = document.getElementById('sheet-menu');
  var overlay = document.getElementById('sheet-overlay');
  var closeBtn = document.getElementById('sheet-close');
  if (!btn || !sheet || !overlay || !closeBtn) return;
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
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Tutup menu');
    closeBtn.focus();
  }
  function close() {
    sheet.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Buka menu');
    setTimeout(function () {
      sheet.hidden = true;
      overlay.hidden = true;
    }, 220);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  btn.addEventListener('click', function () {
    if (sheet.classList.contains('open')) close();
    else open();
  });
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheet.classList.contains('open')) close();
  });
})();

