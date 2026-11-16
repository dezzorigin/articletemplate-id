// Uji logika BorderPay TANPA jaringan dan TANPA kredensial asli.
// Jalankan: node scripts/test-borderpay.mjs  (setelah `npm ci` — memakai
// esbuild dari node_modules untuk membundel src/lib/borderpay.ts).
// Token/key yang dipakai di sini DUMMY, bukan nilai asli mana pun.
// Fakta yang diuji = Referensi API resmi (dibaca penuh 16 Nov 2026):
// base URL https://borderpay.id/api/v1, bank_code wajib untuk va/ewallet,
// return_url dikirim, expires_at dari respons (tanpa durasi asumsi).
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
const cfg = { apiKey: 'bp_test_dummy', baseUrl: 'https://api-contoh.invalid/api/v1', webhookToken: undefined };
const RET = 'https://articletemplate.id/checkout/status?order=00000000-0000-4000-8000-000000000000';
const req = bp.buildCreatePaymentRequest(cfg, { amount: 249000, method: 'qris', referenceId: '00000000-0000-4000-8000-000000000000', returnUrl: RET });
check('URL = base + /payments', req.url === 'https://api-contoh.invalid/api/v1/payments');
check('auth Bearer', req.headers.Authorization === 'Bearer bp_test_dummy');
check('Idempotency-Key = referenceId', req.headers['Idempotency-Key'] === '00000000-0000-4000-8000-000000000000');
check('body amount/method/reference_id/return_url', req.body.amount === 249000 && req.body.method === 'qris' && req.body.reference_id === '00000000-0000-4000-8000-000000000000' && req.body.return_url === RET);
check('qris tanpa bank_code di body', !('bank_code' in req.body));
check('tanpa apiKey melempar', (() => { try { bp.buildCreatePaymentRequest({ ...cfg, apiKey: '' }, { amount: 1, method: 'qris', referenceId: 'x', returnUrl: RET }); return false; } catch { return true; } })());
check('tanpa baseUrl melempar', (() => { try { bp.buildCreatePaymentRequest({ ...cfg, baseUrl: '' }, { amount: 1, method: 'qris', referenceId: 'x', returnUrl: RET }); return false; } catch { return true; } })());
check('amount 0 melempar', (() => { try { bp.buildCreatePaymentRequest(cfg, { amount: 0, method: 'qris', referenceId: 'x', returnUrl: RET }); return false; } catch { return true; } })());
check('amount desimal melempar', (() => { try { bp.buildCreatePaymentRequest(cfg, { amount: 100.5, method: 'qris', referenceId: 'x', returnUrl: RET }); return false; } catch { return true; } })());
check('tanpa returnUrl melempar', (() => { try { bp.buildCreatePaymentRequest(cfg, { amount: 1, method: 'qris', referenceId: 'x', returnUrl: '' }); return false; } catch { return true; } })());

console.log('== 5. bank_code wajib untuk va/ewallet ==');
check('va tanpa bankCode melempar', (() => { try { bp.buildCreatePaymentRequest(cfg, { amount: 1, method: 'va', referenceId: 'x', returnUrl: RET }); return false; } catch { return true; } })());
const reqVa = bp.buildCreatePaymentRequest(cfg, { amount: 249000, method: 'va', referenceId: 'x', bankCode: 'bca', returnUrl: RET });
check('va + bankCode bca -> body.bank_code BCA (huruf besar)', reqVa.body.bank_code === 'BCA');
check('ewallet tanpa bankCode melempar', (() => { try { bp.buildCreatePaymentRequest(cfg, { amount: 1, method: 'ewallet', referenceId: 'x', returnUrl: RET }); return false; } catch { return true; } })());
const reqEw = bp.buildCreatePaymentRequest(cfg, { amount: 249000, method: 'ewallet', referenceId: 'x', bankCode: 'dana', returnUrl: RET });
check('ewallet + bankCode dana -> body.bank_code DANA', reqEw.body.bank_code === 'DANA');

console.log('== 6. getBorderPayConfig: default + normalisasi base URL ==');
const savedBase = process.env.BORDERPAY_BASE_URL;
const savedKey = process.env.BORDERPAY_API_KEY;
delete process.env.BORDERPAY_BASE_URL;
check('baseUrl default = https://borderpay.id/api/v1', bp.getBorderPayConfig().baseUrl === 'https://borderpay.id/api/v1');
process.env.BORDERPAY_BASE_URL = 'https://borderpay.id/';
check('host tanpa /api/v1 -> ditambah', bp.getBorderPayConfig().baseUrl === 'https://borderpay.id/api/v1');
process.env.BORDERPAY_BASE_URL = 'https://borderpay.id/api/v1/';
check('trailing slash dibuang', bp.getBorderPayConfig().baseUrl === 'https://borderpay.id/api/v1');
process.env.BORDERPAY_API_KEY = '';
check('tanpa key -> tidak aktif', bp.isBorderPayEnabled() === false);
process.env.BORDERPAY_API_KEY = 'bp_test_dummy';
check('dengan key -> aktif (baseUrl default)', bp.isBorderPayEnabled() === true);
if (savedBase === undefined) delete process.env.BORDERPAY_BASE_URL; else process.env.BORDERPAY_BASE_URL = savedBase;
if (savedKey === undefined) delete process.env.BORDERPAY_API_KEY; else process.env.BORDERPAY_API_KEY = savedKey;

