import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';
import { expireIfStale } from './payments';

// Unduhan diotorisasi di server SETIAP permintaan: login + order milik user + status lunas + produk ada di order.
// File penuh ada di bucket private 'templates'; yang keluar hanya signed URL berumur pendek.

export const SIGNED_URL_TTL_S = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DownloadResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'tidak-valid' | 'tidak-berhak' | 'belum-lunas' | 'file-belum-ada' | 'gagal' };

export interface MyOrder {
  id: string;
  total: number;
  status: 'menunggu_bayar' | 'lunas' | 'gagal' | 'kedaluwarsa';
  created_at: string;
  items: { product_id: string; judul: string; harga_saat_beli: number; bisa_unduh: boolean }[];
}

/**
 * Riwayat order milik user. Order dibaca lewat klien sesi (RLS: hanya milik sendiri).
 * Judul/file produk dibaca lewat service role karena RLS products menyembunyikan produk
 * yang is_visible=false; pembeli tetap berhak atas template yang sudah dibelinya.
 */
export async function listMyOrders(supabase: SupabaseClient): Promise<MyOrder[]> {
  const { data } = await supabase
    .from('orders')
    .select('id, total, status, created_at, order_items(product_id, harga_saat_beli)')
    .order('created_at', { ascending: false })
    .limit(50);
  const orders = data ?? [];
  // Kedaluwarsakan order yang lewat masa berlaku saat daftar dimuat — konsisten
  // dengan halaman status order (sebelumnya hanya halaman itu yang memanggil
  // expireIfStale, sehingga dashboard bisa menampilkan `menunggu_bayar` basi).
  for (const o of orders as any[]) {
    if (o.status === 'menunggu_bayar') o.status = await expireIfStale(o.id, o.created_at, o.status);
  }
  const productIds = [...new Set(orders.flatMap((o: any) => (o.order_items ?? []).map((i: any) => i.product_id)))];
  const info = new Map<string, { judul: string; file_path: string | null }>();
  if (productIds.length) {
    const { data: prods } = await getSupabaseAdmin().from('products').select('id, judul, file_path').in('id', productIds);
    for (const p of prods ?? []) info.set(p.id, { judul: p.judul, file_path: p.file_path });
  }
  return orders.map((o: any) => ({
    id: o.id,
    total: Number(o.total),
    status: o.status,
    created_at: o.created_at,
    items: (o.order_items ?? []).map((i: any) => ({
      product_id: i.product_id,
      judul: info.get(i.product_id)?.judul ?? 'Template',
      harga_saat_beli: Number(i.harga_saat_beli),
      bisa_unduh: o.status === 'lunas' && !!info.get(i.product_id)?.file_path,
    })),
  }));
}

export async function authorizeDownload(userId: string, orderId: string, productId: string): Promise<DownloadResult> {
  if (!UUID_RE.test(orderId) || !UUID_RE.test(productId)) return { ok: false, reason: 'tidak-valid' };
  const admin = getSupabaseAdmin();

  const { data: order } = await admin.from('orders').select('id, user_id, status').eq('id', orderId).maybeSingle();
  // Order orang lain diperlakukan sama dengan tidak ada (jangan bocorkan keberadaan).
  if (!order || order.user_id !== userId) return { ok: false, reason: 'tidak-berhak' };
  if (order.status !== 'lunas') return { ok: false, reason: 'belum-lunas' };

  const { data: item } = await admin
    .from('order_items')
    .select('product_id')
    .eq('order_id', orderId)
    .eq('product_id', productId)
    .maybeSingle();
  if (!item) return { ok: false, reason: 'tidak-berhak' };

  const { data: product } = await admin.from('products').select('file_path').eq('id', productId).maybeSingle();
  if (!product?.file_path) return { ok: false, reason: 'file-belum-ada' };

  const { data: signed, error } = await admin.storage
    .from('templates')
    .createSignedUrl(product.file_path as string, SIGNED_URL_TTL_S, { download: true });
  if (error || !signed?.signedUrl) {
    console.error('[download] gagal membuat signed URL:', error?.message);
    // Alasan dibedakan dari 'file-belum-ada': file-nya ada, yang gagal adalah
    // pembuatan tautan (mis. Storage bermasalah) — jangan menyesatkan pembeli.
    return { ok: false, reason: 'gagal' };
  }

  const { error: logErr } = await admin
    .from('downloads')
    .insert({ user_id: userId, product_id: productId, order_id: orderId });
  if (logErr) {
    console.error('[download] gagal mencatat unduhan:', logErr.message);
    return { ok: false, reason: 'gagal' };
  }
  return { ok: true, url: signed.signedUrl };
}
