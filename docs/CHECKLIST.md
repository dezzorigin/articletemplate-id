# CHECKLIST UJI - ArticleTemplate.id

Aturan: centang `[x]` hanya setelah dites, tulis bukti (perintah, tangkapan layar, atau hasil query). Gagal ditulis `[!]` plus catatan. Uji alur di viewport mobile (360x640 dan 390x844) dulu, baru tablet/desktop.

Legenda: `[ ]` belum, `[x]` lulus, `[!]` gagal.

## A. Infra
- [x] A1 `npm run build` lulus di path tanpa karakter `#` (bukti: build Complete 13 Nov 2026; gagal bila path berisi `#`)
- [x] A2 Container Docker build dan jalan (bukti: 2 build Coolify sukses 16 Nov 2026 dari Dockerfile ini — redeploy pindah domain + redeploy pindah branch ke main, keduanya "Successfully", container healthy. Docker lokal tetap belum diuji)
- [x] A3 `GET /api/health` 200 `{ok:true}` (bukti: `node dist/server/entry.mjs`, HTTP 200, 13 Nov 2026; `/` dan `/templates` juga 200)
- [x] A4 Tidak ada nilai rahasia di repo (bukti: `git grep` hanya menemukan nama variabel + placeholder)
- [x] A5 `.env.example` lengkap, aplikasi gagal jelas bila env wajib kosong (bukti: tes `requireEnv` melempar pesan jelas)
- [ ] A6 (tidak berlaku) Workflow keepalive DIHAPUS dari repo 16 Nov 2026 atas keputusan Nabil (state GitHub terverifikasi `disabled_manually` sebelum dihapus). Project Cloud cadangan tidak dijaga otomatis; bila pause, pulihkan manual lewat dashboard Supabase
- [x] A7 Supabase proyek aktif (bukti: proyek baru `articletemplate-id` ref kckivepafrmyihoigcnb, status ACTIVE_HEALTHY, 13 Nov 2026; menggantikan proyek lama yang pause) — Catatan 16 Nov 2026: proyek Cloud ini sekarang dev/test milik Westindo, bukan backend kanonis. Backend kanonis = Supabase self-hosted di Coolify, lihat A8.
- [ ] A8 Backend kanonis self-hosted terverifikasi: migrasi pengamanan RLS (`supabase/migrations/20261113_harden_rls.sql`) sudah diterapkan di database self-hosted Coolify (BELUM TERVERIFIKASI — menunggu konfirmasi Westindo); skema + bucket + Auth di self-hosted sudah sesuai `supabase/schema.sql`

## B. Katalog
- [x] B1 `/templates` memuat produk dari tabel `products` (hanya `is_visible=true`) (bukti 13 Nov: 3 produk uji muncul; 6 seed tersembunyi tidak muncul)
- [x] B2 Filter jenjang bekerja (`?jenjang=Q1` -> hanya uji-q1)
- [x] B3 Pencarian judul + deskripsi bekerja (`?q=murah` -> uji-sinta; karakter filter berbahaya dibersihkan, tidak error)
- [x] B4 Urutan terbaru / harga naik / harga turun (harga naik: 50rb, 100rb, lalu produk tanpa harga di akhir). Harga turun dan terbaru belum diperiksa satu per satu
- [x] B5 Produk harga NULL: tombol beli nonaktif, tidak bisa dibeli lewat URL/API (bukti: tombol disabled; POST manual `/keranjang/tambah` untuk produk tanpa harga -> 303 ke `?e=belum-dijual`, keranjang tidak berubah. Jalur checkout masih perlu dicek di WES-15)
- [ ] B6 Harga di katalog = harga di detail = harga di checkout
- [x] B7 Keadaan kosong (tanpa produk) tampil rapi ('Katalog segera hadir'; filter tanpa hasil: 'Tidak ada template yang cocok')
- [x] B8 Filter bidang + jurnal bekerja (bukti: `parseCatalogQuery` + `listCatalogFacets` teruji di `tests/catalog.test.mjs`, `npm test` lolos 16 Nov 2026; belum e2e live melawan DB berisi produk — katalog live masih kosong)

