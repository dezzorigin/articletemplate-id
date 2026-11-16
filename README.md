# ArticleTemplate.id — aplikasi web

Toko template artikel + modul konsultasi (dibangun sekaligus; PRD v3.0 ada di
paket delegasi tim, bukan di repo — ringkasan eksekusi di `docs/FRAMEWORK.md`).

## Stack

- **Astro** (halaman server-rendered) — adapter Node (standalone)
- **Coolify** — hosting lewat Docker (domain/Cloudflare DNS diurus belakangan)
- **Supabase self-hosted di Coolify** — Postgres + Auth + Storage (service `supabase-kfuuqefxogdl5q4bam7t93vu`, project Coolify "ArticleTemplate.id"; tidak pernah pause, tanpa keepalive)
- **BorderPay** — checkout QRIS/VA/E-Wallet (WES-17, 16 Nov 2026; mode test dulu, live setelah KYC)

## Struktur

- `src/pages/` — Beranda, `/templates`, `/harga`, `/keranjang`, `/checkout`,
  `/konsultasi`, `/akun`, `/admin`, `/api/health`,
  `/api/webhook-borderpay` (handler nyata WES-17 — verifikasi token
  `x-borderpay-token`, petakan payment.paid/expired/failed ke status order; lihat "BorderPay" di bawah)
- `src/lib/borderpay.ts` — klien REST BorderPay + verifikasi signature webhook
- `src/lib/env.ts` — baca env runtime, gagal jelas bila wajib kosong
- `src/lib/supabase.ts` — `getSupabase()` (anon + RLS), `getSupabaseAdmin()` (service role, server saja)
- `src/lib/money.ts` — satu-satunya format harga + hitung total
- `src/lib/content.ts` — kelola konten halaman (`site_content`, kunci `beranda.intro` / `tentang.intro` / `bantuan.kontak`)
- `tests/` — tes unit `node:test` (`npm test` menjalankan `tests/` + `scripts/test-borderpay.mjs`)
- `docs/FRAMEWORK.md`, `docs/CHECKLIST.md` — rencana kerja + checklist uji
- `supabase/schema.sql` — skema + RLS + seed placeholder (jalankan sekali),
  lalu `supabase/migrations/` (wajib: `20261113_harden_rls.sql` +
  `20261113_products_compliance_columns.sql` +
  `20261116_borderpay_pay_url.sql` + `20261116_site_content.sql` +
  `20261116_seed_harga.sql` — jangan lewati, skema saja
  masih berisi policy lama)

## Placeholder yang masih menunggu (bukan bug)

- Harga template: SUDAH final (ditetapkan Nabil 16 Nov 2026, PR #7) —
  seed di `supabase/migrations/20261116_seed_harga.sql` (Q1 Rp249.000,
  Q2 Rp199.000, Q3 Rp149.000, Q4 Rp99.000, Sinta Rp79.000, Prosiding
  Rp59.000, Paket Lengkap Rp549.000; halaman `/harga` membaca dari
  `products.harga`, bukan angka karangan). Produk tetap
  `is_visible = false` sampai file template + pratinjau diunggah admin —
  tidak bisa dibeli sebelum itu.
- Portofolio Nizam: belum ada datanya — halaman kredibilitas memakai kalimat
  umum tanpa angka.
- Layanan konsultasi: struktur dibangun, `is_visible = false` — pintu
  booking tertutup sampai Nizam mengonfirmasi layanan + harga + jadwal.

## Menjalankan lokal

```bash
npm install
cp .env.example .env   # lalu isi nilai Supabase self-hosted (dari Environment Variables aplikasi Coolify)
npm run dev
npm test               # tes unit (node:test) + scripts/test-borderpay.mjs
```

## Setup Supabase self-hosted (sekali, saat service dibuat)

Backend kanonis = Supabase self-hosted di Coolify (service
`supabase-kfuuqefxogdl5q4bam7t93vu` dalam project Coolify "ArticleTemplate.id").
URL + kunci diambil dari Environment Variables aplikasi Coolify — jangan isi
dari dashboard Supabase Cloud.

1. Coolify → project "ArticleTemplate.id" → service Supabase → pastikan jalan.
2. SQL Editor di dashboard Supabase self-hosted → tempel `supabase/schema.sql` → Run,
   lalu tempel `supabase/migrations/20261113_harden_rls.sql`,
   `supabase/migrations/20261113_products_compliance_columns.sql`,
   `supabase/migrations/20261116_borderpay_pay_url.sql`,
   `supabase/migrations/20261116_site_content.sql`, dan
   `supabase/migrations/20261116_seed_harga.sql` → Run.
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
   `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `BORDERPAY_API_KEY`, `BORDERPAY_BASE_URL`, `BORDERPAY_WEBHOOK_TOKEN`.
   Nilai rahasia hanya di dashboard Coolify.

## BorderPay (WES-17)

Alur: pembeli buat pesanan → pilih QRIS/VA/E-Wallet di halaman status
(untuk VA/E-Wallet wajib pilih bank/penyedia — bank_code wajib menurut
Referensi API) → `POST /checkout/borderpay` membuat pembayaran
(`POST https://borderpay.id/api/v1/payments`, `reference_id` = ID order,
`return_url` = halaman status order) → halaman status menampilkan tautan
bayar (`pay_url`) + masa berlaku dari `expires_at` respons API → BorderPay
mengirim webhook ke `https://articletemplate.id/api/webhook-borderpay` →
order jadi `lunas`/`kedaluwarsa`/`gagal` + email lunas terkirim.

