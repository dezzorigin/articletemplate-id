import { getSupabaseAdmin } from './supabase';
import { cartTotal, isPurchasable } from './money';

// Penulisan orders/order_items HANYA lewat service role (RLS: pembeli cuma baca).
// Harga selalu dibaca ulang dari DB di sini, jangan percaya angka dari form/cookie.

export type OrderResult =
  | { ok: true; orderId: string; total: number }
  | { ok: false; reason: 'kosong' | 'tidak-ada-harga' | 'gagal' };

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

/** Buat order + order_items dari daftar slug. Item tanpa harga final diabaikan. */
export async function createOrder(userId: string, slugs: string[]): Promise<OrderResult> {
  if (slugs.length === 0) return { ok: false, reason: 'kosong' };
  const admin = getSupabaseAdmin();

  const { data: products, error: readErr } = await admin
    .from('products')
    .select('id, slug, harga')
    .in('slug', slugs)
    .eq('is_visible', true);
  if (readErr) {
    console.error('[orders] gagal baca produk:', readErr.message);
    return { ok: false, reason: 'gagal' };
  }

  const buyable = (products ?? []).filter((p) => isPurchasable(p.harga as number | null));
  if (buyable.length === 0) return { ok: false, reason: 'tidak-ada-harga' };

  const total = cartTotal(buyable.map((p) => ({ harga: p.harga as number })));

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

export interface OrderView {
  id: string;
  total: number;
  status: 'menunggu_bayar' | 'lunas' | 'gagal' | 'kedaluwarsa';
  created_at: string;
  items: { judul: string; harga_saat_beli: number }[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Baca order untuk halaman status. UUID acak = kapabilitas; hanya status & ringkasan, bukan file. */
export async function getOrderView(id: string): Promise<OrderView | null> {
  if (!UUID_RE.test(id)) return null;
  const { data } = await getSupabaseAdmin()
    .from('orders')
    .select('id, total, status, created_at, order_items(harga_saat_beli, products(judul))')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const items = ((data as any).order_items ?? []).map((i: any) => ({
    judul: i.products?.judul ?? 'Template',
    harga_saat_beli: Number(i.harga_saat_beli),
  }));
  return {
    id: data.id as string,
    total: Number(data.total),
    status: data.status as OrderView['status'],
    created_at: data.created_at as string,
    items,
  };
}
