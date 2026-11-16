import { getSupabase, getSupabaseAdmin } from './supabase';

// Kelola konten (PRD §7.10): teks halaman yang bisa diubah admin tanpa edit kode.
// Model: satu baris per kunci di tabel `site_content` (lihat migrasi
// 20261116_site_content.sql). Halaman publik membaca dari DB dengan fallback
// ke teks bawaan bila baris belum ada — jadi halaman tetap tampil persis
// seperti sekarang sebelum admin mengubah apa pun.
// Isi HANYA teks polos (tanpa HTML): halaman merendernya sebagai teks, jadi
// tidak ada risiko injeksi markup dari admin.

/** Kunci konten yang bisa diubah admin + labelnya. Daftar ini yang menentukan
 *  kunci mana yang diterima form admin — kunci lain ditolak. */
export const CONTENT_KEYS = {
  'beranda.intro': 'Paragraf pembuka Beranda',
  'tentang.intro': 'Paragraf pembuka Tentang kami',
  'bantuan.kontak': 'Bagian Kontak di Bantuan',
} as const;
export type ContentKey = keyof typeof CONTENT_KEYS;

export const CONTENT_BODY_MAX = 5000;

/** Teks bawaan tiap kunci — HARUS sama persis dengan teks yang sekarang
 *  hardcode di halaman. Dipakai sebagai fallback dan sebagai isian awal
 *  form admin bila baris belum ada di DB. */
export const DEFAULT_CONTENT: Record<ContentKey, string> = {
  'beranda.intro':
    'Template yang sudah disesuaikan dengan jenjang target jurnalmu, lengkap dengan panduan pengisian dan checklist kepatuhan format. Pilih, bayar, unduh, lalu unduh ulang kapan saja dari akunmu.',
  'tentang.intro':
    'ArticleTemplate.id menjual template artikel untuk peneliti. Yang kami jual adalah kepastian format: tiap template berisi file template, panduan pengisian, dan checklist kepatuhan terhadap author guidelines jurnal target.',
  'bantuan.kontak':
    'Kanal bantuan resmi akan diumumkan di halaman ini sebelum penjualan dibuka. Sampai saat itu, pembelian belum bisa dilakukan.',
};

export function isContentKey(v: unknown): v is ContentKey {
  return typeof v === 'string' && v in CONTENT_KEYS;
}

/** Baca isi konten; fallback ke teks bawaan bila baris belum ada / kosong / gagal baca. */
export async function getContent(key: ContentKey, fallback?: string): Promise<string> {
  const fb = fallback ?? DEFAULT_CONTENT[key];
  try {
    const { data } = await getSupabase()
      .from('site_content')
      .select('body')
      .eq('key', key)
      .maybeSingle();
    const body = (data as { body?: unknown } | null)?.body;
    return typeof body === 'string' && body.trim() !== '' ? body : fb;
  } catch {
    return fb;
  }
}

export interface ContentRow {
  key: ContentKey;
  body: string;
  updated_at: string;
}

/** Daftar semua konten untuk admin (service role). Hanya kunci yang dikenal. */
export async function listContent(): Promise<ContentRow[]> {
  const { data } = await getSupabaseAdmin()
    .from('site_content')
    .select('key, body, updated_at')
    .order('key');
  return ((data ?? []) as any[])
    .filter((r) => isContentKey(r.key))
    .map((r) => ({ key: r.key as ContentKey, body: String(r.body ?? ''), updated_at: String(r.updated_at ?? '') }));
}

/** Validasi form konten admin. */
export function parseContentForm(
  form: FormData,
): { ok: true; data: { key: ContentKey; body: string } } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const key = form.get('key');
  const raw = typeof form.get('body') === 'string' ? (form.get('body') as string) : '';
  const body = raw.replace(/\r\n/g, '\n').trim();

  if (!isContentKey(key)) errors.push('Kunci konten tidak dikenal.');
  if (!body) errors.push('Isi tidak boleh kosong.');
  else if (body.length > CONTENT_BODY_MAX) errors.push(`Isi maksimal ${CONTENT_BODY_MAX} karakter.`);

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { key: key as ContentKey, body } };
}

/** Simpan (upsert) satu kunci konten. false bila gagal tulis ke DB. */
export async function saveContent(key: ContentKey, body: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from('site_content')
    .upsert({ key, body, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) {
    console.error('[konten] gagal simpan', key, error.message);
    return false;
  }
  return true;
}
