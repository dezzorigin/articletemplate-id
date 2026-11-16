import type { APIRoute } from 'astro';
import {
  FALLBACK_EWALLET_PROVIDERS,
  FALLBACK_VA_BANKS,
  createBorderPayPayment,
  getBorderPayConfig,
  isBorderPayEnabled,
  listBorderPayMethods,
  toBorderPayMethod,
} from '../../lib/borderpay';
import {
  getBorderPayPayment,
  isMetode,
  isRealBorderPayRef,
  startBorderPayPayment,
} from '../../lib/payments';
import { getOrderView } from '../../lib/orders';
import { optionalEnv } from '../../lib/env';

// POST /checkout/borderpay  (order, aksi = QRIS | VA | EWALLET, bank = kode bank/penyedia)
// Membuat pembayaran BorderPay untuk order menunggu_bayar, lalu kembali ke
// halaman status yang menampilkan tautan bayar (pay_url).
// - Tanpa key BorderPay -> 404 (sama seperti simulasi saat mock mati).
// - VA/E-Wallet WAJIB bank_code (Referensi API): pembeli memilih bank/penyedia
//   dari daftar aktif GET /payment-methods; bila discovery tidak menjawab,
//   dipakai daftar fallback (BCA/BNI/BRI/MANDIRI/PERMATA/CIMB, DANA/OVO/
//   GOPAY/SHOPEEPAY). Tanpa bank_code yang valid -> kembali dengan ?e=bank.
// - return_url dikirim: halaman status order (pembeli diarahkan ke sini
//   setelah bayar di BorderPay).
// - Pembayaran yang masih berlaku dipakai ulang (tidak membuat tagihan ganda);
//   yang sudah kedaluwarsa diganti dengan yang baru.
// - Gagal menghubungi BorderPay -> kembali ke status dengan ?e=bayar.
// - Jejak tersimpan tanpa pay_url (migrasi belum diterapkan) -> kembali ke
//   status dengan ?e=tautan: halaman status harus menampilkan tombol
//   buat-ulang (form buat pembayaran baru sudah ada di halaman itu) —
//   teks ?e=tautan ditambahkan PR redesign di src/pages/checkout/status.astro.
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!isBorderPayEnabled()) return new Response('Not found', { status: 404 });

  const form = await request.formData();
  const orderId = String(form.get('order') ?? '');
  const aksi = form.get('aksi');
  if (!isMetode(aksi)) return new Response('Bad request', { status: 400 });
  const order = await getOrderView(orderId);
  if (!order) return new Response('Not found', { status: 404 });
  if (order.status !== 'menunggu_bayar') return redirect(`/checkout/status?order=${order.id}`, 303);

  const existing = await getBorderPayPayment(order.id);
  const expired = existing?.expiresAt ? Date.now() > new Date(existing.expiresAt).getTime() : false;
  if (existing && isRealBorderPayRef(existing.borderpayRef) && existing.payUrl && !expired) {
    return redirect(`/checkout/status?order=${order.id}`, 303);
  }

  // Validasi metode + bank ke discovery BorderPay bila API-nya menjawab.
  const method = toBorderPayMethod(aksi);
  const info = await listBorderPayMethods();
  if (method === 'qris' && !info.qrisEnabled) {
    return redirect(`/checkout/status?order=${order.id}&e=metode`, 303);
  }
  let bankCode: string | undefined;
  if (method === 'va' || method === 'ewallet') {
    const live = method === 'va' ? info.vaBanks : info.ewalletBanks;
    const fallback = method === 'va' ? FALLBACK_VA_BANKS : FALLBACK_EWALLET_PROVIDERS;
    const allowed = live.length > 0 ? live : fallback;
    bankCode = String(form.get('bank') ?? '').trim().toUpperCase();
    if (!bankCode || !allowed.some((b) => b.code === bankCode)) {
      return redirect(`/checkout/status?order=${order.id}&e=bank`, 303);
    }
  }

  const site = (optionalEnv('SITE_URL') ?? 'https://articletemplate.id').replace(/\/$/, '');
  const returnUrl = `${site}/checkout/status?order=${order.id}`;

  let payment;
  try {
    payment = await createBorderPayPayment(
      { amount: Math.round(order.total), method, referenceId: order.id, bankCode, returnUrl },
      getBorderPayConfig(),
    );
  } catch (e) {
    console.error('[checkout/borderpay] gagal membuat pembayaran:', (e as Error).message);
    return redirect(`/checkout/status?order=${order.id}&e=bayar`, 303);
  }

  const stored = await startBorderPayPayment(order.id, aksi, {
    id: payment.id,
    payUrl: payment.payUrl,
    expiresAt: payment.expiresAt,
  });
  if (!stored.ok) {
    console.error('[checkout/borderpay] pembayaran dibuat tapi jejaknya belum tersimpan lengkap:', payment.id);
    // payUrlMissing: borderpay_ref tersimpan tapi pay_url tidak — pembeli
    // harus membuat pembayaran baru (?e=tautan), bukan diarahkan seolah
    // tautan bayar sudah tersimpan.
    const code = stored.payUrlMissing ? 'tautan' : 'bayar';
    return redirect(`/checkout/status?order=${order.id}&e=${code}`, 303);
  }
  return redirect(`/checkout/status?order=${order.id}`, 303);
};
