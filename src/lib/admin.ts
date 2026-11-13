import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';
import { JENJANG, type Jenjang } from './catalog';

// Admin (PRD 7.10). Middleware sudah menolak non-admin untuk /admin/*, tapi setiap
// endpoint tulis memeriksa ulang (requireAdmin) sebelum memakai service role.
// Satu sumber harga: kolom products.harga. Katalog, keranjang, checkout membacanya ulang.

export async function requireAdmin(supabase: SupabaseClient, user: User | null): Promise<boolean> {
  if (!user) return false;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return data?.role === 'admin';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

// ---------- produk ----------

export interface AdminProduct {
  id: string;
  slug: string;
  judul: string;
  jenjang: Jenjang;
  bidang: string | null;
  deskripsi: string | null;
  format: string | null;
  harga: number | null;
  file_path: string | null;
  preview_path: string | null;
  is_visible: boolean;
  jurnal: string | null;
  sumber_guideline_url: string | null;
  checklist_kepatuhan: string[];
  created_at: string;
}

const COLS =
  'id, slug, judul, jenjang, bidang, deskripsi, format, harga, file_path, preview_path, is_visible, jurnal, sumber_guideline_url, checklist_kepatuhan, created_at';

export async function adminListProducts(): Promise<AdminProduct[]> {
  const { data } = await getSupabaseAdmin().from('products').select(COLS).order('created_at', { ascending: false });
  return ((data ?? []) as any[]).map((p) => ({ ...p, harga: p.harga === null ? null : Number(p.harga) }));
}

export async function adminGetProduct(id: string): Promise<AdminProduct | null> {
  if (!isUuid(id)) return null;
  const { data } = await getSupabaseAdmin().from('products').select(COLS).eq('id', id).maybeSingle();
  if (!data) return null;
  return { ...(data as any), harga: (data as any).harga === null ? null : Number((data as any).harga) };
}

export type ProductInput = Omit<AdminProduct, 'id' | 'file_path' | 'preview_path' | 'created_at'>;

const text = (v: FormDataEntryValue | null, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\r\n/g, '\n').trim().slice(0, max);
  return s || null;
};

/** Validasi form produk. Kembalikan pesan error per field, atau data bersih. */
export function parseProductForm(form: FormData): { ok: true; data: ProductInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const slug = (text(form.get('slug'), 81) ?? '').toLowerCase();
  const judul = text(form.get('judul'), 160);
  const jenjang = text(form.get('jenjang'), 20);
  const hargaRaw = (text(form.get('harga'), 20) ?? '').replace(/[.\s]/g, '').replace(/^rp/i, '');
  const jurnal = text(form.get('jurnal'), 160);
  const sumber = text(form.get('sumber_guideline_url'), 500);

  if (!SLUG_RE.test(slug)) errors.push('Slug wajib: huruf kecil, angka, tanda hubung.');
  if (!judul) errors.push('Judul wajib diisi.');
  if (!jenjang || !(JENJANG as readonly string[]).includes(jenjang)) errors.push('Pilih jenjang.');

  let harga: number | null = null;
  if (hargaRaw !== '') {
    if (!/^\d{1,9}$/.test(hargaRaw) || Number(hargaRaw) <= 0) errors.push('Harga harus angka rupiah utuh di atas 0, atau kosong (belum ditetapkan).');
    else harga = Number(hargaRaw);
  }
  if (sumber && !/^https:\/\/[^\s]+$/i.test(sumber)) errors.push('Tautan guideline harus diawali https://');
  if (jurnal && !sumber) errors.push('Produk per jurnal wajib menyertakan tautan guideline resmi.');

  const checklist = (typeof form.get('checklist_kepatuhan') === 'string' ? (form.get('checklist_kepatuhan') as string) : '')
    .split(/\r?\n/)
    .map((s) => s.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 60);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      slug,
      judul: judul!,
      jenjang: jenjang as Jenjang,
      bidang: text(form.get('bidang'), 120),
      deskripsi: text(form.get('deskripsi'), 5000),
      format: text(form.get('format'), 40),
      harga,
      is_visible: form.get('is_visible') === '1',
      jurnal,
      sumber_guideline_url: sumber,
      checklist_kepatuhan: checklist,
    },
  };
}

// ---------- file ----------

export const TEMPLATE_EXT = ['docx', 'doc', 'zip', 'tex', 'pdf'];
export const PREVIEW_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];
const LIMIT = { templates: 50 * 1024 * 1024, previews: 10 * 1024 * 1024 };

const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  zip: 'application/zip',
  tex: 'application/x-tex',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export type UploadResult = { ok: true; path: string | null } | { ok: false; error: string };