Aktivasi (yang harus dilakukan pemilik akun BorderPay):
1. Migrasi `supabase/migrations/20261116_borderpay_pay_url.sql` SUDAH
   diterapkan ke database self-hosted dan terverifikasi 16 Nov 2026
   (kolom `payments.pay_url`, `pay_expires_at`). Bila setup DB baru dari
   nol, terapkan file ini sebelum transaksi BorderPay.
2. Coolify → Environment Variables aplikasi: isi `BORDERPAY_API_KEY` (key test
   `bp_test_...` dulu; key live `bp_live_...` setelah KYC),
   `BORDERPAY_BASE_URL` (opsional — default `https://borderpay.id/api/v1`),
   `BORDERPAY_WEBHOOK_TOKEN` (token verifikasi webhook dari dashboard BorderPay).
3. Dashboard BorderPay → atur endpoint webhook ke
   `https://articletemplate.id/api/webhook-borderpay` (ganti placeholder).
4. Uji di mode test: buat pembayaran → tandai paid lewat endpoint simulate
   (`POST /payments/{reference}/simulate`, hanya mode test) atau bayar di
   halaman BorderPay → order lunas + email masuk + download aktif; lalu
   kirim-ulang webhook dan pastikan tidak ada pemrosesan ganda. Pembatalan:
   `POST /payments/{reference}/cancel` (menandai expired, hanya saat pending).

Terkonfirmasi dari Referensi API resmi (dibaca penuh 16 Nov 2026,
https://borderpay.id/api-reference): base URL satu-satunya
`https://borderpay.id/api/v1` (mode test/live dari prefix key, tanpa host
sandbox terpisah); auth `Authorization: Bearer <key>`; method persis
`qris`/`va`/`ewallet`; `bank_code` wajib untuk va/ewallet; `reference_id`
selalu dikirim (idempotensi, `reused=true` bila diulang); masa berlaku
SELALU dari `expires_at` respons (durasi tidak ditulis di referensi, tidak
ada asumsi di kode). Verifikasi webhook: header `x-borderpay-token`
dicocokkan dengan token dari env `BORDERPAY_WEBHOOK_TOKEN`; TIDAK ADA
verifikasi HMAC (HMAC hanya legacy). Biaya (`fee_borne_by`) DEPRECATED —
diatur per-project di dashboard BorderPay, bukan di kode.
4. Domain + DNS: `articletemplate.id` + `www` sudah mengarah ke Coolify sejak
   16 Nov 2026 (A @ + A www → IP VPS, DNS only) dan terpasang di aplikasi Coolify.

Uji image lokal (butuh Docker): `docker build -t articletemplate .` lalu
`docker run -p 4321:4321 --env-file .env articletemplate`.
Tanpa Docker: `npm run build && node dist/server/entry.mjs`.

> Jangan taruh folder kerja di path yang mengandung `#` (Vite gagal build).

## Yang belum bisa jalan tanpa akses berikut

- Akses ke project Coolify "ArticleTemplate.id" (service Supabase + aplikasi) — akses utama untuk URL + kunci backend.
- Akun merchant BorderPay — key test sudah ada; key live + KYC sebelum transaksi uang asli (lihat "BorderPay (WES-17)" di atas).
- Domainesia — invoice `articletemplate.id` #2367425 LUNAS 26 Okt 2026; domain
  aktif sampai 26 Okt 2027.
