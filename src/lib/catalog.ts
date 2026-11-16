import { getSupabase } from './supabase';
import { isPurchasable, type Price } from './money';

export const JENJANG = ['Q1', 'Q2', 'Q3', 'Q4', 'Sinta', 'Prosiding'] as const;
export type Jenjang = (typeof JENJANG)[number];

/** Urutan jenjang di katalog: Q1 -> Q2 -> Q3 -> Q4 -> Sinta -> Prosiding -> Paket Lengkap. */
export const JENJANG_ORDER = [...JENJANG, 'Paket'] as const;

/** Peringkat urutan jenjang (0 = pertama). Jenjang tak dikenal -> paling akhir. */
export function jenjangRank(jenjang: string | null | undefined): number {
  const i = (JENJANG_ORDER as readonly string[]).indexOf(jenjang ?? '');
  return i === -1 ? JENJANG_ORDER.length : i;
}

/** Urutkan daftar produk (atau apa pun yang punya jenjang) mengikuti JENJANG_ORDER. */
export function sortByJenjang<T extends { jenjang: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => jenjangRank(a.jenjang) - jenjangRank(b.jenjang));
}

/** Label ramah untuk kolom products.format ('docx' / 'zip' / ...). */
export function formatLabel(format: string | null | undefined): string | null {
  switch ((format ?? '').trim().toLowerCase()) {
    case 'docx':
      return 'Word (.docx)';
    case 'zip':
      return 'ZIP (.zip)';
    case 'latex':
      return 'LaTeX (.tex)';
    case 'docx+latex':
      return 'Word + LaTeX (.docx, .tex)';
    default:
      return format?.trim() ? format.trim() : null;
  }
}

export const URUTAN = {
  jenjang: 'Jenjang (Q1 ke Paket Lengkap)',
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
  /** Daftar isi produk ("yang didapat") — dari kolom products.isi_template. */
  isi_template: string[];
  harga: Price;
  preview_path: string | null;
  jurnal: string | null;
  sumber_guideline_url: string | null;
  checklist_kepatuhan: string[];
}

export interface CatalogQuery {
  jenjang?: Jenjang;
  /** Bidang produk (teks bebas, dicocokkan persis dengan nilai di DB). */
  bidang?: string;
  /** Jurnal target produk (teks bebas, dicocokkan persis dengan nilai di DB). */
  jurnal?: string;
  q?: string;
  urut: Urutan;
}

/** Bersihkan nilai filter teks bebas (bidang/jurnal/q): buang karakter yang
 *  punya arti di sintaks filter PostgREST dan LIKE. Nilai yang mengandung
 *  karakter itu tidak akan cocok persis — bisa diterima karena nilai facet
 *  berasal dari admin (bidang/jurnal umumnya huruf, angka, spasi, tanda hubung). */
const cleanFilterText = (v: string | null): string | undefined => {
  const s = (v ?? '').replace(/[,()%*\\_"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return s || undefined;
};

/** Baca query string dengan daftar putih. Nilai di luar daftar diabaikan. */
export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const j = params.get('jenjang') ?? '';
  const u = params.get('urut') ?? '';
  const q = cleanFilterText(params.get('q'));
  return {
    jenjang: (JENJANG as readonly string[]).includes(j) ? (j as Jenjang) : undefined,
    bidang: cleanFilterText(params.get('bidang')),
    jurnal: cleanFilterText(params.get('jurnal')),
    q,
    urut: u in URUTAN ? (u as Urutan) : 'jenjang',
  };
}

const COLUMNS =
  'id, slug, judul, jenjang, bidang, deskripsi, format, isi_template, harga, preview_path, jurnal, sumber_guideline_url, checklist_kepatuhan';

/** Hanya produk is_visible (dijaga juga oleh RLS). Harga NULL tetap tampil tapi tidak bisa dibeli. */
export async function listProducts(
  query: CatalogQuery,
): Promise<{ products: Product[]; error: string | null }> {
  let req = getSupabase().from('products').select(COLUMNS).eq('is_visible', true);
  if (query.jenjang) req = req.eq('jenjang', query.jenjang);
  if (query.bidang) req = req.eq('bidang', query.bidang);
  if (query.jurnal) req = req.eq('jurnal', query.jurnal);
  if (query.q) req = req.or(`judul.ilike.%${query.q}%,deskripsi.ilike.%${query.q}%`);
  if (query.urut === 'harga-naik') req = req.order('harga', { ascending: true, nullsFirst: false });
  else if (query.urut === 'harga-turun') req = req.order('harga', { ascending: false, nullsFirst: false });
  else req = req.order('created_at', { ascending: false });

  const { data, error } = await req;
  if (error) return { products: [], error: 'Katalog sedang tidak bisa dimuat. Coba lagi sebentar.' };
  const products = (data ?? []) as Product[];
  // Urutan default = urutan jenjang (Q1 -> ... -> Paket Lengkap), bukan
  // created_at: created_at tidak membedakan produk yang dibuat bersamaan,
  // jadi urutannya tampak acak. Diurutkan di sini karena PostgREST tidak
  // punya urutan kustom per jenjang.
  return { products: query.urut === 'jenjang' ? sortByJenjang(products) : products, error: null };
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
    (a, b) =>
      Number(b.bidang === p.bidang && !!p.bidang) - Number(a.bidang === p.bidang && !!p.bidang) ||
      jenjangRank(a.jenjang) - jenjangRank(b.jenjang),
  );
}

/** Nilai unik terurut (buang kosong/duplikat). Dipakai untuk daftar facet filter. */
export function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.map((v) => (v ?? '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'id'),
  );
}

/** Daftar bidang + jurnal yang dipakai produk tampil — opsi filter katalog.
 *  Kosong bila katalog kosong. Gagal baca DB -> daftar kosong (filter disembunyikan). */
export async function listCatalogFacets(): Promise<{ bidang: string[]; jurnal: string[] }> {
  const { data, error } = await getSupabase()
    .from('products')
    .select('bidang, jurnal')
    .eq('is_visible', true)
    .limit(500);
  if (error || !data) return { bidang: [], jurnal: [] };
  const rows = data as { bidang: string | null; jurnal: string | null }[];
  return {
    bidang: uniqueSorted(rows.map((r) => r.bidang)),
    jurnal: uniqueSorted(rows.map((r) => r.jurnal)),
  };
}

/** URL pratinjau PUBLIK dari bucket previews. File penuh ada di bucket private. */
export function previewUrl(path: string | null): string | null {
  if (!path) return null;
  return getSupabase().storage.from('previews').getPublicUrl(path).data.publicUrl;
}

export { isPurchasable };
