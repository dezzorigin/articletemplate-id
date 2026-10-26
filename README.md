# ArticleTemplate.id — aplikasi web

Toko template artikel + modul konsultasi (dibangun sekaligus, PRD `../prd.md`).

## Stack

- **Astro + React** (halaman + pulau interaktif) — adapter Cloudflare
- **Cloudflare Pages/Workers** — hosting (custom domain menyusul setelah
  `articletemplate.id` Active)
- **Supabase Cloud** — Postgres + Auth + Storage (free tier + cron keepalive)
- **BorderPay** — checkout QRIS/VA (mode test dulu, merchant menyusul)

## Struktur

- `src/pages/` — Beranda, `/templates`, `/keranjang`, `/checkout`,
  `/konsultasi`, `/akun`, `/admin`, `/api/health`,
  `/api/webhook-borderpay` (skeleton 501 — skema signature BorderPay
  dikonfirmasi dari dok merchant saat akun aktif, tidak ditebak)
- `src/lib/supabase.ts` — klien Supabase (anon key + RLS)
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

## Deploy

Opsi utama: hubungkan repo GitHub ke **Cloudflare Pages** (preset Astro)
lewat dashboard Cloudflare → domain `*.pages.dev` dulu. Setelah
`articletemplate.id` Active di Domainesia, tambahkan custom domain di Pages
dan arahkan DNS-nya. Deploy via API token dari VM tidak dipakai untuk Pages
(konektor Cloudflare di VM hanya mencakup zones/tunnel/DNS).

## Yang belum bisa jalan tanpa akses berikut

- Supabase Cloud (project + kunci) — akses utama yang diminta ke Nabil.
- Akun merchant BorderPay — sebelum transaksi uang asli (mode test dulu).
- Domainesia — verifikasi invoice `articletemplate.id` (Pending) + DNS nanti.
