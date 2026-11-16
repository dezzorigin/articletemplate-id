# ArticleTemplate.id — aplikasi web

Toko template artikel + modul konsultasi (dibangun sekaligus, PRD `../prd.md`).

## Stack

- **Astro + React** (halaman + pulau interaktif) — adapter Node (standalone)
- **Coolify** — hosting lewat Docker (domain/Cloudflare DNS diurus belakangan)
- **Supabase Cloud** — Postgres + Auth + Storage (free tier + cron keepalive)
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
- `supabase/schema.sql` — skema + RLS + seed placeholder (jalankan sekali)
- `.github/workflows/keepalive.yml` — cron harian anti-pause Supabase free

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
cp .env.example .env   # lalu isi nilai Supabase
npm run dev
```

## Setup Supabase (sekali, saat project dibuat)

1. Buat project Supabase Cloud (region **Singapura**).
2. SQL Editor → tempel `supabase/schema.sql` → Run.
3. Storage → buat bucket `templates` (private) dan `previews` (public).
4. Authentication → aktifkan Email + Google login.
5. Isi `.env` (URL + anon key + service role key). Service role key HANYA
   di server — tidak pernah ke repo/chat.
6. GitHub repo → Secrets `SUPABASE_URL` + `SUPABASE_ANON_KEY` → workflow
   keepalive aktif otomatis tiap hari (10:00 WIB).

## Deploy ke Coolify

1. Coolify -> New Resource -> repo GitHub ini, build pack **Dockerfile** (sudah ada di root).
2. Port **4321**. Health check path `/api/health`.
3. Environment Variables (Runtime) - isi semua dari `.env.example`:
   `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (BorderPay menyusul). Nilai rahasia hanya di dashboard Coolify.
4. Domain + DNS Cloudflare diatur belakangan oleh tim.

Uji image lokal (butuh Docker): `docker build -t articletemplate .` lalu
`docker run -p 4321:4321 --env-file .env articletemplate`.
Tanpa Docker: `npm run build && node dist/server/entry.mjs`.

> Jangan taruh folder kerja di path yang mengandung `#` (Vite gagal build).

## Yang belum bisa jalan tanpa akses berikut

- Supabase Cloud (project + kunci) — akses utama yang diminta ke pemilik akun Supabase.
- Akun merchant BorderPay — sebelum transaksi uang asli (mode test dulu).
- Domainesia — verifikasi invoice `articletemplate.id` (Pending) + DNS nanti.
