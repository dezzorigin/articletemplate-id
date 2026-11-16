// F-P2-15: hitung mundur kedaluwarsa kode bayar dari expires_at (DB).
// Teks server ("Bayar sebelum … WIB") tetap tampil bila JS mati.
// File eksternal (bukan inline): CSP situs adalah script-src 'self', jadi
// skrip inline diblokir — Astro me-render <script> .astro secara inline.
(function () {
  var el = document.querySelector('[data-expires]');
  if (!el || !el.dataset.expires) return;
  var end = new Date(el.dataset.expires).getTime();
  var timer = 0;
  function pad(n) {
    return String(n).padStart(2, '0');
  }
  function tick() {
    var left = end - Date.now();
    if (left <= 0) {
      el.textContent = 'Waktu bayar habis — muat ulang halaman untuk membuat pembayaran baru.';
      window.clearInterval(timer);
      return;
    }
    var h = Math.floor(left / 3600000);
    var m = Math.floor((left % 3600000) / 60000);
    var s = Math.floor((left % 60000) / 1000);
    el.textContent = 'Sisa waktu bayar: ' + (h > 0 ? h + ' jam ' : '') + pad(m) + ':' + pad(s);
  }
  tick();
  timer = window.setInterval(tick, 1000);
})();
