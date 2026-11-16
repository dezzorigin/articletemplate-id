// Uji end to end checkout pembeli LOGIN (WES-15/16) lanjut ke unduhan.
// Jalankan dengan cwd = folder proyek, server di 127.0.0.1:4400, PAYMENT_PROVIDER=mock.
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
const get = (p, cookie) => fetch(BASE + p, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
const post = (p, fields, cookie) => fetch(BASE + p, {
  method: 'POST', redirect: 'manual',
  headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
  body: new URLSearchParams(fields).toString(),
});

(async () => {
  const ids = { users: [], products: [], orders: [] };
  try {
    const pw = 'UjiPass-' + tag + '!9';
    const email = `uji-${tag}-login@mailinator.com`;
    const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (ue) throw ue;
    ids.users.push(u.user.id);

    const filePath = `uji/${tag}.txt`;
    const up = await admin.storage.from('templates').upload(filePath, Buffer.from('isi ' + tag), { contentType: 'text/plain' });
    if (up.error) throw up.error;
    ids.filePath = filePath;

    const mkP = async (n, harga, file) => {
      const { data, error } = await admin.from('products')
        .insert({ slug: `uji-${n}-${tag}`, judul: 'Uji ' + n, jenjang: 'Q1', harga, file_path: file, is_visible: true })
        .select('id,slug').single();
      if (error) throw error;
      ids.products.push(data.id);
      return data;
    };
    const p1 = await mkP('satu', 1000, filePath);
    // Produk tanpa file ditolak saat checkout (guard orders.ts), jadi p2 dibuat
    // dengan file lalu dikosongkan SESUDAH lunas untuk menguji 'file-belum-ada'.
    const p2 = await mkP('dua', 2500, filePath);
    const cart = encodeURIComponent(JSON.stringify([p1.slug, p2.slug]));
    const ses = await sessionCookie(email, pw);
    const ck = `${ses}; cart=${cart}`;

    let r = await get('/checkout', ck);
    let html = await r.text();
    check('/checkout login 200, tampil email sesi, tanpa input email', r.status === 200 && html.includes(email) && !/name="email"/.test(html), r.status);

    // email di form harus diabaikan; order menempel ke akun sesi
    r = await post('/checkout/buat', { email: 'penyusup@mailinator.com', nama: 'X' }, ck);
    const loc = r.headers.get('location') || '';
    const m = loc.match(/order=([0-9a-f-]{36})/);
    check('buat order -> 303 ke status', r.status === 303 && !!m, r.status + ' ' + loc);
    const oid = m && m[1];
    if (oid) ids.orders.push(oid);

    const { data: o } = await admin.from('orders').select('user_id,total,status').eq('id', oid).single();
    check('order milik akun sesi, bukan email form', o && o.user_id === u.user.id, o && o.user_id);
    check('total dari DB = 3500 & menunggu_bayar', o && Number(o.total) === 3500 && o.status === 'menunggu_bayar', JSON.stringify(o));
    const { data: pe } = await admin.from('profiles').select('id').eq('email', 'penyusup@mailinator.com');
    check('tidak membuat akun dari email form', pe && pe.length === 0);
    const { count } = await admin.from('order_items').select('*', { count: 'exact', head: true }).eq('order_id', oid);
    check('2 order_items', count === 2, count);

    r = await post('/checkout/buat', {}, ck);
    check('re-checkout memakai ulang order yang sama', (r.headers.get('location') || '').includes(oid), r.headers.get('location'));

    r = await get(`/unduh/${oid}/${p1.id}`, ses);
    check('sebelum lunas -> belum-lunas', r.status === 303 && /belum-lunas/.test(r.headers.get('location') || ''), r.status);

    r = await post('/checkout/simulasi', { order: oid, aksi: 'QRIS' }, ck);
    check('pilih QRIS -> 303', r.status === 303, r.status);
    r = await post('/checkout/simulasi', { order: oid, aksi: 'lunas' }, ck);
    const sc = r.headers.get('set-cookie') || '';
    check('simulasi lunas -> 303 & cookie cart dihapus', r.status === 303 && /cart=;|cart=deleted|Max-Age=0|1970/i.test(sc), r.status + ' ' + sc.slice(0, 90));
    const { data: o2 } = await admin.from('orders').select('status').eq('id', oid).single();
    check('order lunas', o2 && o2.status === 'lunas', o2 && o2.status);

    r = await get(`/unduh/${oid}/${p1.id}`, ses);
    check('unduh p1 -> 302 signed URL', r.status === 302 && /token=/.test(r.headers.get('location') || ''), r.status);
    await admin.from('products').update({ file_path: null }).eq('id', p2.id);
    r = await get(`/unduh/${oid}/${p2.id}`, ses);
    check('p2 tanpa file -> file-belum-ada', r.status === 303 && /file-belum-ada/.test(r.headers.get('location') || ''), r.status);

    r = await get('/akun', ses);
    html = await r.text();
    check('/akun ada link unduh p1', html.includes(`/unduh/${oid}/${p1.id}`));
    check('/akun p2 "file belum tersedia"', html.includes('file belum tersedia'));

    await post('/checkout/simulasi', { order: oid, aksi: 'lunas' }, ses);
    await post('/checkout/simulasi', { order: oid, aksi: 'gagal' }, ses);
    const { data: o3 } = await admin.from('orders').select('status').eq('id', oid).single();
    check('lunas diulang/ditimpa gagal tetap lunas', o3 && o3.status === 'lunas', o3 && o3.status);
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
      if (ids.filePath) await admin.storage.from('templates').remove([ids.filePath]);
      for (const u of ids.users) await admin.auth.admin.deleteUser(u);
      const left = await admin.from('products').select('id').like('slug', 'uji-%');
      console.log('bersih: produk uji tersisa =', left.data && left.data.length);
    } catch (e) { console.log('CLEANUP ERROR', e.message); }
    const bad = results.filter((x) => !x[1]).length;
    console.log(bad ? `GAGAL ${bad}/${results.length}` : `SEMUA LOLOS ${results.length}`);
    process.exit(bad ? 1 : 0);
  }
})();
