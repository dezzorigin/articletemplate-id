import type { APIRoute } from 'astro';
import { requireAdmin, isUuid } from '../../../lib/admin';
import { BorderPayError, isBorderPayTestMode, simulateBorderPayPayment } from '../../../lib/borderpay';

export const prerender = false;

// POST /admin/order/simulasi (order). Menandai tagihan BorderPay MODE TEST sebagai lunas
// lewat API simulate (server-side, key tidak keluar). BorderPay lalu mengirim webhook
// payment.paid ke /api/webhook-borderpay, jadi seluruh alur webhook ikut teruji.
// Hanya admin, dan hanya bila BORDERPAY_API_KEY berawalan bp_test_ (mati di live).
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!(await requireAdmin(locals.supabase, locals.user))) return new Response('Tidak ditemukan', { status: 404 });
  if (!isBorderPayTestMode()) return new Response('Tidak ditemukan', { status: 404 });
  const id = (await request.formData()).get('order');
  if (!isUuid(id)) return new Response('Tidak ditemukan', { status: 404 });
  // Path simulate memakai reference_id (OpenAPI BorderPay) = id order yang kita kirim saat membuat tagihan.
  try {
    await simulateBorderPayPayment(id);
  } catch (e) {
    const status = e instanceof BorderPayError ? e.status : 0;
    console.error('[admin] simulasi bayar gagal:', (e as Error).message);
    return redirect(`/admin/order?m=simulasi-gagal-${status}`, 303);
  }
  return redirect('/admin/order?m=simulasi-ok', 303);
};
