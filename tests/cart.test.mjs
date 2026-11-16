// Uji logika keranjang murni (tanpa DB): cookie + validasi slug.
// Termasuk semantik "Beli sekarang": writeCart([slug]) MENGGANTI isi keranjang
// lama dengan satu produk itu saja (rute /keranjang/beli-sekarang).
// Jalankan lewat `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLib } from './helpers.mjs';

const cart = await loadLib('cart.ts');
const { readCart, writeCart, isValidSlug } = cart;

/** Cookie jar palsu dengan antarmuka AstroCookies yang dipakai cart.ts. */
function makeJar(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    cookies: {
      get: (name) => {
        const v = store.get(name);
        return v === undefined ? undefined : { value: v };
      },
      set: (name, value) => { store.set(name, value); },
      delete: (name) => { store.delete(name); },
    },
    store,
  };
}

test('isValidSlug: format slug produk', () => {
  assert.equal(isValidSlug('template-q1'), true);
  assert.equal(isValidSlug('a'), true);
  assert.equal(isValidSlug('Template-Q1'), false);
  assert.equal(isValidSlug('a b'), false);
  assert.equal(isValidSlug('a/b'), false);
  assert.equal(isValidSlug(''), false);
  assert.equal(isValidSlug(null), false);
  assert.equal(isValidSlug('x'.repeat(82)), false);
});

test('readCart: kosong / rusak / bukan array -> []', () => {
  assert.deepEqual(readCart(makeJar().cookies), []);
  assert.deepEqual(readCart(makeJar({ cart: 'bukan-json' }).cookies), []);
  assert.deepEqual(readCart(makeJar({ cart: '{"a":1}' }).cookies), []);
  assert.deepEqual(readCart(makeJar({ cart: 'null' }).cookies), []);
});

test('readCart: buang yang tidak valid, dedupe, batasi 20', () => {
  const many = Array.from({ length: 25 }, (_, i) => `p-${i}`);
  const jar = makeJar({ cart: JSON.stringify(['a', 'B', 'a', 'x y', ...many]) });
  const got = readCart(jar.cookies);
  assert.equal(got.length, 20);
  assert.equal(got[0], 'a');
  assert.ok(!got.includes('B'));
  assert.ok(!got.includes('x y'));
});

test('writeCart: simpan JSON, kosong -> hapus cookie', () => {
  const jar = makeJar();
  writeCart(jar.cookies, ['template-q1', 'template-q2']);
  assert.deepEqual(readCart(jar.cookies), ['template-q1', 'template-q2']);
  writeCart(jar.cookies, []);
  assert.equal(jar.store.has('cart'), false);
  assert.deepEqual(readCart(jar.cookies), []);
});

test('writeCart: dedupe + batasi 20', () => {
  const jar = makeJar();
  writeCart(jar.cookies, ['a', 'a', ...Array.from({ length: 25 }, (_, i) => `p-${i}`)]);
  assert.equal(readCart(jar.cookies).length, 20);
});

test('beli sekarang: writeCart([slug]) mengganti isi keranjang lama', () => {
  const jar = makeJar();
  writeCart(jar.cookies, ['template-q1', 'template-q2']);
  writeCart(jar.cookies, ['template-sinta']);
  assert.deepEqual(readCart(jar.cookies), ['template-sinta']);
});