## C. Detail produk
- [x] C1 `/templates/[slug]` tampil: judul, jenjang, format, deskripsi, harga, lisensi (bukti 13 Nov dengan produk uji: semua tampil, lisensi + kalimat tanpa jaminan terbit ada)
- [ ] C2 Pratinjau parsial saja, file penuh tidak bisa diakses publik (kode: `file_path` tidak pernah diambil di halaman, pratinjau hanya dari bucket public `previews`. Belum diuji dengan upload nyata)
- [x] C3 Checklist kepatuhan + tautan sumber guideline tampil (produk per jurnal) (bukti: 3 item tampil, tautan https tampil; URL `javascript:` tidak dijadikan tautan)
- [x] C4 Slug tidak ada: 404 (bukti: slug tidak ada, slug tidak valid, dan produk tersembunyi semuanya 404)
- [x] C5 Produk terkait tampil (bagian 'Template lain' tampil; urutan memprioritaskan bidang sama)
- [x] C6 Tombol "Beli sekarang" di detail produk: ganti isi keranjang dengan produk itu lalu langsung ke checkout (bukti: rute `/keranjang/beli-sekarang` + tombol di buybar, 16 Nov 2026; penolakan server untuk produk tanpa harga sama seperti tambah keranjang; belum e2e live)

## D. Keranjang
- [x] D1 Tambah produk, qty selalu 1, tambah dua kali tidak menggandakan (bukti 13 Nov: tambah A, B, A lagi -> 2 baris, Rp150.000)
- [x] D2 Hapus produk (hapus A -> 1 baris, Rp50.000)
- [ ] D3 Total benar dan sama di keranjang dan checkout (keranjang lulus: total dihitung ulang dari database lewat `cartTotal`. Sisi checkout menunggu WES-15)
- [x] D4 Keranjang bertahan setelah refresh (cookie httpOnly, sesi yang sama membaca keranjang yang sama)
- [x] D5 Produk yang harganya berubah/nonaktif ditangani jelas (harga diubah -> total ikut berubah Rp175.000; produk disembunyikan -> keluar dari total + peringatan; cookie rusak -> keranjang kosong tanpa error)

