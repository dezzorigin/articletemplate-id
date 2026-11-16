// Uji logika BorderPay TANPA jaringan dan TANPA kredensial asli.
// Jalankan: node scripts/test-borderpay.mjs  (setelah `npm ci` — memakai
// esbuild dari node_modules untuk membundel src/lib/borderpay.ts).
// Token/key yang dipakai di sini DUMMY, bukan nilai asli mana pun.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const outDir = mkdtempSync(join(tmpdir(), 'bp-test-'));
const bundle = join(outDir, 'borderpay.mjs');
execFileSync(join(root, 'node_modules', '.bin', 'esbuild'), [
  join(root, 'src', 'lib', 'borderpay.ts'),
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${bundle}`,
], { stdio: 'pipe' });
const bp = await import(pathToFileURL(bundle).href);

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  GAGAL ${name}`); }
};

console.log('== 1. verifyBorderPayToken: terima/tolak ==');
// Skema terkonfirmasi: header x-borderpay-token dicocokkan dengan token env.
const TOKEN = 'dummy-webhook-token-untuk-uji';
const V = (tokenHeader, token = TOKEN) => bp.verifyBorderPayToken({ tokenHeader, token });
check('token cocok diterima', V(TOKEN));
check('token salah ditolak', !V('token-yang-salah'));
check('tanpa header ditolak', !V(null));
check('header kosong ditolak', !V(''));
check('header spasi saja ditolak', !V('   '));
check('tanpa token env ditolak', !bp.verifyBorderPayToken({ tokenHeader: TOKEN, token: undefined }));
check('token env kosong ditolak', !bp.verifyBorderPayToken({ tokenHeader: TOKEN, token: '' }));
check('beda huruf besar/kecil ditolak', !V(TOKEN.toUpperCase()));
check('token + spasi di ujung diterima (trim)', V(`  ${TOKEN}  `));
check('token lebih panjang ditolak', !V(TOKEN + 'x'));
check('token lebih pendek ditolak', !V(TOKEN.slice(0, -1)));

console.log('== 2. verifyBorderPayToken lewat Headers ==');
const h = new Headers({ 'X-Borderpay-Token': TOKEN });
check('header x-borderpay-token terbaca + cocok', bp.verifyBorderPayToken({ tokenHeader: h.get('x-borderpay-token'), token: TOKEN }));
const h2 = new Headers({});
check('header tak ada -> ditolak', !bp.verifyBorderPayToken({ tokenHeader: h2.get('x-borderpay-token'), token: TOKEN }));

console.log('== 3. mapBorderPayEvent ==');
check('payment.paid -> lunas', bp.mapBorderPayEvent('payment.paid') === 'lunas');
check('payment.expired -> kedaluwarsa', bp.mapBorderPayEvent('payment.expired') === 'kedaluwarsa');
check('payment.failed -> gagal', bp.mapBorderPayEvent('payment.failed') === 'gagal');
check('event tak dikenal -> null', bp.mapBorderPayEvent('payment.refunded') === null);
check('string kosong -> null', bp.mapBorderPayEvent('') === null);

console.log('== 4. buildCreatePaymentRequest ==');
const cfg = { apiKey: 'bp_test_dummy', baseUrl: 'https://api-contoh.invalid', webhookToken: undefined };
const req = bp.buildCreatePaymentRequest(cfg, { amount: 249000, method: 'qris', referenceId: '00000000-0000-4000-8000-000000000000' });
check('URL = base + /api/v1/payments', req.url === 'https://api-contoh.invalid/api/v1/payments');
check('auth Bearer', req.headers.Authorization === 'Bearer bp_test_dummy');
check('Idempotency-Key = referenceId', req.headers['Idempotency-Key'] === '00000000-0000-4000-8000-000000000000');
check('body amount/method/reference_id', req.body.amount === 249000 && req.body.method === 'qris' && req.body.reference_id === '00000000-0000-4000-8000-000000000000');
check('tanpa apiKey melempar', (() => { try { bp.buildCreatePaymentRequest({ ...cfg, apiKey: '' }, { amount: 1, method: 'qris', referenceId: 'x' }); return false; } catch { return true; } })());
check('tanpa baseUrl melempar', (() => { try { bp.buildCreatePaymentRequest({ ...cfg, baseUrl: '' }, { amount: 1, method: 'qris', referenceId: 'x' }); return false; } catch { return true; } })());
check('amount 0 melempar', (() => { try { bp.buildCreatePaymentRequest(cfg, { amount: 0, method: 'qris', referenceId: 'x' }); return false; } catch { return true; } })());
check('amount desimal melempar', (() => { try { bp.buildCreatePaymentRequest(cfg, { amount: 100.5, method: 'qris', referenceId: 'x' }); return false; } catch { return true; } })());

console.log('== 5. parseCreatePaymentResponse (defensif) ==');
const p1 = bp.parseCreatePaymentResponse({ id: 'pay_1', pay_url: 'https://bayar.contoh/pay_1', fee: 2500, expires_at: '2026-11-16T10:00:00Z' }, 'qris');
check('id + pay_url + fee + expires_at', p1.id === 'pay_1' && p1.payUrl === 'https://bayar.contoh/pay_1' && p1.fee === 2500 && p1.expiresAt === '2026-11-16T10:00:00Z');
const p2 = bp.parseCreatePaymentResponse({ data: { payment_id: 'pay_2', checkout_url: 'https://bayar.contoh/pay_2', va_number: '88081234567890' } }, 'va');
check('bentuk data.{payment_id, checkout_url, va_number}', p2.id === 'pay_2' && p2.payUrl === 'https://bayar.contoh/pay_2' && p2.vaNumber === '88081234567890');
const p3 = bp.parseCreatePaymentResponse({ id: 'pay_3', pay_url: 'https://bayar.contoh/pay_3' }, 'qris');
check('tanpa expires_at -> dihitung dari TTL QRIS (60 mnt)', Math.abs(new Date(p3.expiresAt).getTime() - (Date.now() + 60 * 60 * 1000)) < 5000);
check('tanpa id melempar', (() => { try { bp.parseCreatePaymentResponse({ pay_url: 'https://x' }, 'qris'); return false; } catch { return true; } })());
check('tanpa pay_url melempar', (() => { try { bp.parseCreatePaymentResponse({ id: 'pay_9' }, 'qris'); return false; } catch { return true; } })());

console.log(`\n${pass} lolos, ${fail} gagal`);
if (fail > 0) process.exit(1);
