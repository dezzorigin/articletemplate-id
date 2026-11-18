import type { APIRoute } from 'astro';
import { readCart } from '../../lib/cart';
import { cleanEmail, cleanName } from '../../lib/auth';
import { createOrder, ensureBuyer } from '../../lib/orders';
import { isBorderPayEnabled } from '../../lib/borderpay';
import { isMetode, isMockEnabled } from '../../lib/payments';
import { beginBorderPay, pickBankField } from '../../lib/pay-flow';

// POST /checkout/buat  (nama, email untuk guest; aksi + bank_va/bank_ewallet bila BorderPay aktif)
// Login: pakai akun sesi, abaikan email dari form. Guest: akun otomatis dari email.
// Sekali klik: order dibuat, lalu (bila metode dipilih dan BorderPay aktif)
// pembayaran langsung dibuat; halaman status (?go=1) membuka halaman bayar
// BorderPay otomatis lewat /js/status-pay.js. Redirect POST langsung ke domain
// BorderPay tidak dipakai karena CSP form-action 'self' memblokirnya.
// Gagal membuat pembayaran -> halaman status order dengan ?e=..., di sana
// pembeli bisa memilih ulang metode (order sudah tersimpan, tidak hilang).
export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  const slugs = readCart(cookies);
  if (slugs.length === 0) return redirect('/keranjang', 303);

  const form = await request.formData();
  let userId: string | null = locals.user?.id ?? null;

  if (!userId) {
    const email = cleanEmail(form.get('email'));
    const nama = cleanName(form.get('nama'));
    if (!email || !nama) return redirect('/checkout?e=data', 303);
    userId = await ensureBuyer(email, nama);
    if (!userId) return redirect('/checkout?e=akun', 303);
  }

  const result = await createOrder(userId, slugs);
  if (!result.ok) {
    const code = result.reason === 'gagal' ? 'gagal' : result.reason === 'tanpa-file' ? 'file' : 'harga';
    return redirect(`/checkout?e=${code}`, 303);
  }
  const statusUrl = `/checkout/status?order=${result.orderId}`;

  const aksi = form.get('aksi');
  if (!isMockEnabled() && isBorderPayEnabled() && isMetode(aksi)) {
    const pay = await beginBorderPay({ id: result.orderId, total: result.total }, aksi, pickBankField(form, aksi));
    if (pay.ok) return redirect(`${statusUrl}&go=1`, 303);
    return redirect(`${statusUrl}&e=${pay.code}`, 303);
  }
  return redirect(statusUrl, 303);
};