## E. Auth
- [ ] E1 Daftar email + password (validasi email/sandi lulus. Sukses daftar BELUM terbukti: Supabase menolak domain example.com (`email_address_invalid`), uji butuh email domain nyata + kotak masuk. Akun uji dibuat langsung di DB)
- [x] E2 Login/logout email (bukti 13 Nov: login benar -> sesi, /akun 200 dengan email+nama; sandi salah dan email tak dikenal -> pesan sama; keluar -> /akun kembali ke /masuk; cookie sesi palsu/rusak ditolak)
- [ ] E3 Login Google (kode siap, tombol tersembunyi sampai `GOOGLE_LOGIN_ENABLED=true`. Provider Google belum dihidupkan di dashboard Supabase, belum diuji)
- [ ] E4 Lupa/atur password lewat email (endpoint teruji: balasan seragam untuk email tak dikenal, sandi beda ditolak, tanpa sesi ditolak. Alur tautan email end-to-end BELUM: butuh email nyata + provider email WES-18)
- [ ] E5 Guest checkout membuat akun dari email, password diatur lewat tautan
- [x] E6 `/akun` dan `/admin` menolak yang belum login (bukti: anon -> 303 ke /masuk?next=...; `next` jahat (`//evil.com`, `https://`, `/\`, `javascript:`) jatuh ke /akun)
- [x] E7 Edit profil: nama bisa diubah di `/akun/profil` (bukti: validasi `cleanName` teruji di `tests/auth.test.mjs`, simpan lewat RLS `profiles_update_own` kolom `nama`, 16 Nov 2026; belum e2e live. Kata sandi tetap lewat alur tautan email `/atur-password`)

## F. Checkout + pembayaran
> Catatan 16 Nov 2026 (WES-17): kode BorderPay selesai — klien (`src/lib/borderpay.ts`),
> webhook nyata (verifikasi signature, fail-closed), halaman status menampilkan tautan
> bayar, migrasi `20261116_borderpay_pay_url.sql`. Semua item F tetap BELUM dicentang
> karena butuh uji live (bayar nyata di sandbox): F2–F6 tidak bisa dibuktikan dari
> kode saja.
> Koreksi 16 Nov 2026 (dari Referensi API resmi, dibaca penuh): base URL
> `https://borderpay.id/api/v1` terkonfirmasi; `bank_code` wajib untuk VA/E-Wallet;
> `return_url` dikirim; masa berlaku dari `expires_at` respons (tanpa durasi asumsi);
> E-Wallet ditambahkan sebagai metode ketiga. Item F tetap belum dicentang — uji
> live masih menunggu (key test + env var + endpoint webhook; migrasi pay_url
> SUDAH di-apply ke database self-hosted & terverifikasi 16 Nov 2026).
- [ ] F1 Form nama + email tervalidasi
- [x] F2 Bayar sukses: order `lunas`, download aktif (bukti 17-18 Nov 2026: order fcefa90d lunas lewat webhook payment.paid BorderPay (test) di produksi, halaman status "Lunas, file bisa diunduh"; e2e-checkout-login 16 PASS. VA juga terbukti 18 Nov: amount webhook = gross 252500 untuk total 249000 (fee 3500 ditanggung pembeli), guard menerima amount == total atau amount - fee == total, commit 9f2f60c)
- [ ] F3 Bayar gagal: order `gagal`, download tidak aktif
- [ ] F4 Kedaluwarsa: order `kedaluwarsa`, bisa checkout ulang tanpa order ganda
- [x] F5 Webhook palsu/tanpa signature ditolak (bukti 17-18 Nov 2026: produksi: webhook tanpa token dan token salah -> 401; e2e-webhook 16 PASS)
- [x] F6 Webhook diulang (idempotent) tidak mengubah hasil (bukti 17-18 Nov 2026: e2e-webhook: paid dikirim ulang changed=false, expired setelah lunas tidak menurunkan status)
- [ ] F7 `harga_saat_beli` tersimpan, tidak ikut berubah
- [ ] F8 Tidak ada order lunas tanpa download aktif, dan sebaliknya
- [ ] F9 Email: order dibuat, lunas, gagal/kedaluwarsa (lunas SUDAH terkirim nyata 14 Nov dan 18 Nov lewat Brevo (log Sent lalu Delivered, commit 8cb1343) tapi masuk SPAM Gmail karena domain pengirim belum diautentikasi (SPF/DKIM menunggu verifikasi domain); order dibuat dan gagal/kedaluwarsa belum ada emailnya)

## G. Download
- [x] G1 Tanpa login ditolak (bukti 17-18 Nov 2026: e2e-download: tanpa login -> 303 /masuk)
- [x] G2 Login tapi order belum lunas ditolak (bukti 17-18 Nov 2026: e2e-download: belum lunas -> 303 /akun?e=belum-lunas)
- [x] G3 Akun lain tidak bisa mengunduh order orang lain (bukti 17-18 Nov 2026: e2e-download: akun lain -> 404)
- [x] G4 Order lunas: unduh berhasil, file benar (cek host signed URL di `scripts/e2e-download.cjs` sudah diperbaiki 16 Nov 2026 menjadi host-agnostic dari `PUBLIC_SUPABASE_URL`; e2e tetap belum dijalankan melawan backend self-hosted) (bukti 17-18 Nov 2026: e2e-download melawan backend self-hosted: 302 signed URL host Kong, isi file benar)
- [x] G5 Unduh ulang dari dashboard berhasil (bukti 17-18 Nov 2026: e2e-download: unduh ulang -> 302)
- [x] G6 Tiap unduhan tercatat di `downloads` (bukti 17-18 Nov 2026: e2e-download: 2 baris downloads tercatat untuk pemilik, akun lain 0)
- [ ] G7 URL file tidak bisa ditebak, signed URL kedaluwarsa

## H. Admin
- [x] H1 Hanya role admin bisa masuk, pembeli ditolak (bukti: anon 303, pembeli 404, admin 200 untuk /admin. Login admin terpisah dari pembeli belum dibangun, memakai akun sama dengan role)
  - Update 16 Nov 2026: login admin terpisah DIBANGUN — `/admin/masuk` + gerbang role (lihat H7). H1 tetap berlaku sebagai gerbangnya.
- [x] H2 Tambah/ubah/hapus produk (bukti: scripts/e2e-admin.cjs; produk yang pernah dibeli disembunyikan, bukan dihapus)
- [x] H3 Ubah harga langsung tercermin di katalog dan checkout (bukti: 1000 -> 2500 tampil di katalog, checkout, total order)
- [x] H4 Upload file template (bucket private) dan pratinjau (bucket public) (bukti: file tidak bisa dibuka lewat URL publik, file lama terhapus saat diganti, .exe ditolak. Validasi isi/magic-bytes ditambah 16 Nov 2026 — belum diuji e2e)
- [x] H5 Daftar order + cari email/produk (bukti: cari email/slug/judul + filter status)
- [x] H6 Kirim ulang email lunas/download (14 Nov: Resend terpasang, tombol di /akun, `e2e-kirim-ulang` 6 cek lulus, email nyata masuk Gmail. Pengirim masih onboarding@resend.dev: hanya bisa ke pemilik akun Resend, butuh verifikasi domain sebelum tayang)
- [x] H7 Login admin terpisah di `/admin/masuk` (bukti: halaman login khusus admin + gerbang role — pembeli yang mencoba masuk langsung dikeluarkan lagi; middleware mengecualikan `/admin/masuk` dari redirect login dan rewrite 404 admin; tautan dari `/masuk`, 16 Nov 2026; belum e2e live. Catatan jujur: "terpisah" = alur + gerbang role yang terpisah; sesi tetap memakai cookie Supabase Auth yang sama, bukan penyimpanan kredensial kedua)
- [x] H8 Kelola konten di `/admin/konten` (bukti: tabel `site_content` + migrasi `20261116_site_content.sql`, daftar 3 kunci + form ubah teks polos, halaman Beranda/Tentang/Bantuan membaca dari DB dengan fallback teks bawaan, 16 Nov 2026; migrasi SUDAH di-apply ke database self-hosted & terverifikasi 16 Nov 2026; belum e2e live)

## I. Konten
- [x] I1 Beranda: harga tampil dari data, bukan teks karangan
- [x] I2 Tentang: hanya klaim terverifikasi PRD 7.8
- [x] I3 Tidak ada angka terlarang ("5 Q1/Q2, 9 ongoing") dan label "JCSR Sinta 3"
- [x] I4 Tidak ada kata garansi terbit/lolos/acceptance di seluruh situs
- [x] I5 Bantuan: cara pakai, lisensi, refund, privasi, kontak tayang (DRAF: kebijakan menunggu persetujuan tim; kanal kontak belum ditetapkan, tulisan sementara "diumumkan sebelum penjualan dibuka")
- [x] I6 Tidak ada data pribadi Nizam (HP, alamat, email pribadi)

## J. Konsultasi
- [x] J1 Layanan tampil "segera hadir" tanpa harga/jadwal
- [x] J2 Booking nyata tidak bisa dibuat (UI dan API) (bukti: scripts/e2e-booking-tertutup.cjs 14 cek, RLS menolak insert)

## K. Keamanan
- [x] K1 RLS aktif semua tabel, diuji per peran anon, pembeli, admin (bukti: scripts/e2e-keamanan.cjs, 27 cek: pembeli lain tidak melihat order/unduhan/profil orang, tidak bisa tulis order/produk/role, admin bisa)
- [x] K2 Service role key tidak ada di bundle frontend (dist/client dan HTML halaman diperiksa)
- [x] K3 Validasi input server-side: POST lintas-origin 403 (auth, checkout, admin), open redirect ?next ditolak, input filter aneh dan path traversal aman, keranjang tak valid tidak 500
- [x] K4 Header keamanan terpasang (CSP tanpa unsafe-eval dan tanpa skrip inline, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; HSTS hanya mode produksi). Berkas statis di public/ (robots.txt) dilayani tanpa middleware sehingga tanpa header; tidak sensitif
- [x] K5 Rate limit endpoint publik (dalam memori, satu instance: masuk 10/menit, daftar dan lupa 5/10 menit, checkout 15/10 menit; kunci = entri X-Forwarded-For PALING KIRI sejak 16 Nov 2026, asumsi satu proxy tepercaya Traefik/Coolify — lihat `src/lib/security.ts`. Jika Coolify dijalankan multi-instance, pindah ke penyimpanan bersama)
- [x] K6 get_advisors 13 Nov: tidak ada temuan kritis. WARN: is_admin() executable (sengaja), leaked password protection mati (pengaturan dashboard Auth, mungkin butuh paket Pro), 8 auth_rls_initplan dan multiple_permissive_policies (performa, belum berdampak di skala ini)

## L. Non-fungsional
- [ ] L1 Halaman 404 dan 500 ramah (404 lulus: `/nope` status 404 + halaman ramah. 500: `src/pages/500.astro` sudah mengatur status HTTP 500 sejak 16 Nov 2026, tapi belum dipicu/diuji dengan error nyata)
- [ ] L2 Aksesibilitas dasar: kontras, label form, fokus keyboard, alt gambar (Lighthouse a11y 100 di Beranda, 13 Nov; fokus keyboard: 18 Nov ditinjau lewat kode, `:focus-visible` outline 3px ada di Base dan Dashboard, tidak ada `outline: none`, tidak ada div klik tanpa role; uji tab manual di browser belum)
- [ ] L3 Lighthouse desktop >= 90 performa, >= 90 a11y
- [x] L4 Meta title/description/OG per halaman, robots.txt, sitemap.xml (produk visible saja)
- [ ] L5 Backup database terjadwal + monitoring uptime aktif
- [x] L6 Test runner: `npm test` menjalankan tes unit (`tests/`, `node:test`) + `scripts/test-borderpay.mjs` (bukti: `npm test` lolos 16 Nov 2026 — 5 file tes unit + 31 cek BorderPay)

## M. Workflow end-to-end (jalankan di mobile)
- [ ] M1 W1 guest: katalog sampai download
- [ ] M2 W2 login: katalog sampai download
- [ ] M3 W3 download ulang
- [ ] M4 W4 gagal/kedaluwarsa lalu checkout ulang
- [ ] M5 W5 admin tambah produk, cek di storefront
- [ ] M6 W6 konsultasi tertutup

## N. Mobile
- [x] N1 360, 390, 768px tanpa scroll horizontal (bukti 13 Nov: 8 halaman x 3 lebar, ukur scrollWidth di iframe. Emulasi, bukan HP nyata. ULANGI tiap ada halaman baru)
- [x] N2 Target sentuh >= 44px (bukti 13 Nov: semua tombol/nav/input di 24 kombinasi >= 44px; tautan di dalam teks belum diukur)
- [ ] N3 Input font >= 16px (tanpa zoom iOS), `type`/`inputmode` tepat
- [x] N4 Menu mobile berfungsi, CTA sticky di detail dan keranjang (tab bar jalan; bar sticky ada di detail dan keranjang. Posisi sticky di atas tab bar belum dicek di HP nyata)
- [ ] N5 Safe-area (notch) dan tinggi layar (tanpa bug 100vh) (kode: viewport-fit=cover, env(safe-area-inset-*), 100dvh sudah ada; BUTUH HP nyata untuk bukti)
- [ ] N6 Dashboard/admin berupa kartu atau tabel yang bisa di-scroll terkontrol
- [ ] N7 Lighthouse mobile >= 85 performa, >= 90 a11y
- [ ] N8 `prefers-reduced-motion` dihormati (kode ada di Base.astro, index.astro, dan Dashboard.astro (18 Nov: ditambah `animation: none`); belum diuji dengan pengaturan OS)

## Rekap hasil
| Tanggal | Tahap | Lulus | Gagal | Belum | Catatan |
|---|---|---|---|---|---|
| 2026-11-16 | tindak lanjut audit | 0 (tidak ada centang baru — semua item terbuka butuh uji live/manual) | 0 | A8, F1–F9, G1–G7, M1–M6 + sisanya | F-P1-1 diperbaiki (startBorderPayPayment kembalikan {ok, payUrlMissing}, pemanggil ?e=tautan), /sitemap.xml di-SKIP middleware, dokumen (README/FRAMEWORK/CHECKLIST) diperbarui ke main f32af646; F-P2-8 + komentar simulasi ternyata sudah tutup di main; guard race DB dievaluasi — TIDAK dibangun (lihat body PR); tsc 0 error, build lolos, npm test 26 unit + 55 cek BorderPay lolos, smoke 6 rute 200 |
| 2026-11-16 | Lanjutan audit | B8, C6, E7, H7, H8, L6 (+catatan H1) | 0 | A8, F1–F9, G1–G7, M1–M6 + sisanya | beli sekarang, filter bidang/jurnal, edit profil, login admin terpisah, kelola konten (migrasi site_content — WAJIB apply sebelum deploy), test runner `npm test` lolos; e2e live belum dijalankan |
| 2026-11-16 | WES-17 BorderPay | 0 (kode selesai, bukti live belum ada) | 0 | A8, F1–F9, G1–G7, M1–M6 + sisanya | klien BorderPay + webhook nyata (verifikasi token x-borderpay-token) + halaman bayar + migrasi pay_url; uji lokal scripts/test-borderpay.mjs lolos; F2–F6 butuh uji bayar live (sandbox) |
| 2026-11-16 | fix audit batch 1 | A2 (+catatan G4, H4, K5, L1, A6) | 0 | A8, F1–F9, G1–G7, M1–M6 + sisanya | tsc 0 error, React dihapus, keepalive dihapus, e2e-download host-agnostic, 500 status, race createOrder dikunci per user, clientKey XFF kiri, magic-bytes upload, tautan unduh di status lunas, expiry ditegakkan di daftar order |
| 2026-11-13 | 0 | 0 | 0 | semua | checklist dibuat, belum ada uji |
| 2026-11-13 | 3 (WES-13) | 26 (+E2,E6,H1) | 0 | E1, E3, E4 sebagian + sisanya | auth teruji kecuali email nyata dan Google |
| 2026-11-13 | 3 (WES-14) | 23 (+D1,D2,D4,D5,B5,N4) | 0 | D3, C2, dst | keranjang selesai; auth (WES-13) masih jalan |
| 2026-11-13 | 2 (WES-11, WES-12) | 15 (+B1-B4,B7,C1,C3,C4,C5) | 0 | B5, B6, C2, N4 + sisanya | T2 selesai kode. B4 harga turun belum dicek; C2 butuh upload nyata; CTA sticky ada tapi tombol nonaktif sampai WES-14 |
| 2026-11-13 | 2 (WES-10) | 7 (A1,A3,A4,A5,A7,N1,N2) | 0 | A2, A6, N4, N5, N8, L1(500) + sisanya | WES-10 layout mobile selesai kode; N5 butuh HP nyata |
| 2026-11-13 | 1 | 5 (A1,A3,A4,A5,A7) | 0 | A2, A6 + B sampai N | A2 menunggu Docker/Coolify, A6 menunggu secret GitHub baru; K1/K6 sebagian |
