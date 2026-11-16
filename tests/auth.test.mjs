// Uji logika auth murni (tanpa DB): validasi nama/email/sandi + safeNext.
// Jalankan lewat `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLib } from './helpers.mjs';

const auth = await loadLib('auth.ts');
const { cleanName, cleanEmail, validPassword, safeNext } = auth;

test('cleanName: ciutkan spasi, trim, maks 80 karakter', () => {
  assert.equal(cleanName('  Nabil   Aulia  Dika '), 'Nabil Aulia Dika');
  assert.equal(cleanName(''), null);
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName(123), null);
  assert.equal(cleanName('A'.repeat(100)).length, 80);
});

test('cleanEmail: kecilkan + trim, tolak yang tidak valid', () => {
  assert.equal(cleanEmail('  Nabil@Contoh.ID '), 'nabil@contoh.id');
  assert.equal(cleanEmail('bukan-email'), null);
  assert.equal(cleanEmail('a@b'), null);
  assert.equal(cleanEmail(''), null);
  assert.equal(cleanEmail(null), null);
  assert.equal(cleanEmail(`a@${'b'.repeat(250)}.com`), null);
});

test('validPassword: panjang 8..72 (batas bcrypt)', () => {
  assert.equal(validPassword('1234567'), false);
  assert.equal(validPassword('12345678'), true);
  assert.equal(validPassword('x'.repeat(72)), true);
  assert.equal(validPassword('x'.repeat(73)), false);
  assert.equal(validPassword(''), false);
  assert.equal(validPassword(null), false);
  assert.equal(validPassword(12345678), false);
});

test('safeNext: hanya path internal', () => {
  assert.equal(safeNext('/akun'), '/akun');
  assert.equal(safeNext('/admin/masuk'), '/admin/masuk');
  assert.equal(safeNext('//evil.com'), '/akun');
  assert.equal(safeNext('https://evil.com'), '/akun');
  assert.equal(safeNext('/\\evil'), '/akun');
  assert.equal(safeNext('javascript:alert(1)'), '/akun');
  assert.equal(safeNext(null), '/akun');
  assert.equal(safeNext('', '/masuk'), '/masuk');
  assert.equal(safeNext('//evil.com', '/admin'), '/admin');
});
