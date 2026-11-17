// Uji webhook BorderPay: POST /api/webhook-borderpay (token benar/salah, paid/expired/failed, idempotensi).
// Server di 127.0.0.1:4400 dijalankan dengan BORDERPAY_WEBHOOK_TOKEN=<token uji lokal>.
// Pakai: E2E_WEBHOOK_TOKEN=<token uji yang sama> node scripts/e2e-webhook.cjs
// JANGAN pakai token produksi; token uji cukup string acak lokal.
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const proj = process.cwd();
const req = createRequire(path.join(proj, 'package.json'));
const { createClient } = req('@supabase/supabase-js');

const env = {};
for (const l of fs.readFileSync(path.join(proj, '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = process.env.E2E_WEBHOOK_TOKEN;
if (!TOKEN) { console.log('Set E2E_WEBHOOK_TOKEN (sama dengan BORDERPAY_WEBHOOK_TOKEN server uji).'); process.exit(2); }
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4400';
const admin = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = Date.now().toString(36);
const results = [];
const check = (name, ok, info = '') => { results.push([name, ok]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };

const hook = (body, token) => fetch(BASE + '/api/webhook-borderpay', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { 'x-borderpay-token': token }) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const payload = (event, ref, amount) => ({ event, mode: 'test', data: { reference_id: ref, status: event.split('.')[1], amount, method: 'qris' } });
const statusOf = async (id) => (await admin.from('orders').select('status').eq('id', id).single()).data.status;

(async () => {
  const ids = { users: [], products: [], orders: [] };
  try {
    const { data: u, error: ue } = await admin.auth.admin.createUser({ email: `uji-${tag}-hook@mailinator.com`, password: 'UjiPass-' + tag + '!9', email_confirm: true });
    if (ue) throw ue;
    ids.users.push(u.user.id);
    const { data: p } = await admin.from('products').insert({ slug: `uji-hook-${tag}`, judul: 'Uji webhook', jenjang: 'Q1', harga: 1000, is_visible: true }).select('id').single();
    ids.products.push(p.id);
    const mkOrder = async () => {
      const { data: o, error } = await admin.from('orders').insert({ user_id: u.user.id, total: 1000, status: 'menunggu_bayar' }).select('id').single();
      if (error) throw error;
      ids.orders.push(o.id);
      await admin.from('order_items').insert({ order_id: o.id, product_id: p.id, harga_saat_beli: 1000 });
      return o.id;
    };
    const a = await mkOrder(), b = await mkOrder(), c = await mkOrder(), d = await mkOrder();
    const e = await mkOrder(), f = await mkOrder();

    let r = await hook(payload('payment.paid', a, 1000), null);
    check('tanpa token -> 401', r.status === 401, r.status);
    r = await hook(payload('payment.paid', a, 1000), 'token-salah');
    check('token salah -> 401', r.status === 401, r.status);
    check('order tetap menunggu_bayar setelah token ditolak', (await statusOf(a)) === 'menunggu_bayar');

    r = await hook('{bukan json', TOKEN);
    check('JSON rusak -> 400', r.status === 400, r.status);
    r = await hook(payload('payment.unknown', a, 1000), TOKEN);
    check('event tidak dikenal -> 200 diabaikan', r.status === 200 && (await r.json()).ignored === 'unknown_event');
    r = await hook(payload('payment.paid', 'bukan-uuid', 1000), TOKEN);
    check('reference_id bukan UUID -> diabaikan', r.status === 200 && (await r.json()).ignored === 'bad_reference');
    r = await hook(payload('payment.paid', '00000000-0000-4000-8000-000000000000', 1000), TOKEN);
    check('order tidak ada -> diabaikan', r.status === 200 && (await r.json()).ignored === 'order_not_found');
    r = await hook(payload('payment.paid', a, 999), TOKEN);
    check('amount beda -> diabaikan', r.status === 200 && (await r.json()).ignored === 'amount_mismatch');
    check('order tetap menunggu_bayar setelah amount salah', (await statusOf(a)) === 'menunggu_bayar');

    r = await hook(payload('payment.paid', a, 1000), TOKEN);
    const j = await r.json();
    check('payment.paid token benar -> lunas', r.status === 200 && j.changed === true && (await statusOf(a)) === 'lunas', JSON.stringify(j));
    r = await hook(payload('payment.paid', a, 1000), TOKEN);
    check('paid dikirim ulang -> idempotent (changed=false)', r.status === 200 && (await r.json()).changed === false);
    r = await hook(payload('payment.expired', a, 1000), TOKEN);
    check('expired setelah lunas -> tidak menurunkan status', (await statusOf(a)) === 'lunas');

    await hook(payload('payment.expired', b, 1000), TOKEN);
    check('payment.expired -> kedaluwarsa', (await statusOf(b)) === 'kedaluwarsa', await statusOf(b));
    await hook(payload('payment.failed', c, 1000), TOKEN);
    check('payment.failed -> gagal', (await statusOf(c)) === 'gagal', await statusOf(c));
    check('order lain tidak tersentuh', (await statusOf(d)) === 'menunggu_bayar');

    // Biaya ditanggung pembeli (VA): amount = gross = total + fee. Bug produksi 18 Nov 2026 (252500 vs 249000).
    const withFee = (ref, amount, fee) => ({ event: 'payment.paid', mode: 'test', data: { reference_id: ref, status: 'paid', amount, fee, method: 'va' } });
    r = await hook(withFee(f, 1000 + 500 + 7, 500), TOKEN);
    check('amount - fee != total -> tetap diabaikan', r.status === 200 && (await r.json()).ignored === 'amount_mismatch' && (await statusOf(f)) === 'menunggu_bayar');
    r = await hook(withFee(e, 1000 + 500, 500), TOKEN);
    check('VA biaya ditanggung pembeli (amount=total+fee) -> lunas', r.status === 200 && (await statusOf(e)) === 'lunas', await statusOf(e));

    r = await fetch(BASE + '/api/webhook-borderpay');
    check('GET -> 405', r.status === 405, r.status);
  } catch (e) {
    console.log('ERROR', e && e.message ? e.message : e);
    results.push(['error', false]);
  } finally {
    try {
      if (ids.orders.length) {
        await admin.from('downloads').delete().in('order_id', ids.orders);
        await admin.from('payments').delete().in('order_id', ids.orders);
        await admin.from('order_items').delete().in('order_id', ids.orders);
        await admin.from('orders').delete().in('id', ids.orders);
      }
      await admin.from('products').delete().like('slug', 'uji-hook-%');
      for (const uid of ids.users) await admin.auth.admin.deleteUser(uid);
    } catch (e) { console.log('CLEANUP ERROR', e.message); }
    const bad = results.filter((x) => !x[1]).length;
    console.log(bad ? `GAGAL ${bad}/${results.length}` : `SEMUA LOLOS ${results.length}`);
    process.exit(bad ? 1 : 0);
  }
})();
