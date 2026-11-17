// Uji pemilihan provider email (Brevo / Resend) dengan fetch palsu. Tanpa jaringan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLib } from './helpers.mjs';

const { sendEmail } = await loadLib('email.ts');
const msg = { to: 'pembeli@example.com', subject: 'Tes', html: '<p>hai</p>', text: 'hai' };

function mockFetch(status, body) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}
function env(vars) {
  for (const k of ['BREVO_API_KEY', 'RESEND_API_KEY', 'EMAIL_FROM']) delete process.env[k];
  Object.assign(process.env, vars);
}

test('BREVO_API_KEY terisi -> kirim lewat Brevo dengan format yang benar', async () => {
  env({ BREVO_API_KEY: 'xkeysib-uji', EMAIL_FROM: 'toko@example.com', RESEND_API_KEY: 'tidak-dipakai' });
  const calls = mockFetch(201, { messageId: '<abc@brevo>' });
  const r = await sendEmail(msg);
  assert.deepEqual(r, { ok: true, id: '<abc@brevo>' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].init.headers['api-key'], 'xkeysib-uji');
  const b = JSON.parse(calls[0].init.body);
  assert.deepEqual(b.sender, { name: 'ArticleTemplate.id', email: 'toko@example.com' });
  assert.deepEqual(b.to, [{ email: 'pembeli@example.com' }]);
  assert.equal(b.subject, 'Tes');
  assert.equal(b.htmlContent, '<p>hai</p>');
  assert.equal(b.textContent, 'hai');
});

test('Brevo menolak -> ok:false dengan kode dan pesan', async () => {
  env({ BREVO_API_KEY: 'k', EMAIL_FROM: 'toko@example.com' });
  mockFetch(400, { code: 'invalid_parameter', message: 'sender tidak valid' });
  const r = await sendEmail(msg);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Brevo 400: invalid_parameter sender tidak valid/);
});

test('Brevo tanpa EMAIL_FROM -> ok:false, tidak memanggil jaringan', async () => {
  env({ BREVO_API_KEY: 'k' });
  const calls = mockFetch(201, {});
  const r = await sendEmail(msg);
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test('tanpa BREVO_API_KEY -> tetap Resend seperti sebelumnya', async () => {
  env({ RESEND_API_KEY: 're_uji', EMAIL_FROM: 'toko@example.com' });
  const calls = mockFetch(200, { id: 'resend-1' });
  const r = await sendEmail(msg);
  assert.deepEqual(r, { ok: true, id: 'resend-1' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_uji');
  assert.equal(JSON.parse(calls[0].init.body).from, 'ArticleTemplate.id <toko@example.com>');
});

test('tanpa kunci apa pun -> ok:false, tidak memanggil jaringan', async () => {
  env({ EMAIL_FROM: 'toko@example.com' });
  const calls = mockFetch(200, {});
  const r = await sendEmail(msg);
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});
