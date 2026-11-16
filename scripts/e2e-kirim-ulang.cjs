// Uji kirim ulang email unduhan (H6, WES-22). Server di 127.0.0.1:4400, PAYMENT_PROVIDER=mock.
// Mengirim 1 email NYATA lewat Resend ke EMAIL_UJI (default: alamat pemilik akun Resend dari argumen).
// Pakai: node scripts/e2e-kirim-ulang.cjs alamat@pemilik-resend.com
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const proj = process.cwd();
const req = createRequire(path.join(proj, 'package.json'));
const { createClient } = req('@supabase/supabase-js');
const { createServerClient } = req('@supabase/ssr');

const env = {};
for (const l of fs.readFileSync(path.join(proj, '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const EMAIL_UJI = process.argv[2];
if (!EMAIL_UJI) { console.log('Beri alamat penerima uji sebagai argumen.'); process.exit(2); }
const URL_ = env.PUBLIC_SUPABASE_URL, ANON = env.PUBLIC_SUPABASE_ANON_KEY, SRV = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = 'http://127.0.0.1:4400';
const admin = createClient(URL_, SRV, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = Date.now().toString(36);
const results = [];
const check = (name, ok, info = '') => { results.push([name, ok]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };

async function sessionCookie(email, password) {
  const jar = {};
  const c = createServerClient(URL_, ANON, {
    cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => (jar[name] = value)) },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}
let ipN = 0;
// Tiap cek memakai IP palsu berbeda (kunci rate limit = entri XFF paling kanan), kecuali ip diberikan.
const post = (p, fields, cookie, ip) => fetch(BASE + p, {
  method: 'POST', redirect: 'manual',
  headers: { Origin: BASE, 'X-Forwarded-For': ip || `10.${tag.length}.${Math.floor(++ipN / 250)}.${ipN % 250}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
  body: new URLSearchParams(fields).toString(),
});

(async () => {
  const ids = { users: [], products: [], orders: [] };
  try {
    const pw = 'UjiPass-' + tag + '!9';
    const mk = async (email) => {
      const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
      if (error) throw error;
      ids.users.push(data.user.id);
      return data.user;
    };
    const owner = await mk(EMAIL_UJI);                       // pemilik order (penerima email nyata)
    const other = await mk(`uji-${tag}-lain@mailinator.com`); // pembeli lain
    const ckOwner = await sessionCookie(EMAIL_UJI, pw);
    const ckOther = await sessionCookie(`uji-${tag}-lain@mailinator.com`, pw);

    const { data: p } = await admin.from('products')
      .insert({ slug: `uji-ulang-${tag}`, judul: 'Uji kirim ulang', jenjang: 'Q1', harga: 1000, is_visible: true })
      .select('id').single();
    ids.products.push(p.id);
    const mkOrder = async (userId, status) => {
      const { data: o, error } = await admin.from('orders').insert({ user_id: userId, total: 1000, status }).select('id').single();
      if (error) throw error;
      ids.orders.push(o.id);
      await admin.from('order_items').insert({ order_id: o.id, product_id: p.id, harga_saat_beli: 1000 });
      return o.id;
    };
    const paid = await mkOrder(owner.id, 'lunas');
    const unpaid = await mkOrder(owner.id, 'menunggu_bayar');

    let r = await post('/akun/kirim-ulang', { order: paid });
    check('tanpa login -> redirect ke /masuk', r.status === 303 && /\/masuk/.test(r.headers.get('location') || ''), r.status);

    r = await post('/akun/kirim-ulang', { order: paid }, ckOther);
    check('order orang lain -> 404', r.status === 404, r.status);

    r = await post('/akun/kirim-ulang', { order: unpaid }, ckOwner);
    check('order belum lunas -> belum-lunas', r.status === 303 && /belum-lunas/.test(r.headers.get('location') || ''), r.headers.get('location'));

    r = await post('/akun/kirim-ulang', { order: 'bukan-uuid' }, ckOwner);
    check('id tidak valid -> e=email', r.status === 303 && /e=email/.test(r.headers.get('location') || ''), r.headers.get('location'));

    r = await post('/akun/kirim-ulang', { order: paid }, ckOwner);
    check('order lunas milik sendiri -> ok=email', r.status === 303 && /ok=email/.test(r.headers.get('location') || ''), r.headers.get('location'));

    const same = '10.99.99.99';
    for (let i = 0; i < 3; i++) r = await post('/akun/kirim-ulang', { order: unpaid }, ckOwner, same);
    r = await post('/akun/kirim-ulang', { order: unpaid }, ckOwner, same);
    check('percobaan ke-4 dari IP sama dalam 10 menit -> 429', r.status === 429, r.status);
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
      await admin.from('products').delete().like('slug', 'uji-%');
      for (const u of ids.users) await admin.auth.admin.deleteUser(u);
      const left = await admin.from('products').select('id').like('slug', 'uji-%');
      console.log('bersih: produk uji tersisa =', left.data && left.data.length);
    } catch (e) { console.log('CLEANUP ERROR', e.message); }
    const bad = results.filter((x) => !x[1]).length;
    console.log(bad ? `GAGAL ${bad}/${results.length}` : `SEMUA LOLOS ${results.length}`);
    process.exit(bad ? 1 : 0);
  }
})();
