// Uji konten T7 (CHECKLIST I1-I6, J1). cwd = folder proyek, server di 127.0.0.1:4400.
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const proj = process.cwd();
const req = createRequire(path.join(proj, 'package.json'));
const { createClient } = req('@supabase/supabase-js');

const env = {};
for (const l of fs.readFileSync(path.join(proj, '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const BASE = 'http://127.0.0.1:4400';
const tag = Date.now().toString(36);
const results = [];
const check = (name, ok, info = '') => { results.push([name, ok]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? '  ' + info : '')); };
const page = async (p) => { const r = await fetch(BASE + p, { redirect: 'manual' }); return { status: r.status, html: await r.text() }; };
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

(async () => {
  const slugs = [];
  try {
    const PAGES = ['/', '/tentang', '/bantuan', '/templates', '/konsultasi', '/keranjang', '/masuk', '/daftar'];
    const got = {};
    for (const p of PAGES) got[p] = await page(p);

    // I1 harga dari data
    const before = text(got['/'].html);
    check('I1 beranda tanpa produk berharga: "Harga template diumumkan"', /Harga template diumumkan/.test(before) || /Mulai dari/.test(before));
    const mk = async (n, harga) => {
      const { data, error } = await admin.from('products').insert({ slug: `uji-${n}-${tag}`, judul: `Uji ${n} ${tag}`, jenjang: 'Q3', harga, is_visible: true }).select('id,slug').single();
      if (error) throw error;
      slugs.push(data.slug);
      return data;
    };
    await mk('mahal', 777000);
    const murah = await mk('murah', 12345);
    let h = text((await page('/')).html);
    check('I1 beranda "Mulai dari Rp12.345" (min dari data)', h.includes('Mulai dari Rp12.345'), (h.match(/Mulai dari[^.]*/) || [''])[0]);
    check('I1 beranda menampilkan produk uji + harga dari data', h.includes(`Uji murah ${tag}`) && h.includes('Rp12.345') && h.includes('Rp777.000'));
    await admin.from('products').update({ harga: 5000 }).eq('id', murah.id);
    h = text((await page('/')).html);
    check('I1 harga diubah -> beranda ikut berubah', h.includes('Mulai dari Rp5.000') && !h.includes('Rp12.345'));
    await admin.from('products').update({ is_visible: false }).like('slug', 'uji-%');
    h = text((await page('/')).html);
    check('I1 produk disembunyikan -> hilang dari beranda', !h.includes(`Uji murah ${tag}`));

    // I2 Tentang
    const tentang = text(got['/tentang'].html);
    check('I2 /tentang 200', got['/tentang'].status === 200);
    for (const must of ['Universitas Serambi Mekkah', '4 artikel', 'SINTA Score 95', 'PLOS ONE', 'PLOS Global Public Health', '0009-0009-0254-1920', '58763735100', '6983413'])
      check(`I2 memuat klaim terverifikasi: ${must}`, tentang.includes(must));
    check('I2 tautan ke ORCID/Scopus/SINTA ada', ['orcid.org/0009-0009-0254-1920', 'authorId=58763735100', 'profile/6983413'].every((u) => got['/tentang'].html.includes(u)));
    check('I2 tautan eksternal rel=noopener', !/target="_blank"(?![^>]*noopener)/.test(got['/tentang'].html));
    check('I2 tanpa klaim magang Chiba', !/chiba/i.test(tentang));

    // I3 angka & label terlarang (seluruh halaman publik)
    const all = PAGES.map((p) => text(got[p].html)).join(' \n ');
    check('I3 tanpa "5 Q1/Q2" / "9 ongoing"', !/5\s*(artikel\s*)?Q1\s*\/?\s*Q2|9\s*ongoing|ongoing/i.test(all));
    check('I3 tanpa "JCSR" / "Sinta 3" / "Ragam Pengabdian"', !/JCSR|Sinta\s*3|Ragam Pengabdian/i.test(all));

    // I4 kata garansi
    const bad = all.match(/garansi|guarantee|acceptance|lolos|dijamin|pasti (diterima|terbit)/gi);
    check('I4 tanpa garansi/lolos/acceptance/dijamin di halaman publik', !bad, bad ? bad.join(',') : '');
    const detail = await page(`/templates/${slugs[0]}`);
    await admin.from('products').update({ is_visible: true }).eq('slug', slugs[0]);
    const d2 = text((await page(`/templates/${slugs[0]}`)).html);
    const bad2 = d2.match(/garansi|guarantee|acceptance|lolos|dijamin|pasti (diterima|terbit)/gi);
    check('I4 halaman detail produk juga bersih', !bad2, bad2 ? bad2.join(',') : '');

    // I5 Bantuan
    const bant = got['/bantuan'];
    check('I5 /bantuan 200', bant.status === 200);
    for (const id of ['cara', 'lisensi', 'refund', 'privasi', 'kontak']) check(`I5 bagian #${id}`, new RegExp(`id="${id}"`).test(bant.html));
    const bt = text(bant.html);
    check('I5 refund eksplisit: sudah diunduh umumnya tidak direfund + pengecualian', /sudah diunduh/.test(bt) && /rusak/.test(bt) && /bukan produk yang kamu beli/.test(bt));
    check('I5 lisensi: dilarang menjual ulang', /Dilarang menjual ulang/.test(bt));
    check('I5 footer memuat tautan Tentang/Bantuan', got['/'].html.includes('href="/tentang"') && got['/'].html.includes('href="/bantuan#refund"'));

    // I6 tanpa data pribadi
    const pii = all.match(/(\+?62|08)\d{8,12}|[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook)\.[a-z.]+/gi);
    check('I6 tanpa nomor HP / email pribadi', !pii, pii ? pii.join(',') : '');
    check('I6 tanpa kata alamat rumah', !/alamat rumah|jl\.\s|jalan\s+[A-Z]/i.test(all));

    // J1 konsultasi
    const kons = text(got['/konsultasi'].html);
    check('J1 konsultasi "segera hadir"', /segera hadir/i.test(kons));
    check('J1 konsultasi tanpa harga Rp', !/Rp\s?\d/.test(kons));

    // semua halaman 200 & ada <title> + lang
    for (const p of PAGES) check(`halaman ${p} 200`, got[p].status === 200, got[p].status);
    check('<html lang="id">', /<html[^>]*lang="id"/.test(got['/tentang'].html));
  } catch (e) {
    console.log('ERROR', e && e.stack ? e.stack : e);
    results.push(['error', false]);
  } finally {
    try {
      await admin.from('products').delete().like('slug', 'uji-%');
      const left = await admin.from('products').select('id').like('slug', 'uji-%');
      console.log('bersih: produk uji tersisa =', left.data && left.data.length);
    } catch (e) { console.log('CLEANUP ERROR', e.message); }
    const bad = results.filter((x) => !x[1]).length;
    console.log(bad ? `GAGAL ${bad}/${results.length}` : `SEMUA LOLOS ${results.length}`);
    process.exit(bad ? 1 : 0);
  }
})();
