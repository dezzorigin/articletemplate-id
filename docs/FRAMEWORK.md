# FRAMEWORK - ArticleTemplate.id

Sumber: PRD v3.0 (paket delegasi v2). Dokumen ini menerjemahkan PRD jadi urutan kerja. Kalau berubah, ubah ini dulu, baru eksekusi.

## 1. Kondisi nyata (diverifikasi 13 Nov 2026)
- Repo `dezzorigin/articletemplate-id`, 4 commit. Astro 5 + React 19 + adapter Cloudflare. Build lulus (di path tanpa `#`).
- Semua halaman placeholder. Webhook BorderPay 501. Tidak ada auth, keranjang, checkout, download, admin berfungsi.
- Supabase: proyek lama (`azazbeufwmkaiajosunh`, pause) tidak terjangkau. Dibuat proyek baru milik Westindo `articletemplate-id` (ref `kckivepafrmyihoigcnb`, Singapura) dengan skema + migrasi pengamanan RLS + bucket. Migrasi di `supabase/migrations/`.
- Update 16 Nov 2026 (keputusan Nabil): backend kanonis = Supabase SELF-HOSTED di Coolify (service `supabase-kfuuqefxogdl5q4bam7t93vu`, project Coolify "ArticleTemplate.id"). Project Supabase Cloud `azazbeufwmkaiajosunh` (Nabil, dipulihkan 16 Nov 2026, ACTIVE_HEALTHY) = CADANGAN. Project Supabase Cloud Westindo (`kckivepafrmyihoigcnb`) = dev/test. Status migrasi pengamanan RLS (`supabase/migrations/20261113_harden_rls.sql`) di database self-hosted: BELUM TERVERIFIKASI — menunggu konfirmasi Westindo.
- Update 16 Nov 2026 (WES-17): integrasi BorderPay selesai di kode — klien
  `src/lib/borderpay.ts` (POST /api/v1/payments, QRIS/VA/E-Wallet), webhook nyata
  (verifikasi token `x-borderpay-token`, fail-closed), halaman status menampilkan tautan
  bayar. Key test sudah ada; key live + KYC menyusul.
- Koreksi 16 Nov 2026 (dari Referensi API resmi, dibaca penuh):
  base URL satu-satunya `https://borderpay.id/api/v1` (mode dari prefix key,
  tanpa host sandbox terpisah); `bank_code` WAJIB untuk VA/E-Wallet (pembeli
  memilih bank dari GET /payment-methods, fallback daftar umum bila discovery
  gagal); `return_url` dikirim ke halaman status order; masa berlaku SELALU
  dari `expires_at` respons (durasi tidak ditulis di referensi — tidak ada
  asumsi di kode); biaya (`fee_borne_by`) DEPRECATED, diatur di dashboard.
  Endpoint simulate (`POST /payments/{reference}/simulate`, hanya mode test)
  untuk uji end-to-end; cancel (`POST /payments/{reference}/cancel`) untuk
  pembatalan. Migrasi `20261116_borderpay_pay_url.sql` wajib
  diterapkan ke database self-hosted SEBELUM merge/deploy. Uji bayar live
  (F2–F6) belum dilakukan — bagian F CHECKLIST tetap belum dicentang.
- Situs live https://articletemplate.id 200, `/api/health` OK.
- Update 16 Nov 2026 (lanjutan audit): Beli sekarang (detail → checkout langsung), filter katalog
  bidang/jurnal, edit profil (`/akun/profil`), login admin terpisah (`/admin/masuk` + gerbang role),
  kelola konten (`/admin/konten`, tabel `site_content`, migrasi `20261116_site_content.sql`),
  test runner `node:test` (`npm test`). Migrasi `site_content` WAJIB di-apply ke database
  self-hosted sebelum deploy — sebelum itu halaman memakai teks bawaan dan simpan konten gagal.

## 2. Prinsip
1. Mobile-first: rancang di 360px, baru naik ke tablet/desktop.
2. Satu sumber harga (kolom `products.harga`). Harga NULL = tidak bisa dibeli.
3. Status order final hanya dari webhook/rekonsiliasi, bukan halaman kembali.
4. Download diotorisasi di server setiap permintaan (login + order lunas).
5. Tanpa garansi terbit. Klaim Nizam hanya yang ada di PRD 7.8.
6. Rahasia tidak masuk repo. `SUPABASE_SERVICE_ROLE_KEY` hanya server.
7. Tidak deploy/push tanpa diminta.

