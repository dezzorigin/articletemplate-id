-- Isi produk katalog: deskripsi, format file, dan daftar isi ("yang didapat").
-- Sumber: ~/workspace/articletemplate/templates-built/CATATAN.md (16 Nov 2026)
-- — struktur isi tiap file .docx yang terverifikasi di sana. Tidak ada klaim
-- baru: tanpa "jaminan lolos", tanpa akreditasi, tanpa janji di luar CATATAN.
--
-- CARA PAKAI: jalankan di Supabase self-hosted (backend kanonis) SETELAH
-- schema.sql + migrasi 20261116_seed_harga.sql. File ini HANYA mengisi
-- deskripsi/format/isi_template; harga dan is_visible TIDAK disentuh.
-- Idempotent: aman dijalankan ulang (UPDATE per slug + ON CONFLICT).
--
-- Catatan: pilihan jurnal acuan Q4 (Ratarstvo i povrtarstvo) dan Sinta
-- (Jurnal Pendidikan, Sinta 5) adalah pilihan builder dan masih menunggu
-- keputusan Nizam (lihat CATATAN.md §4-§5). Bila ditolak, deskripsi +
-- isi_template kedua produk itu harus diubah mengikuti jurnal pengganti.

-- 1) Perluas domain jenjang agar Paket Lengkap bisa disimpan (sama seperti
--    migrasi 20261116_seed_harga.sql; diulang di sini supaya file ini aman
--    dijalankan sendiri — nama file 'isi' terurut sebelum 'seed_harga').
alter table public.products drop constraint if exists products_jenjang_check;
alter table public.products add constraint products_jenjang_check
  check (jenjang in ('Q1', 'Q2', 'Q3', 'Q4', 'Sinta', 'Prosiding', 'Paket'));

-- 2) Kolom daftar isi ("yang didapat") — array teks, satu baris per butir isi.
alter table public.products
  add column if not exists isi_template text[] not null default '{}';

-- 3) Deskripsi + format + isi per produk.
update public.products set
  deskripsi = 'Template Word (.docx) 8 halaman mengikuti struktur template resmi JCCE (Journal of Computational and Cognitive Engineering): title page dan abstrak, pendahuluan, related work, metodologi, hasil dan diskusi, kesimpulan, pernyataan, dan referensi — plus checklist pra-submit dan kerangka cover letter.',
  format = 'docx',
  isi_template = array[
    'Cara memakai template ini',
    'Title Page + Abstract',
    '1. Introduction (Background, Research Gap, Research Questions, Contributions, Abbreviations)',
    '2. Related Work / Literature Review',
    '3. Methodology',
    '4. Results and Discussion',
    '5. Conclusion',
    '6. Statements',
    'References',
    'Lampiran A — Checklist Pra-Submit (Kacamata Reviewer Q1)',
    'Lampiran B — Kerangka Cover Letter'
  ]
where slug = 'template-q1';

update public.products set
  deskripsi = 'Template Word (.docx) 8 halaman mengikuti guideline Narra X: author information, abstrak dan keywords, introduction, methods, results, discussion, conclusions, declarations, dan references — plus checklist kepatuhan Narra X dan kerangka cover letter.',
  format = 'docx',
  isi_template = array[
    'Cara memakai template ini',
    'Author Information + Abstract + Keywords',
    'Introduction',
    'Methods',
    'Results',
    'Discussion',
    'Conclusions',
    'Declarations',
    'References',
    'Tables dan Figures',
    'Lampiran A — Checklist Kepatuhan Narra X (Pra-Submit)',
    'Lampiran B — Kerangka Cover Letter'
  ]
where slug = 'template-q2';

