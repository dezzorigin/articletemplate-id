// Uji logika auth murni (tanpa DB): validasi nama/email/sandi + safeNext.
// Jalankan lewat `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLib } from './helpers.mjs';

const auth = await loadLib('auth.ts');
const { cleanName, cleanEmail, validPassword, safeNext, isExampleDomain, signUpErrorCode, isNotConfirmedError, validFlowId, isVerifierError, verifyOtpErrorCode } = auth;

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

test('cleanEmail: tolak domain contoh/tes (GoTrue menolaknya dengan email_address_invalid)', () => {
  assert.equal(cleanEmail('user@example.com'), null);
  assert.equal(cleanEmail('user@example.net'), null);
  assert.equal(cleanEmail('user@example.org'), null);
  assert.equal(cleanEmail('USER@EXAMPLE.COM'), null);
  assert.equal(cleanEmail('user@gmail.com'), 'user@gmail.com');
  assert.equal(cleanEmail('user@nabil.ai.id'), 'user@nabil.ai.id');
});

test('isExampleDomain: hanya domain contoh/tes', () => {
  assert.equal(isExampleDomain('a@example.com'), true);
  assert.equal(isExampleDomain('a@example.edu'), true);
  assert.equal(isExampleDomain('a@gmail.com'), false);
  assert.equal(isExampleDomain('bukan-email'), false);
  assert.equal(isExampleDomain(null), false);
});

test('signUpErrorCode: petakan kode + pesan GoTrue ke kode ?e=...', () => {
  // Domain contoh/tes ditolak GoTrue.
  assert.equal(signUpErrorCode({ code: 'email_address_invalid', message: 'Email address is invalid', status: 422 }), 'domain');
  assert.equal(signUpErrorCode({ code: 'unexpected_failure', message: 'Email address is invalid', status: 422 }), 'domain');
  // Email sudah terdaftar (ditangani khusus di daftar.ts: balas seperti sukses).
  assert.equal(signUpErrorCode({ code: 'user_already_exists', message: 'User already registered', status: 422 }), 'terdaftar');
  assert.equal(signUpErrorCode({ code: 'unexpected_failure', message: 'User already registered', status: 422 }), 'terdaftar');
  // Pendaftaran dimatikan di server.
  assert.equal(signUpErrorCode({ code: 'signup_disabled', message: 'Sign ups are disabled', status: 422 }), 'nonaktif');
  assert.equal(signUpErrorCode({ code: 'email_provider_disabled', message: 'Signups are disabled for email and password', status: 422 }), 'nonaktif');
  // Email konfirmasi tidak bisa dikirim (SMTP self-hosted belum dikonfigurasi).
  assert.equal(signUpErrorCode({ code: 'unexpected_failure', message: 'Error sending confirmation mail', status: 500 }), 'email');
  assert.equal(signUpErrorCode({ code: 'email_address_not_authorized', message: 'Email address not authorized', status: 400 }), 'email');
  // Rate limit kirim email Auth.
  assert.equal(signUpErrorCode({ code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded', status: 429 }), 'batas');
  assert.equal(signUpErrorCode({ code: 'unexpected_failure', message: 'Rate limit exceeded', status: 429 }), 'batas');
  // URL pengalihan tidak diizinkan.
  assert.equal(signUpErrorCode({ code: 'validation_failed', message: 'Redirect URL not allowed', status: 422 }), 'tautan');
  // Tidak dikenal / kosong -> generik.
  assert.equal(signUpErrorCode({ code: 'unexpected_failure', message: 'Database error', status: 500 }), 'gagal');
  assert.equal(signUpErrorCode(null), 'gagal');
  assert.equal(signUpErrorCode(undefined), 'gagal');
});

test('isNotConfirmedError: kode atau pesan GoTrue', () => {
  assert.equal(isNotConfirmedError({ code: 'email_not_confirmed', message: 'Email not confirmed', status: 401 }), true);
  assert.equal(isNotConfirmedError({ code: 'unexpected_failure', message: 'Email not confirmed', status: 401 }), true);
  assert.equal(isNotConfirmedError({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 }), false);
  assert.equal(isNotConfirmedError(null), false);
});

test('validFlowId: pola flow id PKCE auth-js (8..64 karakter [A-Za-z0-9_-])', () => {
  assert.equal(validFlowId('9667b22e30bb0fbca74e1d550c94de92'), true);
  assert.equal(validFlowId('aB-3_9xQ'), true);
  assert.equal(validFlowId('pendek'), false);
  assert.equal(validFlowId('a'.repeat(65)), false);
  assert.equal(validFlowId('ada spasi'), false);
  assert.equal(validFlowId('ada/tanda'), false);
  assert.equal(validFlowId(null), false);
  assert.equal(validFlowId(undefined), false);
});

test('isVerifierError: bad_code_verifier / verifier hilang (bukan tautan tidak valid)', () => {
  assert.equal(isVerifierError({ code: 'bad_code_verifier', message: 'Bad code verifier', status: 400 }), true);
  assert.equal(isVerifierError({ code: 'pkce_code_verifier_not_found', message: 'PKCE code verifier not found', status: 400 }), true);
  assert.equal(isVerifierError({ code: 'unexpected_failure', message: 'PKCE code verifier not found in storage', status: 400, name: 'AuthPKCECodeVerifierMissingError' }), true);
  assert.equal(isVerifierError({ code: 'otp_expired', message: 'Email link is invalid or has expired', status: 403 }), false);
  assert.equal(isVerifierError({ code: 'unexpected_failure', message: 'Database error', status: 500 }), false);
  assert.equal(isVerifierError(null), false);
});

test('verifyOtpErrorCode: petakan error verifyOtp kode 6 digit ke kode ?e=...', () => {
  assert.equal(verifyOtpErrorCode({ code: 'otp_expired', message: 'Email link is invalid or has expired', status: 403 }), 'kode');
  assert.equal(verifyOtpErrorCode({ code: 'unexpected_failure', message: 'Token has expired or is invalid', status: 403 }), 'kode');
  assert.equal(verifyOtpErrorCode({ code: 'over_request_rate_limit', message: 'Rate limit exceeded', status: 429 }), 'batas');
  assert.equal(verifyOtpErrorCode({ code: 'unexpected_failure', message: 'Database error', status: 500 }), 'gagal');
  assert.equal(verifyOtpErrorCode(null), 'gagal');
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
