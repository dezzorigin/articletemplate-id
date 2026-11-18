// Halaman status pesanan:
// 1) ?go=1 (baru membuat pembayaran) -> buka halaman bayar BorderPay otomatis.
//    Redirect 303 langsung dari form ke domain BorderPay diblokir CSP
//    form-action 'self', jadi navigasi dilakukan di sini. go=1 dibuang dari
//    URL dulu supaya tombol Back tidak memantul ke BorderPay lagi.
// 2) Menunggu pembayaran dengan tautan bayar aktif -> cek status tiap 10 detik
//    (muat ulang halaman saat tab terlihat), supaya pembeli tidak perlu reload.
// Tanpa JS: tombol "Buka halaman bayar" dan teks petunjuk tetap ada.
(function () {
  var box = document.querySelector('[data-pay-url]');
  if (!box) return;
  var payUrl = box.getAttribute('data-pay-url');
  var url = new URL(window.location.href);
  if (url.searchParams.get('go') === '1' && payUrl) {
    url.searchParams.delete('go');
    window.history.replaceState(null, '', url.pathname + url.search);
    var note = document.querySelector('[data-go-note]');
    if (note) note.hidden = false;
    window.setTimeout(function () {
      window.location.assign(payUrl);
    }, 600);
    return;
  }
  if (box.hasAttribute('data-poll')) {
    window.setInterval(function () {
      if (document.visibilityState === 'visible') window.location.reload();
    }, 10000);
  }
})();
