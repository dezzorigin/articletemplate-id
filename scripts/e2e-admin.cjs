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

    // ---------- H1 akses ----------
    let r = await get('/admin/produk');
    check('H1 anon /admin/produk -> 303 /masuk', r.status === 303, r.status);
    r = await get('/admin/produk', P.cookie);
    check('H1 pembeli /admin/produk -> 404', r.status === 404, r.status);
    r = await get('/admin/order', P.cookie);
    check('H1 pembeli /admin/order -> 404', r.status === 404, r.status);
    r = await get('/admin/produk', A.cookie);
    check('H1 admin /admin/produk -> 200', r.status === 200, r.status);
    r = await get('/admin', A.cookie);
    check('H1 admin /admin -> 200', r.status === 200, r.status);

    const slug = `uji-adm-${tag}`;
    const base = { judul: 'Uji Admin ' + tag, slug, jenjang: 'Q2', harga: '1000', bidang: 'Teknik', format: 'docx', deskripsi: 'deskripsi uji', checklist_kepatuhan: 'Butir A\nButir B\n\n', is_visible: '1' };

    r = await multipart('/admin/produk/baru', base, {}, P.cookie);
    check('H1 pembeli POST produk baru -> 404', r.status === 404, r.status);
    check('H1 pembeli tidak membuat produk', !(await prod(slug)));

    // ---------- validasi ----------
    r = await multipart('/admin/produk/baru', { ...base, harga: 'abc' }, {}, A.cookie);
    let html = await r.text();
    check('validasi harga salah -> 200 + pesan, tanpa baris', r.status === 200 && html.includes('Harga harus angka') && !(await prod(slug)), r.status);
    check('isian tetap terisi setelah error', html.includes(`value="${base.judul}"`));
    r = await multipart('/admin/produk/baru', { ...base, jurnal: 'Jurnal X' }, {}, A.cookie);
    html = await r.text();
    check('jurnal tanpa tautan guideline ditolak', html.includes('tautan guideline') && !(await prod(slug)));
    r = await multipart('/admin/produk/baru', { ...base, slug: 'Bukan Slug!' }, {}, A.cookie);
    check('slug tidak valid ditolak', (await r.text()).includes('Slug wajib'));

    // ---------- H2 + H4 buat produk dengan file + pratinjau ----------
    r = await multipart('/admin/produk/baru', base, {
      file: { name: 'Template Uji.docx', body: 'DOCX-' + tag, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      preview: { name: 'pratinjau.png', body: 'PNG-' + tag, type: 'image/png' },
    }, A.cookie);
    const loc = r.headers.get('location') || '';
    check('H2 buat produk -> 303 ke halaman ubah ?ok=1', r.status === 303 && /\/admin\/produk\/[0-9a-f-]{36}\?ok=1/.test(loc), r.status + ' ' + loc);
    let p = await prod(slug);
    if (p) ids.productIds.add(p.id);
    check('H2 baris tersimpan benar', p && p.judul === base.judul && p.jenjang === 'Q2' && Number(p.harga) === 1000 && p.is_visible === true, JSON.stringify(p && { h: p.harga, v: p.is_visible }));
    check('H2 checklist dipecah per baris', p && JSON.stringify(p.checklist_kepatuhan) === '["Butir A","Butir B"]', p && JSON.stringify(p.checklist_kepatuhan));
    check('H4 file template ada di bucket templates', p && (await exists('templates', p.file_path)), p && p.file_path);
    check('H4 pratinjau ada di bucket previews', p && (await exists('previews', p.preview_path)), p && p.preview_path);
    check('H4 file template TIDAK ada di bucket publik', p && !(await exists('previews', p.file_path)));
    const pub = await fetch(`${URL_}/storage/v1/object/public/templates/${p.file_path}`);
    check('H4 file template tidak bisa diakses lewat URL publik', pub.status >= 400, pub.status);

    r = await multipart('/admin/produk/baru', base, {}, A.cookie);
    check('slug ganda ditolak', (await r.text()).includes('Slug sudah dipakai'));

    // ---------- tampil di katalog ----------
    r = await get(`/templates/${slug}`);
    html = await r.text();
    check('katalog menampilkan produk + Rp1.000', r.status === 200 && html.includes('Rp1.000'), r.status);

    // ---------- H3 ubah harga -> katalog + checkout ----------
    const pid = p.id;
    r = await multipart(`/admin/produk/${pid}`, { ...base, harga: '2.500' }, {}, A.cookie);
    check('H3 ubah harga -> 303 ok', r.status === 303, r.status);
    p = await prod(slug);
    check('H3 harga DB 2500 (format 2.500 diterima)', p && Number(p.harga) === 2500, p && p.harga);
    check('H3 file tetap terpasang saat simpan tanpa file baru', p && (await exists('templates', p.file_path)));
    html = await (await get(`/templates/${slug}`)).text();
    check('H3 katalog Rp2.500', html.includes('Rp2.500') && !html.includes('Rp1.000'));
    const cart = `cart=${encodeURIComponent(JSON.stringify([slug]))}`;
    html = await (await get('/checkout', `${P.cookie}; ${cart}`)).text();
    check('H3 checkout Rp2.500', html.includes('Rp2.500'));
    r = await post('/checkout/buat', {}, `${P.cookie}; ${cart}`);
    const om = (r.headers.get('location') || '').match(/order=([0-9a-f-]{36})/);
    const oid = om && om[1];
    if (oid) ids.orders.push(oid);
    const { data: o } = await admin.from('orders').select('total').eq('id', oid).single();
    check('H3 total order 2500', o && Number(o.total) === 2500, o && o.total);

    // ---------- H4 ganti file, file lama terhapus; ekstensi salah ditolak ----------
    const oldFile = p.file_path;
    r = await multipart(`/admin/produk/${pid}`, { ...base, harga: '2500' }, { file: { name: 'v2.docx', body: 'DOCX2-' + tag } }, A.cookie);
    p = await prod(slug);
    check('H4 ganti file: path baru tersimpan', r.status === 303 && p.file_path !== oldFile && (await exists('templates', p.file_path)));
    check('H4 file lama dihapus dari bucket', !(await exists('templates', oldFile)));
    r = await multipart(`/admin/produk/${pid}`, { ...base, harga: '2500' }, { file: { name: 'virus.exe', body: 'MZ' } }, A.cookie);
    html = await r.text();
    const p2 = await prod(slug);
    check('H4 ekstensi .exe ditolak, file tidak berubah', html.includes('hanya docx') && p2.file_path === p.file_path, r.status);
    r = await multipart(`/admin/produk/${pid}`, { ...base, harga: '2500', hapus_preview: '1' }, {}, A.cookie);
    const p3 = await prod(slug);
    check('H4 hapus pratinjau', p3.preview_path === null && !(await exists('previews', p.preview_path)));

    // ---------- H5 daftar + cari order ----------
    await admin.from('orders').update({ status: 'lunas' }).eq('id', oid);
    html = await (await get(`/admin/order?q=${encodeURIComponent(P.email)}`, A.cookie)).text();
    check('H5 cari per email menemukan order', html.includes(oid) && html.includes(P.email));
    html = await (await get(`/admin/order?q=${encodeURIComponent(slug)}`, A.cookie)).text();
    check('H5 cari per slug produk menemukan order', html.includes(oid));
    html = await (await get(`/admin/order?q=${encodeURIComponent('Uji Admin ' + tag)}`, A.cookie)).text();
    check('H5 cari per judul produk menemukan order', html.includes(oid));
    html = await (await get(`/admin/order?q=${encodeURIComponent(P.email)}&status=gagal`, A.cookie)).text();
    check('H5 filter status gagal menyaring order lunas', !html.includes(oid));
    html = await (await get(`/admin/order?q=${encodeURIComponent(P.email)}&status=lunas`, A.cookie)).text();
    check('H5 filter status lunas', html.includes(oid));
    html = await (await get(`/admin/order?q=tidakadasamasekali${tag}`, A.cookie)).text();
    check('H5 cari tak cocok -> kosong', html.includes('Tidak ada order yang cocok'));
    r = await get(`/admin/order?q=${encodeURIComponent("a),id.eq.x,(b")}`, A.cookie);
    check('H5 input sintaks filter aneh tidak error', r.status === 200, r.status);

    // ---------- sembunyikan -> hilang dari katalog ----------
    const { is_visible, ...hidden } = base;
    r = await multipart(`/admin/produk/${pid}`, { ...hidden, harga: '2500' }, {}, A.cookie);
    r = await get(`/templates/${slug}`);
    check('sembunyikan -> katalog 404', r.status === 404, r.status);
    check('pembeli tetap lihat order di /akun', (await (await get('/akun', P.cookie)).text()).includes(`/unduh/${oid}/${pid}`));

    // ---------- hapus ----------
    r = await post('/admin/produk/hapus', { id: pid }, P.cookie);
    check('pembeli tidak bisa hapus (404)', r.status === 404 && !!(await prod(slug)), r.status);
    r = await post('/admin/produk/hapus', { id: pid }, A.cookie);
    check('produk yang pernah dibeli: disembunyikan, tidak dihapus', /disembunyikan/.test(r.headers.get('location') || '') && !!(await prod(slug)));

    const slug2 = `uji-adm2-${tag}`;
    r = await multipart('/admin/produk/baru', { ...base, slug: slug2 }, { file: { name: 'x.docx', body: 'X' } }, A.cookie);
    const q2 = await prod(slug2);
    if (q2) ids.productIds.add(q2.id);
    r = await post('/admin/produk/hapus', { id: q2.id }, A.cookie);
    check('produk tanpa order dihapus', /dihapus/.test(r.headers.get('location') || '') && !(await prod(slug2)));
    check('file produk terhapus ikut dihapus dari bucket', !(await exists('templates', q2.file_path)));
  } catch (e) {
    console.log('ERROR', e && e.stack ? e.stack : e);
    results.push(['error', false]);
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