update public.products set
  deskripsi = 'Template Word (.docx) 13 halaman mengikuti guideline Drug Target Insights: title page dan abstrak terstruktur, acknowledgments, disclosures, kontribusi penulis (CRediT), data availability, IMRaD, figure legends, tabel, dan referensi — plus checklist kepatuhan DTI dan kerangka cover letter.',
  format = 'docx',
  isi_template = array[
    'Cara memakai template ini',
    'Title Page + Abstract',
    'Acknowledgments, Disclosures, Author Contributions (CRediT), Data Availability Statement',
    '1. Introduction',
    '2. Materials and Methods',
    '3. Results',
    '4. Discussion',
    '5. Conclusions',
    'Figure Legends dan Tables',
    'References',
    'Lampiran A — Checklist Kepatuhan Drug Target Insights',
    'Lampiran B — Kerangka Cover Letter'
  ]
where slug = 'template-q3';

update public.products set
  deskripsi = 'Template Word (.docx) 6 halaman mengikuti Instructions for Authors Ratarstvo i povrtarstvo (double-blind): title, summary, introduction, materials and methods, results, discussion, conclusions, tabel dan gambar, acknowledgments dan author statements, dan referensi — plus checklist kepatuhan dan kerangka surat pengantar.',
  format = 'docx',
  isi_template = array[
    'Cara memakai template ini',
    'Title dan Summary',
    '1. Introduction',
    '2. Materials and Methods',
    '3. Results',
    '4. Discussion',
    '5. Conclusions',
    'Tables and Figures',
    'Acknowledgments and Author Statements',
    'References',
    'Lampiran A — Checklist Kepatuhan Ratarstvo i povrtarstvo',
    'Lampiran B — Kerangka Surat Pengantar'
  ]
where slug = 'template-q4';

update public.products set
  deskripsi = 'Template Word (.docx) 5 halaman berbahasa Indonesia mengikuti author guidelines Jurnal Pendidikan (Sinta 5): halaman judul, abstrak Indonesia dan Inggris, pendahuluan, metode, hasil dan pembahasan, kesimpulan, ucapan terima kasih, dan daftar pustaka — plus checklist pra-submit.',
  format = 'docx',
  isi_template = array[
    'Cara memakai template ini',
    'Halaman Judul',
    'Abstrak (Indonesia dan Inggris)',
    'Pendahuluan',
    'Metode (Desain, Data dan Sumber Data, Prosedur dan Analisis Data)',
    'Hasil dan Pembahasan',
    'Kesimpulan',
    'Ucapan Terima Kasih',
    'Daftar Pustaka',
    'Lampiran A — Checklist Pra-Submit'
  ]
where slug = 'template-sinta';

update public.products set
  deskripsi = 'Template Word (.docx) 4 halaman mengikuti panduan persiapan naskah AIP Conference Proceedings: introduction, methods, results and discussion, conclusion, acknowledgments, dan references — plus checklist pra-submit. Tanpa header, footer, dan nomor halaman, sesuai ketentuan AIP.',
  format = 'docx',
  isi_template = array[
    'How to Use This Template',
    'Introduction',
    'Methods (Research Design, Data and Procedures, Analysis)',
    'Results and Discussion',
    'Conclusion',
    'Acknowledgments',
    'References',
    'Appendix A — Pre-Submission Checklist'
  ]
where slug = 'template-prosiding';

-- 4) Paket Lengkap: satu file ZIP berisi keenam template .docx.
--    Upsert (bukan UPDATE) supaya aman bila migrasi seed harga belum jalan.
insert into public.products (slug, judul, jenjang, deskripsi, format, isi_template, is_visible) values
  ('paket-lengkap', 'Paket Lengkap', 'Paket',
   'Satu file ZIP berisi keenam template Word (.docx): Scopus Q1, Q2, Q3, Q4, Sinta, dan Prosiding — lengkap dengan checklist pra-submit dan kerangka cover letter di tiap template.',
   'zip',
   array[
     'Template_Scopus_Q1.docx',
     'Template_Scopus_Q2.docx',
     'Template_Scopus_Q3.docx',
     'Template_Scopus_Q4.docx',
     'Template_Sinta.docx',
     'Template_Prosiding.docx'
   ],
   false)
on conflict (slug) do update set
  deskripsi = excluded.deskripsi,
  format = excluded.format,
  isi_template = excluded.isi_template;