/** Unggah file (bila ada) ke bucket. path = null kalau tidak ada file yang dipilih. */
export async function uploadProductFile(
  bucket: 'templates' | 'previews',
  productId: string,
  file: FormDataEntryValue | null,
): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) return { ok: true, path: null };
  const allowed = bucket === 'templates' ? TEMPLATE_EXT : PREVIEW_EXT;
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const label = bucket === 'templates' ? 'File template' : 'Pratinjau';
  if (!allowed.includes(ext)) return { ok: false, error: `${label}: hanya ${allowed.join(', ')}.` };
  if (file.size > LIMIT[bucket]) return { ok: false, error: `${label}: maksimal ${LIMIT[bucket] / 1024 / 1024} MB.` };

  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file';
  const path = `${productId}/${Date.now().toString(36)}-${base}.${ext}`;
  const { error } = await getSupabaseAdmin()
    .storage.from(bucket)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: MIME[ext], upsert: false });
  if (error) {
    console.error(`[admin] gagal unggah ke ${bucket}:`, error.message);
    return { ok: false, error: `${label} gagal diunggah. Coba lagi.` };
  }
  return { ok: true, path };
}

export async function removeFiles(bucket: 'templates' | 'previews', paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await getSupabaseAdmin().storage.from(bucket).remove(list);
}

/** Signed URL singkat agar admin bisa mengecek file template yang terpasang. */
export async function adminTemplateUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await getSupabaseAdmin().storage.from('templates').createSignedUrl(path, 60, { download: true });
  return data?.signedUrl ?? null;
}

// ---------- order ----------

export interface AdminOrder {
  id: string;
  email: string;
  nama: string | null;
  total: number;
  status: 'menunggu_bayar' | 'lunas' | 'gagal' | 'kedaluwarsa';
  created_at: string;
  metode: string | null;
  items: { judul: string; slug: string; harga_saat_beli: number }[];
  unduhan: number;
}

export const ORDER_STATUS = ['menunggu_bayar', 'lunas', 'gagal', 'kedaluwarsa'] as const;

export interface OrderQuery {
  q?: string;
  status?: (typeof ORDER_STATUS)[number];
}

export function parseOrderQuery(params: URLSearchParams): OrderQuery {
  const q = (params.get('q') ?? '').replace(/[,()%*\\"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  const s = params.get('status') ?? '';
  return {
    q: q || undefined,
    status: (ORDER_STATUS as readonly string[]).includes(s) ? (s as OrderQuery['status']) : undefined,
  };
}

/**
 * Daftar order (maks 100 terbaru) dengan cari per email pembeli atau judul/slug produk.
 * Pencarian dilakukan dengan mencari dulu user_id / product_id yang cocok, lalu memfilter order.
 */
export async function adminListOrders(query: OrderQuery): Promise<AdminOrder[]> {
  const admin = getSupabaseAdmin();
  let orderIds: string[] | null = null;
  let userIds: string[] | null = null;

  if (query.q) {
    // "_" dibiarkan (wildcard 1 karakter, tidak berbahaya); karakter sintaks filter sudah dibuang di parseOrderQuery.
    const like = `%${query.q}%`;
    const [{ data: users }, { data: prods }] = await Promise.all([
      admin.from('profiles').select('id').ilike('email', like).limit(200),
      admin.from('products').select('id').or(`judul.ilike.${like},slug.ilike.${like}`).limit(200),
    ]);
    userIds = (users ?? []).map((u) => u.id as string);
    const prodIds = (prods ?? []).map((p) => p.id as string);
    if (prodIds.length) {
      const { data: items } = await admin.from('order_items').select('order_id').in('product_id', prodIds).limit(1000);
      orderIds = [...new Set((items ?? []).map((i) => i.order_id as string))];
    } else orderIds = [];
    if (userIds.length === 0 && orderIds.length === 0) return [];
  }

  let req = admin
    .from('orders')
    .select('id, user_id, total, status, created_at, profiles(email, nama), order_items(harga_saat_beli, products(judul, slug)), payments(metode), downloads(id)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (query.status) req = req.eq('status', query.status);
  if (query.q) {
    const parts: string[] = [];
    if (userIds && userIds.length) parts.push(`user_id.in.(${userIds.join(',')})`);
    if (orderIds && orderIds.length) parts.push(`id.in.(${orderIds.join(',')})`);
    req = req.or(parts.join(','));
  }
  const { data, error } = await req;
  if (error) {
    console.error('[admin] gagal baca order:', error.message);
    return [];
  }
  return (data ?? []).map((o: any) => ({
    id: o.id,
    email: o.profiles?.email ?? '(akun terhapus)',
    nama: o.profiles?.nama ?? null,
    total: Number(o.total),
    status: o.status,
    created_at: o.created_at,
    metode: (o.payments ?? [])[0]?.metode ?? null,
    items: (o.order_items ?? []).map((i: any) => ({
      judul: i.products?.judul ?? 'Template',
      slug: i.products?.slug ?? '',
      harga_saat_beli: Number(i.harga_saat_beli),
    })),
    unduhan: (o.downloads ?? []).length,
  }));
}
