import type { APIRoute } from 'astro';

// SKELETON webhook BorderPay — BELUM AKTIF, dan sengaja tidak menebak
// skema signature BorderPay.
// Alasan: skema verifikasi signature (header apa, algoritma apa, format
// payload apa) hanya boleh diambil dari dokumentasi merchant BorderPay saat
// akun merchant aktif. Menebak skema = webhook bisa menerima callback palsu
// atau menolak callback asli — keduanya fatal untuk toko.
// Perilaku sekarang:
// - Secret belum diset -> 501 webhook_not_configured.
// - Secret sudah diset tapi skema belum dikonfirmasi -> 501
//   signature_scheme_unconfirmed (tetap tidak memproses order).
// Saat merchant aktif, lengkapi file ini dengan skema resmi, lalu uji:
// bayar sukses -> order lunas -> download aktif; bayar gagal -> order gagal.
export const POST: APIRoute = async () => {
  const secret = import.meta.env.BORDERPAY_WEBHOOK_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'webhook_not_configured' }), {
      status: 501,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ error: 'signature_scheme_unconfirmed' }), {
    status: 501,
    headers: { 'content-type': 'application/json' },
  });
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'content-type': 'application/json' },
  });
};
