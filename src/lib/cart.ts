import type { AstroCookies } from 'astro';
import { getSupabase } from './supabase';
import { cartTotal, isPurchasable } from './money';
import type { Product } from './catalog';

// Keranjang = daftar item {slug, qty} di cookie httpOnly. Qty > 1 DIIZINKAN:
// produk digital boleh dibeli lebih dari satu (mis. untuk tim/kelas); tiap
// unit ditagih penuh, dan checkout mencatat satu baris order_items per unit
// (lihat src/lib/orders.ts). Tidak ada alasan bisnis yang melarang qty > 1.
// Harga TIDAK disimpan di cookie: selalu dibaca ulang dari database,
// jadi total keranjang = total checkout = harga produk saat ini.
const COOKIE = 'cart';
const MAX_ITEMS = 20;
/** Jumlah maksimum per produk (batas kewajaran, bukan batas bisnis). */
export const MAX_QTY = 99;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

export interface CartItem {
  slug: string;
  qty: number;
}

/** Normalisasi satu item: slug valid + qty bilangan bulat 1..MAX_QTY.
 *  String polos (format cookie lama) dibaca sebagai qty 1. */
function cleanItem(v: unknown): CartItem | null {
  if (typeof v === 'string') return SLUG_RE.test(v) ? { slug: v, qty: 1 } : null;
  if (v && typeof v === 'object') {
    const o = v as { slug?: unknown; qty?: unknown };
    if (typeof o.slug !== 'string' || !SLUG_RE.test(o.slug)) return null;
    const q = typeof o.qty === 'number' && Number.isFinite(o.qty) ? Math.floor(o.qty) : 1;
    return { slug: o.slug, qty: Math.min(Math.max(q, 1), MAX_QTY) };
  }
  return null;
}

function dedupeItems(items: CartItem[]): CartItem[] {
  const kept: CartItem[] = [];
  for (const item of items) {
    if (!kept.some((i) => i.slug === item.slug)) kept.push(item);
  }
  return kept.slice(0, MAX_ITEMS);
}

/** Baca keranjang sebagai item {slug, qty}. Format cookie lama (array
 *  string) tetap dibaca sebagai qty 1, jadi cookie lama tidak rusak. */
export function readCartItems(cookies: AstroCookies): CartItem[] {
  const raw = cookies.get(COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: CartItem[] = [];
    for (const v of parsed) {
      const item = cleanItem(v);
      if (item) items.push(item);
    }
    return dedupeItems(items);
  } catch {
    return [];
  }
}

/** Slug keranjang, diulang per jumlah unit (qty). Dipakai checkout/buat:
 *  createOrder menghitung kemunculan tiap slug sebagai jumlah unit, jadi
 *  total checkout mengikuti jumlah di keranjang. */
export function readCart(cookies: AstroCookies): string[] {
  return readCartItems(cookies).flatMap((i) => Array<string>(i.qty).fill(i.slug));
}

function setCartCookie(cookies: AstroCookies, items: CartItem[]): void {
  if (items.length === 0) {
    cookies.delete(COOKIE, { path: '/' });
    return;
  }
  cookies.set(COOKIE, JSON.stringify(items), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Simpan keranjang sebagai item {slug, qty} (mengganti isi lama). */
export function writeCartItems(cookies: AstroCookies, items: CartItem[]): void {
  const clean: CartItem[] = [];
  for (const v of items) {
    const item = cleanItem(v);
    if (item) clean.push(item);
  }
  setCartCookie(cookies, dedupeItems(clean));
}

/** Kompat: ganti isi keranjang dengan slug-slug ini, masing-masing qty 1.
 *  Dipakai "Beli sekarang" (satu produk) dan pengosongan keranjang. */
export function writeCart(cookies: AstroCookies, slugs: string[]): void {
  writeCartItems(
    cookies,
    slugs.map((s) => ({ slug: s, qty: 1 })),
  );
}

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

export interface CartLine {
  product: Product;
  /** Jumlah unit produk ini. */
  qty: number;
  /** Harga satuan x qty (0 bila produk tidak bisa dibeli). */
  subtotal: number;
  buyable: boolean;
}

export interface CartView {
  lines: CartLine[];
  total: number;
  /** Jumlah unit yang bisa dibeli (sum qty baris buyable). */
  totalQty: number;
  /** Slug di cookie yang sudah tidak ada / tidak ditampilkan lagi. */
  missing: string[];
}

/** Bangun tampilan keranjang dari database. Item tanpa harga final tidak ikut total. */
export async function loadCart(slugs: string[]): Promise<CartView> {
  if (slugs.length === 0) return { lines: [], total: 0, totalQty: 0, missing: [] };
  // Kemunculan tiap slug = jumlah unit (lihat readCart).
  const qtyBySlug = new Map<string, number>();
  for (const s of slugs) qtyBySlug.set(s, (qtyBySlug.get(s) ?? 0) + 1);
  const unique = [...qtyBySlug.keys()];
  const { data } = await getSupabase()
    .from('products')
    .select('id, slug, judul, jenjang, bidang, deskripsi, format, isi_template, harga, preview_path, jurnal, sumber_guideline_url, checklist_kepatuhan')
    .in('slug', unique)
    .eq('is_visible', true);
  const found = new Map(((data ?? []) as Product[]).map((p) => [p.slug, p]));
  const lines: CartLine[] = [];
  const missing: string[] = [];
  for (const slug of unique) {
    const product = found.get(slug);
    if (!product) {
      missing.push(slug);
      continue;
    }
    const qty = qtyBySlug.get(slug) ?? 1;
    const buyable = isPurchasable(product.harga);
    lines.push({
      product,
      qty,
      buyable,
      subtotal: buyable ? Math.round(product.harga) * qty : 0,
    });
  }
  // Total = harga satuan x qty per baris (cartTotal tidak kenal qty, jadi
  // tiap unit dimasukkan satu entri — total tetap dihitung satu tempat).
  const total = cartTotal(
    lines.filter((l) => l.buyable).flatMap((l) => Array(l.qty).fill({ harga: l.product.harga })),
  );
  const totalQty = lines.filter((l) => l.buyable).reduce((n, l) => n + l.qty, 0);
  return { lines, total, totalQty, missing };
}
