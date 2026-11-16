// Uji logika katalog murni (tanpa DB): parse query + facet.
// Jalankan lewat `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLib } from './helpers.mjs';

const catalog = await loadLib('catalog.ts');
const { parseCatalogQuery, uniqueSorted, jenjangRank, sortByJenjang, formatLabel } = catalog;

const q = (s) => parseCatalogQuery(new URLSearchParams(s));

test('parseCatalogQuery: jenjang + bidang + jurnal + q + urut', () => {
  const r = q('jenjang=Q1&bidang=Ilmu%20Komputer&jurnal=JCCE&q=tema&urut=harga-naik');
  assert.equal(r.jenjang, 'Q1');
  assert.equal(r.bidang, 'Ilmu Komputer');
  assert.equal(r.jurnal, 'JCCE');
  assert.equal(r.q, 'tema');
  assert.equal(r.urut, 'harga-naik');
});

test('parseCatalogQuery: nilai di luar daftar putih diabaikan', () => {
  const r = q('jenjang=Q9&urut=acak');
  assert.equal(r.jenjang, undefined);
  assert.equal(r.urut, 'jenjang');
});

test('parseCatalogQuery: kosong -> undefined, urut default jenjang', () => {
  const r = q('');
  assert.equal(r.jenjang, undefined);
  assert.equal(r.bidang, undefined);
  assert.equal(r.jurnal, undefined);
  assert.equal(r.q, undefined);
  assert.equal(r.urut, 'jenjang');
});

test('parseCatalogQuery: karakter sintaks PostgREST/LIKE dibersihkan', () => {
  const r = q('bidang=A%2CB%28C%29&jurnal=X%22Y%27Z&q=a%2Cb');
  assert.equal(r.bidang, 'A B C');
  assert.equal(r.jurnal, 'X Y Z');
  assert.equal(r.q, 'a b');
});

test('parseCatalogQuery: spasi berlebih diciutkan, panjang dibatasi 60', () => {
  const r = q(`bidang=${'  Ilmu   Komputer  '}&jurnal=${'J'.repeat(80)}`);
  assert.equal(r.bidang, 'Ilmu Komputer');
  assert.equal(r.jurnal.length, 60);
});

test('jenjangRank + sortByJenjang: Q1 -> Q2 -> Q3 -> Q4 -> Sinta -> Prosiding -> Paket', () => {
  assert.equal(jenjangRank('Q1'), 0);
  assert.equal(jenjangRank('Q4'), 3);
  assert.equal(jenjangRank('Sinta'), 4);
  assert.equal(jenjangRank('Prosiding'), 5);
  assert.equal(jenjangRank('Paket'), 6);
  assert.equal(jenjangRank('Q9'), 7);
  assert.equal(jenjangRank(null), 7);
  const acak = ['Paket', 'Q2', 'Q3', 'Q1', 'Sinta', 'Prosiding', 'Q4'].map((j) => ({ jenjang: j }));
  assert.deepEqual(sortByJenjang(acak).map((p) => p.jenjang), [
    'Q1', 'Q2', 'Q3', 'Q4', 'Sinta', 'Prosiding', 'Paket',
  ]);
});

test('formatLabel: docx/zip/latex + nilai tak dikenal', () => {
  assert.equal(formatLabel('docx'), 'Word (.docx)');
  assert.equal(formatLabel('zip'), 'ZIP (.zip)');
  assert.equal(formatLabel('latex'), 'LaTeX (.tex)');
  assert.equal(formatLabel('docx+latex'), 'Word + LaTeX (.docx, .tex)');
  assert.equal(formatLabel('DOCX'), 'Word (.docx)');
  assert.equal(formatLabel(null), null);
  assert.equal(formatLabel(''), null);
  assert.equal(formatLabel('pdf'), 'pdf');
});

test('uniqueSorted: buang kosong/duplikat, urut abjad', () => {
  assert.deepEqual(
    uniqueSorted(['Sinta', null, 'Q1', '  ', 'Q1', undefined, 'Prosiding', 'Q1 ']),
    ['Prosiding', 'Q1', 'Sinta'],
  );
  assert.deepEqual(uniqueSorted([]), []);
  assert.deepEqual(uniqueSorted([null, undefined, '']), []);
});
