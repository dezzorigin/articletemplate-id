import type { APIRoute } from 'astro';
import { getBorderPayConfig, mapBorderPayEvent, verifyBorderPayToken } from '../../lib/borderpay';
import { applyPaymentResult, getBorderPayPayment, isRealBorderPayRef } from '../../lib/payments';
import { getOrderView } from '../../lib/orders';

// Webhook BorderPay — POST /api/webhook-borderpay.
// Event: payment.paid -> lunas, payment.expired -> kedaluwarsa,
// payment.failed -> gagal (Referensi API resmi, dibaca penuh 16 Nov 2026:
// https://borderpay.id/api-reference — verifikasi HANYA pencocokan token
// header x-borderpay-token; TIDAK ADA HMAC. Payload:
// {event, mode, data: {slug, mode, reference_id, order_id, status, amount,
// fee, merchant_receives, method}}; balas 2xx untuk ACK.)
//
// KEAMANAN (fail-closed) — skema verifikasi TERKONFIRMASI Referensi API +
// pemilik akun 16 Nov 2026: header `x-borderpay-token` harus sama dengan token verifikasi
// dari env BORDERPAY_WEBHOOK_TOKEN; tidak cocok -> 401, tidak diproses.
// Verifikasi HMAC hanya LEGACY untuk integrasi lama dan sengaja tidak
// dipakai di sini.
// - Token belum diset -> 501 webhook_not_configured (tidak memproses).
// - Token tidak ada / tidak cocok -> 401, tidak diproses.
// - reference_id harus cocok dengan order yang ada DAN amount (bila ada di
//   payload) harus sama dengan total order — kalau tidak, event diabaikan.
// - Bila order sudah menyimpan borderpay_ref asli dan id pembayaran di
//   webhook berbeda -> diabaikan (bukan pembayaran order itu).
// - Perubahan status lewat applyPaymentResult() yang idempotent: hanya order
//   menunggu_bayar yang bisa berubah, jadi kirim ulang webhook tidak
//   memproses ganda.
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
  const config = getBorderPayConfig();
  if (!config.webhookToken) {
    return json({ error: 'webhook_not_configured' }, 501);
  }

  const tokenHeader = request.headers.get('x-borderpay-token');
  const valid = verifyBorderPayToken({ tokenHeader, token: config.webhookToken });
  if (!valid) {
    console.warn('[webhook-borderpay] token tidak valid — ditolak');
    return json({ error: 'invalid_token' }, 401);
  }

  let body: unknown;
  try {
    body = (await request.json()) as unknown;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const root = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const data = (typeof root.data === 'object' && root.data !== null ? root.data : root) as Record<string, unknown>;

  const event = typeof root.event === 'string' ? root.event : typeof root.type === 'string' ? root.type : '';
  const result = mapBorderPayEvent(event);
  if (!result) {
    console.log(`[webhook-borderpay] event tidak dikenal diabaikan: ${event || '(kosong)'}`);
    return json({ received: true, ignored: 'unknown_event' }, 200);
  }

  const referenceId =
    typeof data.reference_id === 'string'
      ? data.reference_id
      : typeof data.reference === 'string'
        ? data.reference
        : typeof data.order_id === 'string'
          ? data.order_id
          : '';
  if (!UUID_RE.test(referenceId)) {
    console.warn('[webhook-borderpay] reference_id bukan UUID order — diabaikan');
    return json({ received: true, ignored: 'bad_reference' }, 200);
  }

  const order = await getOrderView(referenceId);
  if (!order) {
    console.warn(`[webhook-borderpay] order tidak ditemukan: ${referenceId} — diabaikan`);
    return json({ received: true, ignored: 'order_not_found' }, 200);
  }

  const amountRaw = data.amount ?? data.total ?? data.gross_amount;
  if (typeof amountRaw === 'number' && Math.round(amountRaw) !== Math.round(order.total)) {
    console.warn(
      `[webhook-borderpay] amount ${amountRaw} != total order ${order.total} untuk ${referenceId} — diabaikan`,
    );
    return json({ received: true, ignored: 'amount_mismatch' }, 200);
  }

  const paymentId =
    typeof data.id === 'string'
      ? data.id
      : typeof data.payment_id === 'string'
        ? data.payment_id
        : '';
  const stored = await getBorderPayPayment(order.id);
  if (stored && isRealBorderPayRef(stored.borderpayRef) && paymentId && stored.borderpayRef !== paymentId) {
    console.warn(
      `[webhook-borderpay] id pembayaran ${paymentId} != ${stored.borderpayRef} untuk order ${order.id} — diabaikan`,
    );
    return json({ received: true, ignored: 'payment_mismatch' }, 200);
  }

  const r = await applyPaymentResult(order.id, result);
  console.log(`[webhook-borderpay] ${event} order ${order.id} -> ${r.status} (changed=${r.changed})`);
  return json({ received: true, order: order.id, status: r.status, changed: r.changed }, 200);
};

export const GET: APIRoute = async () => {
  return json({ error: 'method_not_allowed' }, 405);
};
