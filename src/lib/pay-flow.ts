import {
  FALLBACK_EWALLET_PROVIDERS,
  FALLBACK_VA_BANKS,
  createBorderPayPayment,
  getBorderPayConfig,
  listBorderPayMethods,
  toBorderPayMethod,
} from './borderpay';
import { getBorderPayPayment, isRealBorderPayRef, startBorderPayPayment, type Metode } from './payments';
import { optionalEnv } from './env';

// Satu jalur untuk membuat pembayaran BorderPay dari sebuah order
// menunggu_bayar. Dipakai dua tempat:
// - /checkout/buat     : pembeli memilih metode di halaman checkout, order +
//                        pembayaran dibuat sekali klik, lalu langsung ke pay_url.
// - /checkout/borderpay: buat ulang dari halaman status (mis. kode bayar
//                        kedaluwarsa, atau pembayaran gagal dibuat).
// Pembayaran yang masih berlaku dipakai ulang (tidak membuat tagihan ganda).

export type PayFlowError = 'metode' | 'bank' | 'bayar' | 'tautan';
export type PayFlowResult = { ok: true; payUrl: string } | { ok: false; code: PayFlowError };

/** Pilih kode bank dari form: `bank_va` / `bank_ewallet` (checkout baru) atau `bank` (form lama). */
export function pickBankField(form: FormData, metode: Metode): string {
  const specific = metode === 'VA' ? form.get('bank_va') : metode === 'EWALLET' ? form.get('bank_ewallet') : null;
  return String(specific ?? form.get('bank') ?? '')
    .trim()
    .toUpperCase();
}

export async function beginBorderPay(
  order: { id: string; total: number },
  metode: Metode,
  bankRaw: string,
): Promise<PayFlowResult> {
  const existing = await getBorderPayPayment(order.id);
  const expired = existing?.expiresAt ? Date.now() > new Date(existing.expiresAt).getTime() : false;
  if (existing && isRealBorderPayRef(existing.borderpayRef) && existing.payUrl && !expired) {
    return { ok: true, payUrl: existing.payUrl };
  }

  // Validasi metode + bank ke discovery BorderPay bila API-nya menjawab.
  const method = toBorderPayMethod(metode);
  const info = await listBorderPayMethods();
  if (method === 'qris' && !info.qrisEnabled) return { ok: false, code: 'metode' };
  let bankCode: string | undefined;
  if (method === 'va' || method === 'ewallet') {
    const live = method === 'va' ? info.vaBanks : info.ewalletBanks;
    const fallback = method === 'va' ? FALLBACK_VA_BANKS : FALLBACK_EWALLET_PROVIDERS;
    const allowed = live.length > 0 ? live : fallback;
    bankCode = bankRaw;
    if (!bankCode || !allowed.some((b) => b.code === bankCode)) return { ok: false, code: 'bank' };
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
    console.error('[pay-flow] gagal membuat pembayaran:', (e as Error).message);
    return { ok: false, code: 'bayar' };
  }

  const stored = await startBorderPayPayment(order.id, metode, {
    id: payment.id,
    payUrl: payment.payUrl,
    expiresAt: payment.expiresAt,
  });
  if (!stored.ok) {
    console.error('[pay-flow] pembayaran dibuat tapi jejaknya belum tersimpan lengkap:', payment.id);
    // payUrlMissing: borderpay_ref tersimpan tapi pay_url tidak, pembeli harus
    // membuat pembayaran baru (?e=tautan).
    return { ok: false, code: stored.payUrlMissing ? 'tautan' : 'bayar' };
  }
  return { ok: true, payUrl: payment.payUrl };
}
