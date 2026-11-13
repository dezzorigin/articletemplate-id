// Uji end to end admin T6 (CHECKLIST H1-H5). cwd = folder proyek, server di 127.0.0.1:4400, PAYMENT_PROVIDER=mock.
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
const check = (name, ok, info = '') => { results.push([name, ok]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? '  ' + info : '')); };

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
function multipart(p, fields, files, cookie) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const [k, f] of Object.entries(files || {})) fd.append(k, new Blob([f.body], { type: f.type || 'application/octet-stream' }), f.name);
  return fetch(BASE + p, { method: 'POST', redirect: 'manual', headers: { Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) }, body: fd });
}
async function exists(bucket, p) {
  if (!p) return false;
  const dir = p.split('/').slice(0, -1).join('/');
  const name = p.split('/').pop();
  const { data } = await admin.storage.from(bucket).list(dir, { limit: 100 });
  return !!(data || []).find((o) => o.name === name);
}
const prod = async (slug) => (await admin.from('products').select('*').eq('slug', slug).maybeSingle()).data;

(async () => {
  const ids = { users: [], orders: [], productIds: new Set() };
  try {
    const pw = 'UjiPass-' + tag + '!9';
    const mk = async (n, role) => {
      const email = `uji-${tag}-${n}@mailinator.com`;
      const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
      if (error) throw error;
      ids.users.push(data.user.id);
      if (role) await admin.from('profiles').update({ role }).eq('id', data.user.id);
      return { id: data.user.id, email, cookie: await sessionCookie(email, pw) };
    };
    const A = await mk('admin', 'admin');
    const P = await mk('pembeli');

    const slug = `uji-big-${tag}`;
    const base = { judul: 'Uji Besar ' + tag, slug, jenjang: 'Q2', harga: '1000', bidang: 'Teknik', format: 'zip', deskripsi: 'uji', checklist_kepatuhan: 'A', is_visible: '1' };
    const big = (mb) => Buffer.alloc(Math.floor(mb * 1024 * 1024), 65);
    let t = Date.now();
    let r = await multipart('/admin/produk/baru', base, { file: { name: 'besar.zip', body: big(49), type: 'application/zip' } }, A.cookie);
    console.log('49MB status', r.status, r.headers.get('location'), (Date.now() - t) + 'ms');
    let p = await prod(slug); if (p) ids.productIds.add(p.id);
    check('49 MB diterima (303)', r.status === 303, r.status);
    check('49 MB ada di bucket', p && (await exists('templates', p.file_path)), p && p.file_path);
    if (p && p.file_path) {
      const { data } = await admin.storage.from('templates').list(p.id, { limit: 10 });
      const sz = data && data[0] && data[0].metadata && data[0].metadata.size;
      check('ukuran tersimpan utuh', sz === 49 * 1024 * 1024, sz);
    }
    const slug2 = `uji-big2-${tag}`;
    r = await multipart('/admin/produk/baru', { ...base, slug: slug2, judul: 'Uji Besar2 ' + tag }, { file: { name: 'besar.zip', body: big(51), type: 'application/zip' } }, A.cookie);
    const h = await r.text().catch(() => '');
    check('51 MB ditolak dengan pesan', r.status === 200 && h.includes('maksimal 50 MB'), r.status);
    check('51 MB tidak membuat produk', !(await prod(slug2)));
  } finally {
    try {
      if (ids.orders.length) {
        await admin.from('downloads').delete().in('order_id', ids.orders);
        await admin.from('payments').delete().in('order_id', ids.orders);
        await admin.from('order_items').delete().in('order_id', ids.orders);
        await admin.from('orders').delete().in('id', ids.orders);
      }
      for (const id of ids.productIds) {
        for (const b of ['templates', 'previews']) {
          const { data } = await admin.storage.from(b).list(id, { limit: 100 });
          if (data && data.length) await admin.storage.from(b).remove(data.map((o) => `${id}/${o.name}`));
        }
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
