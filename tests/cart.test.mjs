// Uji logika keranjang murni (tanpa DB): cookie + validasi slug.
// Termasuk semantik "Beli sekarang": writeCart([slug]) MENGGANTI isi keranjang
// lama dengan satu produk itu saja (rute /keranjang/beli-sekarang).
// Jalankan lewat `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLib } from './helpers.mjs';

const cart = await loadLib('cart.ts');
const { readCart, readCartItems, writeCart, writeCartItems, isValidSlug, MAX_QTY } = cart;

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

test('readCartItems: format baru {slug, qty} + format lama tetap dibaca qty 1', () => {
  const jar = makeJar({
    cart: JSON.stringify([{ slug: 'template-q1', qty: 3 }, 'template-q2']),
  });
  assert.deepEqual(readCartItems(jar.cookies), [
    { slug: 'template-q1', qty: 3 },
    { slug: 'template-q2', qty: 1 },
  ]);
});

test('readCart: slug diulang per qty (dipakai checkout untuk hitung unit)', () => {
  const jar = makeJar();
  writeCartItems(jar.cookies, [
    { slug: 'template-q1', qty: 2 },
    { slug: 'template-sinta', qty: 1 },
  ]);
  assert.deepEqual(readCart(jar.cookies), ['template-q1', 'template-q1', 'template-sinta']);
});

test('writeCartItems: qty dijepit 1..MAX_QTY, slug tidak valid dibuang', () => {
  const jar = makeJar();
  writeCartItems(jar.cookies, [
    { slug: 'a', qty: 0 },
    { slug: 'b', qty: 500 },
    { slug: 'C', qty: 2 },
    { slug: 'd', qty: 2.7 },
  ]);
  assert.deepEqual(readCartItems(jar.cookies), [
    { slug: 'a', qty: 1 },
    { slug: 'b', qty: MAX_QTY },
    { slug: 'd', qty: 2 },
  ]);
  assert.equal(MAX_QTY, 99);
});

test('writeCartItems: dedupe per slug + batasi 20 item berbeda', () => {
  const jar = makeJar();
  writeCartItems(jar.cookies, [
    { slug: 'a', qty: 2 },
    { slug: 'a', qty: 5 },
    ...Array.from({ length: 25 }, (_, i) => ({ slug: `p-${i}`, qty: 1 })),
  ]);
  const items = readCartItems(jar.cookies);
  assert.equal(items.length, 20);
  assert.deepEqual(items[0], { slug: 'a', qty: 2 });
});

test('writeCart (kompat lama): slug -> qty 1, menimpa qty lama', () => {
  const jar = makeJar();
  writeCartItems(jar.cookies, [{ slug: 'template-q1', qty: 3 }]);
  writeCart(jar.cookies, ['template-q1', 'template-q2']);
  assert.deepEqual(readCartItems(jar.cookies), [
    { slug: 'template-q1', qty: 1 },
    { slug: 'template-q2', qty: 1 },
  ]);
  writeCart(jar.cookies, []);
  assert.equal(jar.store.has('cart'), false);
});
