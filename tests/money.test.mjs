// Uji logika uang murni: satu sumber harga/total.
// Jalankan lewat `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLib } from './helpers.mjs';

const money = await loadLib('money.ts');
const { isPurchasable, formatRupiah, cartTotal } = money;

test('isPurchasable: hanya angka > 0', () => {
  assert.equal(isPurchasable(249000), true);
  assert.equal(isPurchasable(1), true);
  assert.equal(isPurchasable(0), false);
  assert.equal(isPurchasable(-5), false);
  assert.equal(isPurchasable(null), false);
  assert.equal(isPurchasable(undefined), false);
  assert.equal(isPurchasable(Number.NaN), false);
  assert.equal(isPurchasable(Infinity), false);
});

test('formatRupiah: format id-ID; tanpa harga -> teks pengganti', () => {
  assert.equal(formatRupiah(249000), 'Rp249.000');
  assert.equal(formatRupiah(1500), 'Rp1.500');
  assert.equal(formatRupiah(null), 'Harga segera hadir');
  assert.equal(formatRupiah(undefined), 'Harga segera hadir');
  assert.equal(formatRupiah(0), 'Harga segera hadir');
});

test('cartTotal: jumlahkan, tolak item tanpa harga final', () => {
  assert.equal(cartTotal([]), 0);
  assert.equal(cartTotal([{ harga: 100000 }, { harga: 50000 }]), 150000);
  assert.equal(cartTotal([{ harga: 999.6 }]), 1000);
  assert.throws(() => cartTotal([{ harga: null }]), /tanpa harga final/);
  assert.throws(() => cartTotal([{ harga: 100 }, { harga: undefined }]), /tanpa harga final/);
});
