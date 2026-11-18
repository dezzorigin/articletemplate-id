import type { APIRoute } from 'astro';
import { isBorderPayEnabled } from '../../lib/borderpay';
import { isMetode } from '../../lib/payments';
import { getOrderView } from '../../lib/orders';
import { beginBorderPay, pickBankField } from '../../lib/pay-flow';

// POST /checkout/borderpay  (order, aksi = QRIS | VA | EWALLET, bank_va / bank_ewallet / bank)
// Buat (ulang) pembayaran BorderPay dari halaman status, mis. setelah kode
// bayar kedaluwarsa atau pembuatan pertama gagal. Logika bersama ada di
// src/lib/pay-flow.ts (dipakai juga /checkout/buat).
// - Tanpa key BorderPay -> 404.
// - Berhasil -> status?go=1; /js/status-pay.js membuka pay_url otomatis
//   (redirect POST langsung ke domain BorderPay diblokir CSP form-action).
// - Gagal -> kembali ke status dengan ?e=metode|bank|bayar|tautan.
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!isBorderPayEnabled()) return new Response('Not found', { status: 404 });

  const form = await request.formData();
  const orderId = String(form.get('order') ?? '');
  const aksi = form.get('aksi');
  if (!isMetode(aksi)) return new Response('Bad request', { status: 400 });
  const order = await getOrderView(orderId);
  if (!order) return new Response('Not found', { status: 404 });
  const statusUrl = `/checkout/status?order=${order.id}`;
  if (order.status !== 'menunggu_bayar') return redirect(statusUrl, 303);

  const pay = await beginBorderPay(order, aksi, pickBankField(form, aksi));
  if (pay.ok) return redirect(`${statusUrl}&go=1`, 303);
  return redirect(`${statusUrl}&e=${pay.code}`, 303);
};
