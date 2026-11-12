import { getSupabase } from './supabase';
import { isPurchasable, type Price } from './money';

export const JENJANG = ['Q1', 'Q2', 'Q3', 'Q4', 'Sinta', 'Prosiding'] as const;
export type Jenjang = (typeof JENJANG)[number];

export const URUTAN = {
  terbaru: 'Terbaru',
  'harga-naik': 'Harga rendah ke tinggi',
  'harga-turun': 'Harga tinggi ke rendah',
} as const;
export type Urutan = keyof typeof URUTAN;

export interface Product {
  id: string;
  slug: string;
  judul: string;
  jenjang: Jenjang;
  bidang: string | null;
  deskripsi: string | null;
  format: string | null;
  harga: Price;
  preview_path: string | null;
  jurnal: string | null;
  sumber_guideline_url: string | null;
  checklist_kepatuhan: string[];
}

export interface CatalogQuery {
  jenjang?: Jenjang;
  q?: string;
  urut: Urutan;
}

/** Baca query string dengan daftar putih. Nilai di luar daftar diabaikan. */
export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const j = params.get('jenjang') ?? '';
  const u = params.get('urut') ?? '';
  // Buang karakter yang punya arti di sintaks filter PostgREST dan LIKE.
  const q = (params.get('q') ?? '').replace(/[,()%*\\_"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return {
    jenjang: (JENJANG as readonly string[]).includes(j) ? (j as Jenjang) : undefined,
    q: q || undefined,
    urut: u in URUTAN ? (u as Urutan) : 'terbaru',
  };
}

const COLUMNS =
  'id, slug, judul, jenjang, bidang, deskripsi, format, harga, preview_path, jurnal, sumber_guideline_url, checklist_kepatuhan';

/** Hanya produk is_visible (dijaga juga oleh RLS). Harga NULL tetap tampil tapi tidak bisa dibeli. */
export async function listProducts(
  query: CatalogQuery,
): Promise<{ products: Product[]; error: string | null }> {
  let req = getSupabase().from('products').select(COLUMNS).eq('is_visible', true);
  if (query.jenjang) req = req.eq('jenjang', query.jenjang);
  if (query.q) req = req.or(`judul.ilike.%${query.q}%,deskripsi.ilike.%${query.q}%`);
  if (query.urut === 'harga-naik') req = req.order('harga', { ascending: true, nullsFirst: false });
  else if (query.urut === 'harga-turun') req = req.order('harga', { ascending: false, nullsFirst: false });
  else req = req.order('created_at', { ascending: false });

  const { data, error } = await req;
  if (error) return { products: [], error: 'Katalog sedang tidak bisa dimuat. Coba lagi sebentar.' };
  return { products: (data ?? []) as Product[], error: null };
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** Satu produk by slug. null bila tidak ada / tidak visible / slug tidak valid. */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (!SLUG_RE.test(slug)) return null;
  const { data } = await getSupabase()
    .from('products')
    .select(COLUMNS)
    .eq('slug', slug)
    .eq('is_visible', true)
    .maybeSingle();
  return (data as Product | null) ?? null;
}

/** Produk terkait: jenjang lain atau bidang sama, maksimal 3. */
export async function relatedProducts(p: Product): Promise<Product[]> {
  const { data } = await getSupabase()
    .from('products')
    .select(COLUMNS)
    .eq('is_visible', true)
    .neq('id', p.id)
    .limit(3);
  return ((data ?? []) as Product[]).sort(
    (a, b) => Number(b.bidang === p.bidang && !!p.bidang) - Number(a.bidang === p.bidang && !!p.bidang),
  );
}

/** URL pratinjau PUBLIK dari bucket previews. File penuh ada di bucket private. */
export function previewUrl(path: string | null): string | null {
  if (!path) return null;
  return getSupabase().storage.from('previews').getPublicUrl(path).data.publicUrl;
}

export { isPurchasable };
