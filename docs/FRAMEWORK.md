# FRAMEWORK - ArticleTemplate.id

Sumber: PRD v3.0 (paket delegasi v2). Dokumen ini menerjemahkan PRD jadi urutan kerja. Kalau berubah, ubah ini dulu, baru eksekusi.

## 1. Kondisi nyata (diverifikasi 13 Nov 2026)
- Repo `dezzorigin/articletemplate-id`, 4 commit. Astro 5 + React 19 + adapter Cloudflare. Build lulus (di path tanpa `#`).
- Semua halaman placeholder. Webhook BorderPay 501. Tidak ada auth, keranjang, checkout, download, admin berfungsi.
- Supabase proyek ArticleTemplate (`azazbeufwmkaiajosunh`) belum bisa dicek dari akun ini (akses ada di Nabil).
- Situs live https://articletemplate.id 200, `/api/health` OK.

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
  -> Supabase (Postgres + Auth + Storage, RLS)
  -> BorderPay (QRIS/VA) -> POST /api/webhook-borderpay -> orders.status
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
| 4 | Checkout + pembayaran (mock dulu, BorderPay setelah akun ada) | F lulus |
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
7. Keepalive: tetap dipantau, plus health check Supabase terpisah.
8. Tes otomatis untuk logika kritis (total, status order, otorisasi download).

## 8. Blocker di luar kode (butuh keputusan tim)
Harga final + fee BorderPay, akun merchant BorderPay, skema signature webhook, provider email, kebijakan refund/lisensi, format file template, review draf Q1 oleh Nizam, akses proyek Supabase ArticleTemplate ke akun ini.
