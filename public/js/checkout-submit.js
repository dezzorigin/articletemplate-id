// F-P2-9: nonaktifkan tombol submit checkout saat submit supaya klik ganda
// tidak mengirim pesanan dua kali. Tanpa JS, form tetap jalan seperti biasa.
// File eksternal (bukan inline): CSP situs adalah script-src 'self', jadi
// skrip inline diblokir — Astro me-render <script> .astro secara inline.
(function () {
  var form = document.querySelector('form.co');
  var btn = form ? form.querySelector('[data-submit]') : null;
  if (!form || !btn) return;
  form.addEventListener('submit', function () {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Memproses…';
  });
})();
