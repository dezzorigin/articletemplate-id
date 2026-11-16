// Uji end to end unduhan WES-19/20 (G3-G6). Jalankan dengan cwd = folder proyek, server di 127.0.0.1:4400.
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

(async () => {
  const ids = { users: [], product: null, orders: [] };
  try {
    const pw = 'UjiPass-' + tag + '!9';
    const mk = async (n) => {
      const email = `uji-${tag}-${n}@mailinator.com`;
      const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
      if (error) throw error;
      ids.users.push(data.user.id);
      return { id: data.user.id, email };
    };
    const A = await mk('a'), B = await mk('b');

    const filePath = `uji/${tag}.txt`;
    const body = 'isi template uji ' + tag;
    const up = await admin.storage.from('templates').upload(filePath, Buffer.from(body), { contentType: 'text/plain' });
    if (up.error) throw up.error;
    ids.filePath = filePath;

    const { data: prod, error: pe } = await admin.from('products').insert({ slug: 'uji-' + tag, judul: 'Uji ' + tag, jenjang: 'Q1', harga: 1000, file_path: filePath, is_visible: false }).select('id').single();
    if (pe) throw pe;
    ids.product = prod.id;
    const { data: prodNoFile } = await admin.from('products').insert({ slug: 'uji-nofile-' + tag, judul: 'Uji nofile', jenjang: 'Q1', harga: 1000, is_visible: false }).select('id').single();
    ids.product2 = prodNoFile.id;

    const mkOrder = async (uid, status, pid) => {
      const { data: o, error } = await admin.from('orders').insert({ user_id: uid, total: 1000, status }).select('id').single();
      if (error) throw error;
      ids.orders.push(o.id);
      const r = await admin.from('order_items').insert({ order_id: o.id, product_id: pid, harga_saat_beli: 1000 });
      if (r.error) throw r.error;
      return o.id;
    };
    const oPaid = await mkOrder(A.id, 'lunas', ids.product);
    const oPending = await mkOrder(A.id, 'menunggu_bayar', ids.product);
    const oNoFile = await mkOrder(A.id, 'lunas', ids.product2);

    const ca = await sessionCookie(A.email, pw);
    const cb = await sessionCookie(B.email, pw);

    // tanpa login
    let r = await get(`/unduh/${oPaid}/${ids.product}`);
    check('tanpa login -> 303 /masuk', r.status === 303 && /\/masuk/.test(r.headers.get('location') || ''), r.status);

    // G4 unduh benar
    r = await get(`/unduh/${oPaid}/${ids.product}`, ca);
    const loc = r.headers.get('location') || '';
    check('G4 pemilik lunas -> 302 signed URL', r.status === 302 && /supabase\.co\/storage/.test(loc) && /token=/.test(loc), r.status);
    if (loc) {
      const f = await fetch(loc);
      const t = await f.text();
      check('G4 isi file benar', f.status === 200 && t === body, f.status);
    }
    // G5 unduh ulang
    r = await get(`/unduh/${oPaid}/${ids.product}`, ca);
    check('G5 unduh ulang -> 302', r.status === 302, r.status);
    // G3 akun lain
    r = await get(`/unduh/${oPaid}/${ids.product}`, cb);
    check('G3 akun lain -> 404', r.status === 404, r.status);
    // belum lunas
    r = await get(`/unduh/${oPending}/${ids.product}`, ca);
    check('belum lunas -> 303 /akun?e=belum-lunas', r.status === 303 && /belum-lunas/.test(r.headers.get('location') || ''), r.status + ' ' + r.headers.get('location'));
    // file belum ada
    r = await get(`/unduh/${oNoFile}/${ids.product2}`, ca);
    check('file belum ada -> e=file-belum-ada', r.status === 303 && /file-belum-ada/.test(r.headers.get('location') || ''), r.status + ' ' + r.headers.get('location'));
    // produk tak ada di order
    r = await get(`/unduh/${oPaid}/${ids.product2}`, ca);
    check('produk bukan bagian order -> 404', r.status === 404, r.status);
    // id ngawur
    r = await get(`/unduh/bukan-uuid/${ids.product}`, ca);
    check('uuid tak valid -> 404', r.status === 404, r.status);

    // G6 audit
    const { data: dl } = await admin.from('downloads').select('id,user_id,order_id,product_id').eq('order_id', oPaid);
    check('G6 downloads tercatat 2 baris (G4+G5), user A', dl && dl.length === 2 && dl.every((x) => x.user_id === A.id), JSON.stringify(dl && dl.length));
    const { data: dl2 } = await admin.from('downloads').select('id').eq('user_id', B.id);
    check('G6 akun lain tidak tercatat', dl2 && dl2.length === 0);

    // halaman /akun
    r = await get('/akun', ca);
    const html = await r.text();
    check('/akun A 200 & ada tombol unduh', r.status === 200 && html.includes(`/unduh/${oPaid}/${ids.product}`), r.status);
    check('/akun A tidak ada link unduh utk order belum lunas', !html.includes(`/unduh/${oPending}/`));
    r = await get('/akun', cb);
    const htmlB = await r.text();
    check('/akun B tidak memuat order A', r.status === 200 && !htmlB.includes(oPaid));
  } catch (e) {
    console.log('ERROR', e && e.message ? e.message : e);
    results.push(['error', false]);
  } finally {
    try {
      if (ids.orders.length) {
        await admin.from('downloads').delete().in('order_id', ids.orders);
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
