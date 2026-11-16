import { getSupabaseAdmin } from './supabase';
import { cartTotal, isPurchasable } from './money';
import { ORDER_TTL_MS, expireIfStale, getPaymentMetode, type Metode } from './payments';

// Penulisan orders/order_items HANYA lewat service role (RLS: pembeli cuma baca).
// Harga selalu dibaca ulang dari DB di sini, jangan percaya angka dari form/cookie.

export type OrderResult =
  | { ok: true; orderId: string; total: number }
  | { ok: false; reason: 'kosong' | 'tidak-ada-harga' | 'tanpa-file' | 'gagal' };

/**
 * Cari akun berdasarkan email; kalau belum ada, buat otomatis (checkout guest).
 * Akun otomatis tidak punya sandi: pembeli masuk lewat "lupa kata sandi".
 * Order menempel ke akun, tapi tanpa sesi tidak ada yang bisa mengunduh.
 */
export async function ensureBuyer(email: string, nama: string | null): Promise<string | null> {
  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: nama ? { nama } : {},
  });
  if (error || !data.user) {
    console.error('[orders] gagal membuat akun pembeli:', error?.message);
    return null;
  }
  return data.user.id;
}

/**
 * Buat order + order_items dari daftar slug. Item tanpa harga final diabaikan.
 * Dijalankan BERURUTAN per user (kunci dalam proses): dua POST /checkout/buat
 * bersamaan untuk user yang sama tidak bisa sama-sama lolos cek findReusableOrder
 * lalu sama-sama insert — yang kedua menemukan order hasil yang pertama dan
 * memakainya ulang. Berlaku satu instance Coolify (asumsi sama seperti rate
 * limit in-memory di src/lib/security.ts); tanpa migrasi DB.
 *
 * Catatan guard race level DB (evaluasi 16 Nov 2026, tindak lanjut audit):
 * - Unique partial index (user_id) WHERE status='menunggu_bayar' DITOLAK:
 *   createOrder sengaja membolehkan beberapa order menunggu_bayar berisi
 *   BERBEDA per user (hanya isi SAMA yang dipakai ulang) — index itu akan
 *   mematahkan checkout kedua yang sah dengan galat unik.
 * - Advisory lock Postgres (pg_advisory_xact_lock per user) butuh satu
 *   transaksi utuh lewat fungsi RPC — PostgREST tidak bisa menahan lock
 *   antar panggilan REST, dan fungsi itu belum bisa diuji tanpa akses DB,
 *   jadi TIDAK dibangun di PR ini (evaluasi lengkap di body PR). Risiko
 *   sisa hanya bila Coolify dijalankan multi-instance; sampai saat itu
 *   kunci dalam proses di bawah sudah cukup.
 */
const orderTails = new Map<string, Promise<void>>();

export async function createOrder(userId: string, slugs: string[]): Promise<OrderResult> {
  const prev = orderTails.get(userId) ?? Promise.resolve();
  let done!: () => void;
  const mine = new Promise<void>((resolve) => {
    done = resolve;
  });
  const tail = prev.then(() => mine);
  orderTails.set(userId, tail);
  try {
    await prev;
    return await createOrderInner(userId, slugs);
  } finally {
    done();
    if (orderTails.get(userId) === tail) orderTails.delete(userId);
  }
}

async function createOrderInner(userId: string, slugs: string[]): Promise<OrderResult> {
  if (slugs.length === 0) return { ok: false, reason: 'kosong' };
  const admin = getSupabaseAdmin();

  const { data: products, error: readErr } = await admin
    .from('products')
    .select('id, slug, harga, file_path')
    .in('slug', slugs)
    .eq('is_visible', true);
  if (readErr) {
    console.error('[orders] gagal baca produk:', readErr.message);
    return { ok: false, reason: 'gagal' };
  }

  const buyable = (products ?? []).filter((p) => isPurchasable(p.harga as number | null));
  if (buyable.length === 0) return { ok: false, reason: 'tidak-ada-harga' };

  // Jaring pengaman: produk tanpa file template TIDAK BOLEH dijual, lewat jalur
  // apa pun. Pembeli yang membayar produk tanpa file tidak akan pernah bisa
  // mengunduh (authorizeDownload mengembalikan 'file-belum-ada'), jadi order
  // ditolak utuh di sini — bukan dibuat sebagian tanpa item itu.
  const tanpaFile = buyable.filter((p) => !(p as any).file_path);
  if (tanpaFile.length > 0) {
    console.error(
      '[orders] tolak order: produk tanpa file:',
      tanpaFile.map((p) => p.slug as string).join(', '),
    );
    return { ok: false, reason: 'tanpa-file' };
  }

  const total = cartTotal(buyable.map((p) => ({ harga: p.harga as number })));

  // Re-checkout: pakai ulang order menunggu_bayar yang isinya sama (tidak membuat order ganda).
  const reused = await findReusableOrder(userId, buyable.map((p) => p.id as string), total);
  if (reused) return { ok: true, orderId: reused, total };

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({ user_id: userId, total, status: 'menunggu_bayar' })
    .select('id')
    .single();
  if (orderErr || !order) {
    console.error('[orders] gagal membuat order:', orderErr?.message);
    return { ok: false, reason: 'gagal' };
  }

  const { error: itemsErr } = await admin.from('order_items').insert(
    buyable.map((p) => ({
      order_id: order.id,
      product_id: p.id,
      harga_saat_beli: Math.round(p.harga as number),
    })),
  );
  if (itemsErr) {
    console.error('[orders] gagal membuat item order:', itemsErr.message);
    await admin.from('orders').delete().eq('id', order.id); // cascade ke order_items
    return { ok: false, reason: 'gagal' };
  }

  return { ok: true, orderId: order.id as string, total };
}

/** Order menunggu_bayar milik user dengan himpunan produk & total sama, belum kedaluwarsa. */
async function findReusableOrder(userId: string, productIds: string[], total: number): Promise<string | null> {
  const since = new Date(Date.now() - ORDER_TTL_MS).toISOString();
  const { data } = await getSupabaseAdmin()
    .from('orders')
    .select('id, total, order_items(product_id)')
    .eq('user_id', userId)
    .eq('status', 'menunggu_bayar')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10);
  const want = [...productIds].sort().join(',');
  for (const o of data ?? []) {
    const have = ((o as any).order_items ?? []).map((i: any) => i.product_id as string).sort().join(',');
    if (have === want && Number(o.total) === total) return o.id as string;
  }
  return null;
}

export interface OrderView {
  id: string;
  total: number;
  status: 'menunggu_bayar' | 'lunas' | 'gagal' | 'kedaluwarsa';
  created_at: string;
  metode: Metode | null;
  items: { product_id: string; judul: string; harga_saat_beli: number }[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Baca order untuk halaman status. UUID acak = kapabilitas; hanya status & ringkasan, bukan file. */
export async function getOrderView(id: string): Promise<OrderView | null> {
  if (!UUID_RE.test(id)) return null;
  const { data } = await getSupabaseAdmin()
    .from('orders')
    .select('id, total, status, created_at, order_items(product_id, harga_saat_beli, products(judul))')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const items = ((data as any).order_items ?? []).map((i: any) => ({
    product_id: i.product_id as string,
    judul: i.products?.judul ?? 'Template',
    harga_saat_beli: Number(i.harga_saat_beli),
  }));
  const status = await expireIfStale(data.id as string, data.created_at as string, data.status as OrderView['status']);
  return {
    id: data.id as string,
    total: Number(data.total),
    status,
    created_at: data.created_at as string,
    metode: await getPaymentMetode(data.id as string),
    items,
  };
}
