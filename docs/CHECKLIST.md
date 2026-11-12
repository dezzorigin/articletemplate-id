# CHECKLIST UJI - ArticleTemplate.id

Aturan: centang `[x]` hanya setelah dites, tulis bukti (perintah, tangkapan layar, atau hasil query). Gagal ditulis `[!]` plus catatan. Uji alur di viewport mobile (360x640 dan 390x844) dulu, baru tablet/desktop.

Legenda: `[ ]` belum, `[x]` lulus, `[!]` gagal.

## A. Infra
- [x] A1 `npm run build` lulus di path tanpa karakter `#` (bukti: build Complete 13 Nov 2026; gagal bila path berisi `#`)
- [ ] A2 Container Docker build dan jalan lokal (Dockerfile ditulis; BELUM diuji, Docker tidak terpasang di laptop ini. Uji lewat build Coolify)
- [x] A3 `GET /api/health` 200 `{ok:true}` (bukti: `node dist/server/entry.mjs`, HTTP 200, 13 Nov 2026; `/` dan `/templates` juga 200)
- [x] A4 Tidak ada nilai rahasia di repo (bukti: `git grep` hanya menemukan nama variabel + placeholder)
- [x] A5 `.env.example` lengkap, aplikasi gagal jelas bila env wajib kosong (bukti: tes `requireEnv` melempar pesan jelas)
- [ ] A6 Keepalive GitHub Actions hijau 1 run (secret repo harus diganti ke proyek Supabase baru, lalu jalankan manual)
- [x] A7 Supabase proyek aktif (bukti: proyek baru `articletemplate-id` ref kckivepafrmyihoigcnb, status ACTIVE_HEALTHY, 13 Nov 2026; menggantikan proyek Nabil yang pause)

## B. Katalog
- [x] B1 `/templates` memuat produk dari tabel `products` (hanya `is_visible=true`) (bukti 13 Nov: 3 produk uji muncul; 6 seed tersembunyi tidak muncul)
- [x] B2 Filter jenjang bekerja (`?jenjang=Q1` -> hanya uji-q1)
- [x] B3 Pencarian judul + deskripsi bekerja (`?q=murah` -> uji-sinta; karakter filter berbahaya dibersihkan, tidak error)
- [x] B4 Urutan terbaru / harga naik / harga turun (harga naik: 50rb, 100rb, lalu produk tanpa harga di akhir). Harga turun dan terbaru belum diperiksa satu per satu
- [ ] B5 Produk harga NULL: tombol beli nonaktif, tidak bisa dibeli lewat URL/API (UI lulus: tombol disabled + 'Harga segera hadir'. Penolakan di server menunggu endpoint keranjang/checkout, WES-14/15)
- [ ] B6 Harga di katalog = harga di detail = harga di checkout
- [x] B7 Keadaan kosong (tanpa produk) tampil rapi ('Katalog segera hadir'; filter tanpa hasil: 'Tidak ada template yang cocok')

## C. Detail produk
- [x] C1 `/templates/[slug]` tampil: judul, jenjang, format, deskripsi, harga, lisensi (bukti 13 Nov dengan produk uji: semua tampil, lisensi + kalimat tanpa jaminan terbit ada)
- [ ] C2 Pratinjau parsial saja, file penuh tidak bisa diakses publik (kode: `file_path` tidak pernah diambil di halaman, pratinjau hanya dari bucket public `previews`. Belum diuji dengan upload nyata)
- [x] C3 Checklist kepatuhan + tautan sumber guideline tampil (produk per jurnal) (bukti: 3 item tampil, tautan https tampil; URL `javascript:` tidak dijadikan tautan)
- [x] C4 Slug tidak ada: 404 (bukti: slug tidak ada, slug tidak valid, dan produk tersembunyi semuanya 404)
- [x] C5 Produk terkait tampil (bagian 'Template lain' tampil; urutan memprioritaskan bidang sama)

## D. Keranjang
- [ ] D1 Tambah produk, qty selalu 1, tambah dua kali tidak menggandakan
- [ ] D2 Hapus produk
- [ ] D3 Total benar dan sama di keranjang dan checkout
- [ ] D4 Keranjang bertahan setelah refresh
- [ ] D5 Produk yang harganya berubah/nonaktif ditangani jelas

## E. Auth
- [ ] E1 Daftar email + password
- [ ] E2 Login/logout email
- [ ] E3 Login Google
- [ ] E4 Lupa/atur password lewat email
- [ ] E5 Guest checkout membuat akun dari email, password diatur lewat tautan
- [ ] E6 `/akun` dan `/admin` menolak yang belum login

## F. Checkout + pembayaran
- [ ] F1 Form nama + email tervalidasi
- [ ] F2 Bayar sukses: order `lunas`, download aktif
- [ ] F3 Bayar gagal: order `gagal`, download tidak aktif
- [ ] F4 Kedaluwarsa: order `kedaluwarsa`, bisa checkout ulang tanpa order ganda
- [ ] F5 Webhook palsu/tanpa signature ditolak
- [ ] F6 Webhook diulang (idempotent) tidak mengubah hasil
- [ ] F7 `harga_saat_beli` tersimpan, tidak ikut berubah
- [ ] F8 Tidak ada order lunas tanpa download aktif, dan sebaliknya
- [ ] F9 Email: order dibuat, lunas, gagal/kedaluwarsa

