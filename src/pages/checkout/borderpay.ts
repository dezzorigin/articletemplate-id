import type { APIRoute } from 'astro';
import {
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

// POST /checkout/borderpay  (order, aksi = QRIS | VA)
// Membuat pembayaran BorderPay untuk order menunggu_bayar, lalu kembali ke
// halaman status yang menampilkan tautan bayar (pay_url).
// - Tanpa key/base URL BorderPay -> 404 (sama seperti simulasi saat mock mati).
// - Pembayaran yang masih berlaku dipakai ulang (tidak membuat tagihan ganda);
//   yang sudah kedaluwarsa diganti dengan yang baru.
// - Gagal menghubungi BorderPay -> kembali ke status dengan ?e=bayar.
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

  // Validasi metode ke discovery BorderPay bila API-nya menjawab; bila tidak
  // menjawab, pakai QRIS/VA bawaan (docs: dua metode itu yang tersedia).
  const known = await listBorderPayMethods();
  const method = toBorderPayMethod(aksi);
  if (known.length > 0 && !known.includes(method)) {
    return redirect(`/checkout/status?order=${order.id}&e=metode`, 303);
  }

  let payment;
  try {
    payment = await createBorderPayPayment(
      { amount: Math.round(order.total), method, referenceId: order.id },
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
  if (!stored) {
    console.error('[checkout/borderpay] pembayaran dibuat tapi jejaknya gagal disimpan:', payment.id);
    return redirect(`/checkout/status?order=${order.id}&e=bayar`, 303);
  }
  return redirect(`/checkout/status?order=${order.id}`, 303);
};