## 3. Arsitektur target
```
Browser (mobile) -> Astro SSR (Node, Docker, Coolify)
  -> Supabase SELF-HOSTED di Coolify (Postgres + Auth + Storage, RLS)
  -> BorderPay (QRIS/VA/E-Wallet) -> POST /api/webhook-borderpay -> orders.status
  -> Email transaksional (provider dipilih tim)
```
Perubahan dari scaffold: adapter `@astrojs/cloudflare` jadi `@astrojs/node` (standalone) + Dockerfile untuk Coolify.

## 4. Workflow pengguna (alur utama)
| # | Alur | Langkah | Titik gagal yang harus ditangani |
|---|---|---|---|
| W1 | Beli sebagai guest | katalog -> detail -> keranjang -> checkout (nama+email) -> bayar -> webhook -> lunas -> email -> atur password -> download | email salah, bayar batal, webhook telat, akun sudah ada |
| W2 | Beli sebagai login | sama, data terisi otomatis | sesi habis di tengah checkout |
| W3 | Download ulang | login -> Order saya -> unduh | order belum lunas, file hilang di storage |
| W4 | Bayar gagal/kedaluwarsa | status jelas -> checkout ulang dari order yang sama | order ganda, order lunas tertagih ulang |
| W5 | Admin tambah produk | login admin -> isi produk + harga + file + pratinjau -> tampilkan -> cek di katalog | non-admin akses admin, harga beda katalog vs checkout |
| W6 | Konsultasi | lihat layanan "segera hadir" | booking nyata tidak boleh masuk |

## 5. Workflow kerja tim
- Linear (tim `WES`, project "ArticleTemplate.id"): satu issue per fitur, milestone per tahap.
- Status: Backlog -> In Progress -> In Review -> Done. Done hanya bila item CHECKLIST terkait lulus dengan bukti.
- Komentar issue saat selesai: ringkasan perubahan + hasil uji.
- Commit pesan memuat kunci issue (mis. `WES-12`). Branch per issue. Tidak ada push tanpa diminta.

## 6. Tahap
| Tahap | Isi | Keluaran |
|---|---|---|
| 0 | Fondasi: clone, build, Linear, framework, checklist | dokumen ini + CHECKLIST + issue Linear |
| 1 | Coolify-ready: adapter Node, Dockerfile, env | container jalan lokal, `/api/health` 200 |
| 2 | Katalog + detail produk dari Supabase | A, B, C lulus |
| 3 | Auth + keranjang | D, E lulus |
| 4 | Checkout + pembayaran (mock dulu, BorderPay setelah akun ada) | F lulus (kode BorderPay selesai 16 Nov 2026 — WES-17; F2–F6 butuh uji live) |
| 5 | Dashboard + download aman | G lulus |
| 6 | Admin | H lulus |
| 7 | Tentang, Bantuan, Konsultasi tertutup | I, J lulus |
| 8 | Hardening + QA akhir | K, L, M, N lulus |

## 7. Daftar improve (dari analisis scaffold)
1. Pindah ke Node adapter + Docker (Coolify).
2. Navigasi mobile (bottom bar / hamburger) menggantikan nav pill horizontal yang bisa meluber di 360px.
3. Halaman 404/500, `robots.txt`, `sitemap`, meta OG per halaman.
4. Sentralkan format harga (Rp) dan perhitungan total di satu modul.
5. Validasi env saat start (gagal jelas, bukan placeholder diam-diam seperti `supabase.ts` sekarang).
6. Header keamanan (CSP, X-Frame-Options, Referrer-Policy) dan rate limit endpoint publik.
7. Keepalive: DIHAPUS 16 Nov 2026 (keputusan Nabil — workflow `.github/workflows/keepalive.yml`
   dihapus dari repo). Project Supabase Cloud CADANGAN (`azazbeufwmkaiajosunh`) tidak lagi
   dijaga otomatis; bila pause, pulihkan manual lewat dashboard Supabase. Backend kanonis
   self-hosted tidak pernah pause, jadi tidak butuh keepalive. Plus health check Supabase terpisah.
8. Tes otomatis untuk logika kritis (total, status order, otorisasi download) — SELESAI 16 Nov 2026:
   runner `node:test`, `npm test` menjalankan `tests/` (katalog, keranjang, auth, uang, konten)
   + `scripts/test-borderpay.mjs`.

## 8. Blocker di luar kode (butuh keputusan tim)
Harga final + fee BorderPay, akun merchant BorderPay (key test sudah ada; key live + KYC sebelum uang asli), provider email, kebijakan refund/lisensi, format file template, review draf Q1 oleh Nizam, akses ke project Coolify "ArticleTemplate.id" (service Supabase + aplikasi) untuk URL + kunci backend.