## G. Download
- [ ] G1 Tanpa login ditolak
- [ ] G2 Login tapi order belum lunas ditolak
- [ ] G3 Akun lain tidak bisa mengunduh order orang lain
- [ ] G4 Order lunas: unduh berhasil, file benar
- [ ] G5 Unduh ulang dari dashboard berhasil
- [ ] G6 Tiap unduhan tercatat di `downloads`
- [ ] G7 URL file tidak bisa ditebak, signed URL kedaluwarsa

## H. Admin
- [ ] H1 Hanya role admin bisa masuk, pembeli ditolak
- [ ] H2 Tambah/ubah/hapus produk
- [ ] H3 Ubah harga langsung tercermin di katalog dan checkout
- [ ] H4 Upload file template (bucket private) dan pratinjau (bucket public)
- [ ] H5 Daftar order + cari email/produk
- [ ] H6 Kirim ulang email lunas/download

## I. Konten
- [ ] I1 Beranda: harga tampil dari data, bukan teks karangan
- [ ] I2 Tentang: hanya klaim terverifikasi PRD 7.8
- [ ] I3 Tidak ada angka terlarang ("5 Q1/Q2, 9 ongoing") dan label "JCSR Sinta 3"
- [ ] I4 Tidak ada kata garansi terbit/lolos/acceptance di seluruh situs
- [ ] I5 Bantuan: cara pakai, lisensi, refund, privasi, kontak tayang
- [ ] I6 Tidak ada data pribadi Nizam (HP, alamat, email pribadi)

## J. Konsultasi
- [ ] J1 Layanan tampil "segera hadir" tanpa harga/jadwal
- [ ] J2 Booking nyata tidak bisa dibuat (UI dan API)

## K. Keamanan
- [ ] K1 RLS aktif semua tabel, diuji per peran (anon, pembeli, admin). Sebagian: anon + pembeli sudah diuji 13 Nov (ubah role, buat order lunas, baca produk/layanan/order); peran admin belum
- [ ] K2 Service role key tidak ada di bundle frontend
- [ ] K3 Validasi input server-side semua endpoint
- [ ] K4 Header keamanan terpasang
- [ ] K5 Rate limit endpoint publik
- [ ] K6 `get_advisors` Supabase tanpa temuan kritis (13 Nov: 2 WARN pada is_admin(), sengaja dibiarkan karena dipakai kebijakan RLS; perlu dicek ulang setelah ada tabel/fungsi baru)

## L. Non-fungsional
- [ ] L1 Halaman 404 dan 500 ramah (404 lulus: `/nope` status 404 + halaman ramah. 500 file dibuat, belum dipicu/diuji)
- [ ] L2 Aksesibilitas dasar: kontras, label form, fokus keyboard, alt gambar
- [ ] L3 Lighthouse desktop >= 90 performa, >= 90 a11y
- [ ] L4 Meta title/description/OG per halaman, `robots.txt`, sitemap
- [ ] L5 Backup database terjadwal + monitoring uptime aktif

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
- [ ] N4 Menu mobile berfungsi, CTA sticky di detail dan keranjang (menu: bottom tab bar jalan, status aktif benar. CTA sticky menunggu halaman detail/keranjang)
- [ ] N5 Safe-area (notch) dan tinggi layar (tanpa bug 100vh) (kode: viewport-fit=cover, env(safe-area-inset-*), 100dvh sudah ada; BUTUH HP nyata untuk bukti)
- [ ] N6 Dashboard/admin berupa kartu atau tabel yang bisa di-scroll terkontrol
- [ ] N7 Lighthouse mobile >= 85 performa, >= 90 a11y
- [ ] N8 `prefers-reduced-motion` dihormati (kode ada di Base.astro; belum diuji dengan pengaturan OS)

## Rekap hasil
| Tanggal | Tahap | Lulus | Gagal | Belum | Catatan |
|---|---|---|---|---|---|
| 2026-11-13 | 0 | 0 | 0 | semua | checklist dibuat, belum ada uji |
| 2026-11-13 | 2 (WES-11, WES-12) | 15 (+B1-B4,B7,C1,C3,C4,C5) | 0 | B5, B6, C2, N4 + sisanya | T2 selesai kode. B4 harga turun belum dicek; C2 butuh upload nyata; CTA sticky ada tapi tombol nonaktif sampai WES-14 |
| 2026-11-13 | 2 (WES-10) | 7 (A1,A3,A4,A5,A7,N1,N2) | 0 | A2, A6, N4, N5, N8, L1(500) + sisanya | WES-10 layout mobile selesai kode; N5 butuh HP nyata |
| 2026-11-13 | 1 | 5 (A1,A3,A4,A5,A7) | 0 | A2, A6 + B sampai N | A2 menunggu Docker/Coolify, A6 menunggu secret GitHub baru; K1/K6 sebagian |
