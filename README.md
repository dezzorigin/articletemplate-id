# ArticleTemplate.id — aplikasi web

Toko template artikel + modul konsultasi (dibangun sekaligus; PRD v3.0 ada di
paket delegasi tim, bukan di repo — ringkasan eksekusi di `docs/FRAMEWORK.md`).

## Stack

- **Astro** (halaman server-rendered) — adapter Node (standalone)
- **Coolify** — hosting lewat Docker (domain/Cloudflare DNS diurus belakangan)
- **Supabase self-hosted di Coolify** — Postgres + Auth + Storage (service `supabase-kfuuqefxogdl5q4bam7t93vu`, project Coolify "ArticleTemplate.id"; tidak pernah pause, tanpa keepalive)
- **BorderPay** — checkout QRIS/VA (mode test dulu, merchant menyusul)

## Struktur

- `src/pages/` — Beranda, `/templates`, `/keranjang`, `/checkout`,
  `/konsultasi`, `/akun`, `/admin`, `/api/health`,
  `/api/webhook-borderpay` (skeleton 501 — BorderPay DITUNDA; skema signature
  dikonfirmasi dari dok merchant saat akun aktif, tidak ditebak)
- `src/lib/env.ts` — baca env runtime, gagal jelas bila wajib kosong
- `src/lib/supabase.ts` — `getSupabase()` (anon + RLS), `getSupabaseAdmin()` (service role, server saja)
- `src/lib/money.ts` — satu-satunya format harga + hitung total
- `docs/FRAMEWORK.md`, `docs/CHECKLIST.md` — rencana kerja + checklist uji
- `supabase/schema.sql` — skema + RLS + seed placeholder (jalankan sekali),
  lalu `supabase/migrations/` (wajib: `20261113_harden_rls.sql` +
  `20261113_products_compliance_columns.sql` — jangan lewati, skema saja
  masih berisi policy lama)

## Placeholder yang masih menunggu (bukan bug)

- Harga template: TBD di semua tempat (produk seed `harga = NULL`,
  `is_visible = false` — tidak tampil/bisa dibeli sampai diisi admin).
- Portofolio Nizam: belum ada datanya — halaman kredibilitas memakai kalimat
  umum tanpa angka.
- Layanan konsultasi: struktur dibangun, `is_visible = false` — pintu
  booking tertutup sampai Nizam mengonfirmasi layanan + harga + jadwal.

## Menjalankan lokal

```bash
npm install
cp .env.example .env   # lalu isi nilai Supabase self-hosted (dari Environment Variables aplikasi Coolify)
npm run dev
```

## Setup Supabase self-hosted (sekali, saat service dibuat)

Backend kanonis = Supabase self-hosted di Coolify (service
`supabase-kfuuqefxogdl5q4bam7t93vu` dalam project Coolify "ArticleTemplate.id").
URL + kunci diambil dari Environment Variables aplikasi Coolify — jangan isi
dari dashboard Supabase Cloud.

1. Coolify → project "ArticleTemplate.id" → service Supabase → pastikan jalan.
2. SQL Editor di dashboard Supabase self-hosted → tempel `supabase/schema.sql` → Run,
   lalu tempel `supabase/migrations/20261113_harden_rls.sql` dan
   `supabase/migrations/20261113_products_compliance_columns.sql` → Run.
   Jangan lewati migrasi: skema saja masih berisi policy lama.
3. Storage → buat bucket `templates` (private) dan `previews` (public).
4. Authentication → aktifkan Email + Google login.
5. Isi `.env` dari Environment Variables aplikasi Coolify (URL Kong + anon key +
   service role key). Service role key HANYA di server — tidak pernah ke repo/chat.
6. Project Supabase Cloud `azazbeufwmkaiajosunh` (Nabil, dipulihkan 16 Nov 2026,
   ACTIVE_HEALTHY) adalah CADANGAN, bukan backend kanonis. Workflow keepalive
   yang dulu menjaganya sudah DIHAPUS dari repo 16 Nov 2026 (keputusan Nabil);
   bila project cadangan pause, pulihkan manual lewat dashboard Supabase.

## Deploy ke Coolify

1. Coolify -> New Resource -> repo GitHub ini, build pack **Dockerfile** (sudah ada di root).
2. Port **4321**. Health check path `/api/health`.
3. Environment Variables (Runtime) - isi semua dari `.env.example`:
   `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (BorderPay menyusul). Nilai rahasia hanya di dashboard Coolify.
4. Domain + DNS: `articletemplate.id` + `www` sudah mengarah ke Coolify sejak
   16 Nov 2026 (A @ + A www → IP VPS, DNS only) dan terpasang di aplikasi Coolify.

Uji image lokal (butuh Docker): `docker build -t articletemplate .` lalu
`docker run -p 4321:4321 --env-file .env articletemplate`.
Tanpa Docker: `npm run build && node dist/server/entry.mjs`.

> Jangan taruh folder kerja di path yang mengandung `#` (Vite gagal build).

## Yang belum bisa jalan tanpa akses berikut

- Akses ke project Coolify "ArticleTemplate.id" (service Supabase + aplikasi) — akses utama untuk URL + kunci backend.
- Akun merchant BorderPay — sebelum transaksi uang asli (mode test dulu).
- Domainesia — invoice `articletemplate.id` #2367425 LUNAS 26 Okt 2026; domain
  aktif sampai 26 Okt 2027.
