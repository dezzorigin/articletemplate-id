import type { AstroCookies } from 'astro';
import { getSupabase } from './supabase';
import { cartTotal, isPurchasable } from './money';
import type { Product } from './catalog';

// Keranjang = daftar slug di cookie httpOnly. Qty selalu 1 per produk digital.
// Harga TIDAK disimpan di cookie: selalu dibaca ulang dari database,
// jadi total keranjang = total checkout = harga produk saat ini.
const COOKIE = 'cart';
const MAX_ITEMS = 20;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function readCart(cookies: AstroCookies): string[] {
  const raw = cookies.get(COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const clean = parsed.filter((s): s is string => typeof s === 'string' && SLUG_RE.test(s));
    return [...new Set(clean)].slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function writeCart(cookies: AstroCookies, slugs: string[]): void {
  const unique = [...new Set(slugs)].slice(0, MAX_ITEMS);
  if (unique.length === 0) {
    cookies.delete(COOKIE, { path: '/' });
    return;
  }
  cookies.set(COOKIE, JSON.stringify(unique), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

export interface CartLine {
  product: Product;
  buyable: boolean;
}

export interface CartView {
  lines: CartLine[];
  total: number;
  /** Slug di cookie yang sudah tidak ada / tidak ditampilkan lagi. */
  missing: string[];
}

/** Bangun tampilan keranjang dari database. Item tanpa harga final tidak ikut total. */
export async function loadCart(slugs: string[]): Promise<CartView> {
  if (slugs.length === 0) return { lines: [], total: 0, missing: [] };
  const { data } = await getSupabase()
    .from('products')
    .select('id, slug, judul, jenjang, bidang, deskripsi, format, harga, preview_path, jurnal, sumber_guideline_url, checklist_kepatuhan')
    .in('slug', slugs)
    .eq('is_visible', true);
  const found = new Map(((data ?? []) as Product[]).map((p) => [p.slug, p]));
  const lines: CartLine[] = [];
  const missing: string[] = [];
  for (const slug of slugs) {
    const product = found.get(slug);
    if (!product) missing.push(slug);
    else lines.push({ product, buyable: isPurchasable(product.harga) });
  }
  const total = cartTotal(lines.filter((l) => l.buyable).map((l) => ({ harga: l.product.harga })));
  return { lines, total, missing };
}
