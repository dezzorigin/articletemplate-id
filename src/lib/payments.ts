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

// ---------- jejak pembayaran BorderPay (WES-17) ----------

export interface StoredBorderPayPayment {
  metode: Metode | null;
  /** ID pembayaran di BorderPay (kolom payments.borderpay_ref). */
  borderpayRef: string | null;
  /** Halaman bayar (kolom payments.pay_url — migrasi 20261116; undefined bila migrasi belum diterapkan). */
  payUrl: string | undefined;
  /** Kedaluwarsa kode bayar (kolom payments.pay_expires_at). */
  expiresAt: string | undefined;
}

/** Ref BorderPay asli (bukan `mock-...` dari simulasi dev). */
export function isRealBorderPayRef(ref: string | null | undefined): boolean {
  return !!ref && !ref.startsWith('mock-');
}

/**
 * Baca jejak pembayaran BorderPay satu order. select('*') disengaja: kolom
 * pay_url/pay_expires_at berasal dari migrasi 20261116 — bila migrasi belum
 * diterapkan di DB, select kolom eksplisit akan error dan halaman status ikut
 * rusak; dengan '*', kolom yang belum ada cukup terbaca undefined.
 */
export async function getBorderPayPayment(orderId: string): Promise<StoredBorderPayPayment | null> {
  const { data } = await getSupabaseAdmin().from('payments').select('*').eq('order_id', orderId).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    metode: isMetode(row.metode) ? (row.metode as Metode) : null,
    borderpayRef: typeof row.borderpay_ref === 'string' ? row.borderpay_ref : null,
    payUrl: typeof row.pay_url === 'string' && row.pay_url !== '' ? row.pay_url : undefined,
    expiresAt: typeof row.pay_expires_at === 'string' ? row.pay_expires_at : undefined,
  };
}

/**
 * Simpan jejak pembayaran BorderPay (satu baris payments per order).
 * Best-effort untuk kolom migrasi: bila update/insert dengan pay_url gagal
 * (migrasi belum diterapkan), ulangi tanpa kolom baru supaya borderpay_ref
 * tetap tersimpan — lalu kembalikan false agar pemanggil tahu tautan bayar
 * belum tersimpan dan menampilkan tombol buat-ulang.
 */
export async function startBorderPayPayment(
  orderId: string,
  metode: Metode,
  payment: { id: string; payUrl: string; expiresAt: string },
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: order } = await admin.from('orders').select('status').eq('id', orderId).maybeSingle();
  if (!order || order.status !== 'menunggu_bayar') return false;

  const full = {
    metode,
    borderpay_ref: payment.id,
    status: 'menunggu_bayar',
    pay_url: payment.payUrl,
    pay_expires_at: payment.expiresAt,
  };
  const minimal = {
    metode,
    borderpay_ref: payment.id,
    status: 'menunggu_bayar',
  };
  const { data: existing } = await admin.from('payments').select('id').eq('order_id', orderId).maybeSingle();
  if (existing) {
    const { error } = await admin.from('payments').update(full).eq('id', existing.id);
    if (error) {
      console.warn('[payments] kolom pay_url belum ada (migrasi 20261116 belum diterapkan?), simpan minimal:', error.message);
      const retry = await admin.from('payments').update(minimal).eq('id', existing.id);
      return !retry.error;
    }
    return true;
  }
  const { error } = await admin.from('payments').insert({ order_id: orderId, ...full });
  if (error) {
    console.warn('[payments] kolom pay_url belum ada (migrasi 20261116 belum diterapkan?), simpan minimal:', error.message);
    const retry = await admin.from('payments').insert({ order_id: orderId, ...minimal });
    return !retry.error;
  }
  return true;
}