console.log('== 7. parseCreatePaymentResponse (field persis Referensi API) ==');
const p1 = bp.parseCreatePaymentResponse({ id: 'pay_1', pay_url: 'https://bayar.contoh/pay_1', fee: 2500, expires_at: '2026-11-16T10:00:00Z' });
check('id + pay_url + fee + expires_at', p1.id === 'pay_1' && p1.payUrl === 'https://bayar.contoh/pay_1' && p1.fee === 2500 && p1.expiresAt === '2026-11-16T10:00:00Z');
const p2 = bp.parseCreatePaymentResponse({ data: { payment_id: 'pay_2', checkout_url: 'https://bayar.contoh/pay_2', va_number: '88081234567890' } });
check('bentuk data.{payment_id, checkout_url, va_number}', p2.id === 'pay_2' && p2.payUrl === 'https://bayar.contoh/pay_2' && p2.vaNumber === '88081234567890');
const p3 = bp.parseCreatePaymentResponse({ id: 'pay_3', pay_url: 'https://bayar.contoh/pay_3' });
check('tanpa expires_at -> expiresAt undefined (TIDAK dihitung dari TTL)', p3.expiresAt === undefined);
const p4 = bp.parseCreatePaymentResponse({
  id: 'pay_4', pay_url: 'https://bayar.contoh/pay_4', qr_string: 'QR-ISI', va_number: '8808000001',
  va_bank: 'BCA', expires_at: '2026-11-16T11:00:00Z', customer_pays: 250750, merchant_receives: 247000,
  fee: 3750, mode: 'test', reused: true, checkout_url: 'https://bayar.contoh/co/pay_4',
});
check('pemetaan lengkap: qr_string/va_number/va_bank/customer_pays/merchant_receives/mode/reused/checkout_url',
  p4.qrString === 'QR-ISI' && p4.vaNumber === '8808000001' && p4.vaBank === 'BCA' && p4.customerPays === 250750 &&
  p4.merchantReceives === 247000 && p4.mode === 'test' && p4.reused === true && p4.checkoutUrl === 'https://bayar.contoh/co/pay_4');
const p5 = bp.parseCreatePaymentResponse({ id: 'pay_5', pay_url: 'https://bayar.contoh/pay_5', expires_at: null });
check('expires_at null -> undefined', p5.expiresAt === undefined);
check('tanpa id melempar', (() => { try { bp.parseCreatePaymentResponse({ pay_url: 'https://x' }); return false; } catch { return true; } })());
check('tanpa pay_url melempar', (() => { try { bp.parseCreatePaymentResponse({ id: 'pay_9' }); return false; } catch { return true; } })());

console.log('== 8. parsePaymentMethods (bentuk GET /payment-methods) ==');
const m1 = bp.parsePaymentMethods({
  qris: { enabled: true, fee: { fixed: 0, percent: 0.7 } },
  va: { enabled: true, fee: { fixed: 4000, percent: 0 }, banks: [
    { code: 'BCA', name: 'BCA', enabled: true, fee: { fixed: 4000, percent: 0 } },
    { code: 'BNI', name: 'BNI', enabled: true },
    { code: 'PERMATA', name: 'Permata', enabled: false },
  ] },
  ewallet: { enabled: true, banks: [
    { code: 'DANA', name: 'DANA', enabled: true },
    { code: 'OVO', name: 'OVO', enabled: false },
  ] },
});
check('qris aktif', m1.qrisEnabled === true);
check('va banks hanya yang enabled (BCA, BNI)', m1.vaBanks.length === 2 && m1.vaBanks[0].code === 'BCA' && m1.vaBanks[1].code === 'BNI');
check('ewallet banks hanya yang enabled (DANA)', m1.ewalletBanks.length === 1 && m1.ewalletBanks[0].code === 'DANA');
const m2 = bp.parsePaymentMethods({});
check('respons kosong -> qris aktif, bank kosong', m2.qrisEnabled === true && m2.vaBanks.length === 0 && m2.ewalletBanks.length === 0);
const m3 = bp.parsePaymentMethods({ qris: { enabled: false } });
check('qris enabled false terbaca', m3.qrisEnabled === false);

console.log('== 9. buildPaymentActionRequest (cancel / simulate) ==');
const c1 = bp.buildPaymentActionRequest(cfg, '00000000-0000-4000-8000-000000000000', 'cancel');
check('cancel URL + method POST implisit (path benar)', c1.url === 'https://api-contoh.invalid/api/v1/payments/00000000-0000-4000-8000-000000000000/cancel' && c1.headers.Authorization === 'Bearer bp_test_dummy');
const c2 = bp.buildPaymentActionRequest(cfg, 'ref-1', 'simulate');
check('simulate URL benar', c2.url === 'https://api-contoh.invalid/api/v1/payments/ref-1/simulate');
check('tanpa apiKey melempar', (() => { try { bp.buildPaymentActionRequest({ ...cfg, apiKey: '' }, 'x', 'cancel'); return false; } catch { return true; } })());

console.log('== 10. toBorderPayMethod ==');
check('QRIS -> qris', bp.toBorderPayMethod('QRIS') === 'qris');
check('VA -> va', bp.toBorderPayMethod('VA') === 'va');
check('EWALLET -> ewallet', bp.toBorderPayMethod('EWALLET') === 'ewallet');

console.log(`\n${pass} lolos, ${fail} gagal`);
if (fail > 0) process.exit(1);
