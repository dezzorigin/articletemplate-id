import { getSupabaseAdmin } from './supabase';
import { optionalEnv } from './env';
import { sendOrderPaidEmail } from './email';

// Provider pembayaran MOCK (WES-16). BorderPay asli ditunda sampai akun merchant ada (WES-17).
// Semua perubahan status order lewat applyPaymentResult(): satu pintu, idempotent.
// Webhook BorderPay nanti cukup memanggil fungsi yang sama setelah signature valid.

export type PayStatus = 'menunggu_bayar' | 'lunas' | 'gagal' | 'kedaluwarsa';
export type FinalResult = Exclude<PayStatus, 'menunggu_bayar'>;
export type Metode = 'QRIS' | 'VA';

/** Masa berlaku order menunggu bayar. */
export const ORDER_TTL_MS = 24 * 60 * 60 * 1000;

/** Mock hanya menyala di dev (atau bila diminta lewat env di dev).
 *  Di build produksi mock SELALU mati, apa pun nilai PAYMENT_PROVIDER —
 *  kalau tidak, siapa pun bisa menandai order lunas tanpa bayar lewat
 *  POST /checkout/simulasi (tanpa login, cukup UUID order).
 *  Produksi nyata = BorderPay (WES-17). */
export function isMockEnabled(): boolean {
  if (import.meta.env.PROD) return false;
  const mode = optionalEnv('PAYMENT_PROVIDER');
  if (mode) return mode === 'mock';
  return true;
}

export function isMetode(v: unknown): v is Metode {
  return v === 'QRIS' || v === 'VA';
}

export function isFinalResult(v: unknown): v is FinalResult {
  return v === 'lunas' || v === 'gagal' || v === 'kedaluwarsa';
}

/**
 * Terapkan hasil pembayaran. Idempotent: hanya order `menunggu_bayar` yang bisa berubah,
 * dan update dikunci kondisi itu di database, jadi dua callback bersamaan tidak saling timpa.
 * Status akhir tidak pernah berubah lagi (lunas tidak bisa jadi gagal, dan sebaliknya).
 */
export async function applyPaymentResult(
  orderId: string,
  result: FinalResult,
): Promise<{ changed: boolean; status: PayStatus }> {
  const admin = getSupabaseAdmin();

  const { data: updated, error } = await admin
    .from('orders')
    .update({ status: result })
    .eq('id', orderId)
    .eq('status', 'menunggu_bayar')
    .select('id');
  if (error) throw new Error(`gagal mengubah status order: ${error.message}`);

  if (updated && updated.length > 0) {
    // Hanya pemenang update yang menulis jejak payments.
    const patch: Record<string, unknown> = { status: result };
    if (result === 'lunas') patch.paid_at = new Date().toISOString();
    const { data: pay } = await admin
      .from('payments')
      .update(patch)
      .eq('order_id', orderId)
      .select('id');
    if (!pay || pay.length === 0) {
      await admin.from('payments').insert({ order_id: orderId, ...patch });
    }
    if (result === 'lunas') {
      // Hanya pemenang update yang mengirim email. Gagal kirim tidak menggagalkan order.
      const r = await sendOrderPaidEmail(orderId);
      if (!r.ok) console.warn(`[email] order ${orderId}: ${r.reason}`);
    }
    return { changed: true, status: result };
  }

  const { data: current } = await admin.from('orders').select('status').eq('id', orderId).maybeSingle();
  return { changed: false, status: (current?.status as PayStatus) ?? 'menunggu_bayar' };
}

/** Kedaluwarsakan order menunggu bayar yang sudah lewat masa berlaku (dipanggil saat dilihat). */
export async function expireIfStale(orderId: string, createdAt: string, status: PayStatus): Promise<PayStatus> {
  if (status !== 'menunggu_bayar') return status;
  if (Date.now() - new Date(createdAt).getTime() < ORDER_TTL_MS) return status;
  const r = await applyPaymentResult(orderId, 'kedaluwarsa');
  return r.status;
}

/** Catat pilihan metode untuk order yang masih menunggu. Satu baris payments per order. */
export async function startPayment(orderId: string, metode: Metode): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: order } = await admin.from('orders').select('status').eq('id', orderId).maybeSingle();
  if (!order || order.status !== 'menunggu_bayar') return false;

  const { data: existing } = await admin.from('payments').select('id').eq('order_id', orderId).maybeSingle();
  if (existing) {
    const { error } = await admin.from('payments').update({ metode }).eq('id', existing.id);
    return !error;
  }
  const { error } = await admin.from('payments').insert({
    order_id: orderId,
    metode,
    borderpay_ref: `mock-${crypto.randomUUID()}`,
    status: 'menunggu_bayar',
  });
  return !error;
}

export async function getPaymentMetode(orderId: string): Promise<Metode | null> {
  const { data } = await getSupabaseAdmin().from('payments').select('metode').eq('order_id', orderId).maybeSingle();
  return isMetode(data?.metode) ? data.metode : null;
}
