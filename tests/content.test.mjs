// Uji logika kelola konten murni (tanpa DB): validasi form + daftar kunci.
// Jalankan lewat `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLib } from './helpers.mjs';

const content = await loadLib('content.ts');
const { CONTENT_KEYS, DEFAULT_CONTENT, CONTENT_BODY_MAX, isContentKey, parseContentForm } = content;

const form = (entries) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

test('CONTENT_KEYS: tepat 3 kunci yang dikenal', () => {
  assert.deepEqual(Object.keys(CONTENT_KEYS).sort(), ['bantuan.kontak', 'beranda.intro', 'tentang.intro']);
  assert.equal(isContentKey('tentang.intro'), true);
  assert.equal(isContentKey('tentang.lain'), false);
  assert.equal(isContentKey(''), false);
  assert.equal(isContentKey(null), false);
});

test('DEFAULT_CONTENT: teks bawaan sama persis dengan halaman sekarang', () => {
  assert.ok(DEFAULT_CONTENT['beranda.intro'].startsWith('Template yang sudah disesuaikan'));
  assert.ok(DEFAULT_CONTENT['tentang.intro'].startsWith('ArticleTemplate.id menjual template artikel'));
  assert.ok(DEFAULT_CONTENT['bantuan.kontak'].startsWith('Kanal bantuan resmi akan diumumkan'));
  for (const v of Object.values(DEFAULT_CONTENT)) assert.ok(v.length > 0);
});

test('parseContentForm: kunci + isi valid diterima', () => {
  const r = parseContentForm(form({ key: 'tentang.intro', body: '  Halo dunia  ' }));
  assert.equal(r.ok, true);
  assert.equal(r.data.key, 'tentang.intro');
  assert.equal(r.data.body, 'Halo dunia');
});

test('parseContentForm: kunci tidak dikenal ditolak', () => {
  const r = parseContentForm(form({ key: 'tentang.rahasi', body: 'x' }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('tidak dikenal')));
});

test('parseContentForm: isi kosong / terlalu panjang ditolak', () => {
  assert.equal(parseContentForm(form({ key: 'beranda.intro', body: '   ' })).ok, false);
  assert.equal(parseContentForm(form({ key: 'beranda.intro', body: '' })).ok, false);
  assert.equal(parseContentForm(form({ key: 'beranda.intro', body: 'x'.repeat(CONTENT_BODY_MAX + 1) })).ok, false);
  assert.equal(parseContentForm(form({ key: 'beranda.intro', body: 'x'.repeat(CONTENT_BODY_MAX) })).ok, true);
});

test('parseContentForm: CRLF dinormalisasi ke LF', () => {
  const r = parseContentForm(form({ key: 'bantuan.kontak', body: 'baris 1\r\nbaris 2' }));
  assert.equal(r.ok, true);
  assert.equal(r.data.body, 'baris 1\nbaris 2');
});
