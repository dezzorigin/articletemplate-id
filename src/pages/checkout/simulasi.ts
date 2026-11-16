import type { APIRoute } from 'astro';
import { applyPaymentResult, isFinalResult, isMetode, isMockEnabled, startPayment } from '../../lib/payments';
import { getOrderView } from '../../lib/orders';
import { writeCart } from '../../lib/cart';

// POST /checkout/simulasi  (order, aksi = QRIS | VA | lunas | gagal | kedaluwarsa)
// Simulasi bayar untuk mode mock (dev). Webhook BorderPay nyata ada di
// /api/webhook-borderpay. MATI kecuali PAYMENT_PROVIDER=mock.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isMockEnabled()) return new Response('Not found', { status: 404 });

  const form = await request.formData();
  const orderId = String(form.get('order') ?? '');
  const aksi = form.get('aksi');
  const order = await getOrderView(orderId);
  if (!order) return new Response('Not found', { status: 404 });

  if (isMetode(aksi)) {
    await startPayment(order.id, aksi);
  } else if (isFinalResult(aksi)) {
    const r = await applyPaymentResult(order.id, aksi);
    // Keranjang baru dikosongkan setelah LUNAS, bukan saat order dibuat.
    if (r.status === 'lunas') writeCart(cookies, []);
  } else {
    return new Response('Bad request', { status: 400 });
  }
  return redirect(`/checkout/status?order=${order.id}`, 303);
};
