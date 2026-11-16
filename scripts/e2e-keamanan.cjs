// Uji keamanan T8: K1 (RLS per peran), K2, K3, K4, K5, L4. cwd = folder proyek, server di 127.0.0.1:4400.
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
const U = env.PUBLIC_SUPABASE_URL, ANON = env.PUBLIC_SUPABASE_ANON_KEY, SRV = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = 'http://127.0.0.1:4400';
const admin = createClient(U, SRV, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = Date.now().toString(36);
const results = [];
const check = (name, ok, info = '') => { results.push([name, ok]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? '  ' + info : '')); };
const newClient = () => createClient(U, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
let ipN = 0;
const freshIp = () => `10.${(Date.now() >> 8) & 255}.${(++ipN) & 255}.${Math.floor(Math.random() * 250)}`;
const form = (p, fields, ip, extra = {}) => fetch(BASE + p, {
  method: 'POST', redirect: 'manual',
  headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': ip || freshIp(), ...extra },
  body: new URLSearchParams(fields).toString(),
});

(async () => {
  const users = [];
  const prodIds = [];
  const orderIds = [];
  try {
    // ---------- K4 header ----------
    for (const p of ['/', '/tentang', '/templates', '/nope-tidak-ada', '/api/health', '/sitemap.xml']) {
      const r = await fetch(BASE + p, { redirect: 'manual' });
      const h = r.headers;
      const ok = /frame-ancestors 'none'/.test(h.get('content-security-policy') || '') && h.get('x-content-type-options') === 'nosniff'
        && h.get('x-frame-options') === 'DENY' && !!h.get('referrer-policy') && !!h.get('permissions-policy');
      check(`K4 header lengkap di ${p} (${r.status})`, ok);
    }
    let r = await fetch(BASE + '/admin', { redirect: 'manual' });
    check('K4 header ada juga di redirect (303)', r.status === 303 && r.headers.get('x-frame-options') === 'DENY', r.status);
    const html = await (await fetch(BASE + '/')).text();
    check('K4 CSP aman: tanpa <script> inline di beranda (hanya src sendiri)', !/<script(?![^>]*\ssrc="\/)/i.test(html));
    const csp = (await fetch(BASE + '/')).headers.get('content-security-policy') || '';
    check("K4 CSP: tanpa 'unsafe-eval' dan script-src 'self' saja", !csp.includes('unsafe-eval') && /script-src 'self'(;|$)/.test(csp), csp.slice(0, 120));

    // ---------- K2 service role tidak di bundle ----------
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const files = walk(path.join(proj, 'dist', 'client')).filter((f) => /\.(js|css|html|map|txt|json)$/.test(f));
    const leaked = files.filter((f) => { const t = fs.readFileSync(f, 'utf8'); return t.includes(SRV) || /SERVICE_ROLE/.test(t); });
    check(`K2 service role key tidak ada di dist/client (${files.length} berkas)`, leaked.length === 0, leaked.join(','));
    const pages = ['/', '/templates', '/tentang', '/bantuan', '/masuk', '/keranjang'];
    let pageLeak = false;
    for (const p of pages) { const t = await (await fetch(BASE + p)).text(); if (t.includes(SRV)) pageLeak = true; }
    check('K2 service role key tidak ada di HTML halaman', !pageLeak);

    // ---------- K3 CSRF + validasi ----------
    r = await fetch(BASE + '/auth/masuk', { method: 'POST', redirect: 'manual', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': freshIp() }, body: 'email=a@b.co&password=12345678' });
    check('K3 POST lintas-origin /auth/masuk -> 403', r.status === 403, r.status);
    r = await fetch(BASE + '/checkout/buat', { method: 'POST', redirect: 'manual', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': freshIp() }, body: '' });
    check('K3 POST lintas-origin /checkout/buat -> 403', r.status === 403, r.status);
    r = await fetch(BASE + '/admin/produk/baru', { method: 'POST', redirect: 'manual', headers: { Origin: 'https://evil.example', 'X-Forwarded-For': freshIp() }, body: new FormData() });
    check('K3 POST lintas-origin admin -> 403', r.status === 403, r.status);
    r = await form('/auth/masuk', { email: 'bukan-email', password: 'x', next: '//evil.example' });
    check('K3 login input buruk -> kembali ke /masuk', r.status === 303 && (r.headers.get('location') || '').startsWith('/masuk'), r.headers.get('location'));
    r = await form('/auth/masuk', { email: 'zz@mailinator.com', password: 'salahsalah1', next: '//evil.example' });
    check('K3 open redirect ?next=//evil ditolak', !/evil/.test(decodeURIComponent(r.headers.get('location') || '')), r.headers.get('location'));
    r = await form('/checkout/buat', { email: "'; drop table--", nama: 'x' }, undefined, { Cookie: 'cart=%5B%22tidak-ada%22%5D' });
    check('K3 checkout dengan keranjang tak valid tidak error 500', r.status === 303, r.status);
    r = await fetch(BASE + '/templates?q=' + encodeURIComponent("%'),id.eq.1,(x") );
    check('K3 pencarian katalog dengan sintaks filter aneh -> 200', r.status === 200, r.status);
    r = await fetch(BASE + '/templates/' + encodeURIComponent("../../etc/passwd"));
    check('K3 slug path traversal -> 404', r.status === 404, r.status);

    // ---------- K5 rate limit ----------
    const ip = freshIp();
    const codes = [];
    for (let i = 0; i < 13; i++) codes.push((await form('/auth/masuk', { email: 'rl@mailinator.com', password: 'salahsalah1' }, ip)).status);
    check('K5 /auth/masuk: 10 pertama lolos, berikutnya 429', codes.slice(0, 10).every((c) => c === 303) && codes.slice(10).every((c) => c === 429), codes.join(','));
    r = await form('/auth/masuk', { email: 'rl@mailinator.com', password: 'salahsalah1' }, ip);
    check('K5 429 membawa Retry-After + header keamanan', r.status === 429 && Number(r.headers.get('retry-after')) > 0 && r.headers.get('x-frame-options') === 'DENY', r.headers.get('retry-after'));
    r = await form('/auth/masuk', { email: 'rl@mailinator.com', password: 'salahsalah1' }, freshIp());
    check('K5 IP lain tidak ikut terblokir', r.status === 303, r.status);
    // XFF palsu di kiri tidak bisa mengakali (kunci = entri paling kanan)
    const base = freshIp();
    const c2 = [];
    for (let i = 0; i < 12; i++) c2.push((await form('/auth/masuk', { email: 'rl2@mailinator.com', password: 'salahsalah1' }, `9.9.9.${i}, ${base}`)).status);
    check('K5 XFF kiri dipalsukan tetap kena batas', c2.slice(10).every((c) => c === 429), c2.join(','));
    const ip3 = freshIp();
    const c3 = [];
    for (let i = 0; i < 7; i++) c3.push((await form('/auth/lupa', { email: 'rl3@mailinator.com' }, ip3)).status);
    check('K5 /auth/lupa: 5 lolos lalu 429', c3.slice(0, 5).every((c) => c === 303) && c3.slice(5).every((c) => c === 429), c3.join(','));
    r = await fetch(BASE + '/templates', { headers: { 'X-Forwarded-For': ip } });
    check('K5 halaman baca tidak dibatasi pada IP terblokir', r.status === 200, r.status);

    // ---------- K1 RLS per peran ----------
    const pw = 'UjiPass-' + tag + '!9';
    const mk = async (n, role) => {
      const email = `uji-${tag}-${n}@mailinator.com`;
      const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
      if (error) throw error;
      users.push(data.user.id);
      if (role) await admin.from('profiles').update({ role }).eq('id', data.user.id);
      const c = newClient();
      const { error: se } = await c.auth.signInWithPassword({ email, password: pw });
      if (se) throw se;
      return { id: data.user.id, email, c };
    };
    const A = await mk('adm', 'admin'), B1 = await mk('b1'), B2 = await mk('b2');
    const anon = newClient();
    const { data: pv } = await admin.from('products').insert([
      { slug: `uji-vis-${tag}`, judul: 'Vis', jenjang: 'Q1', harga: 1000, is_visible: true },
      { slug: `uji-hid-${tag}`, judul: 'Hid', jenjang: 'Q1', harga: 1000, is_visible: false },
    ]).select('id,slug');
    pv.forEach((x) => prodIds.push(x.id));
    const vis = pv.find((x) => x.slug.includes('vis')), hid = pv.find((x) => x.slug.includes('hid'));
    const { data: ord } = await admin.from('orders').insert({ user_id: B1.id, total: 1000, status: 'lunas' }).select('id').single();
    orderIds.push(ord.id);
    await admin.from('order_items').insert({ order_id: ord.id, product_id: vis.id, harga_saat_beli: 1000 });
    await admin.from('downloads').insert({ user_id: B1.id, product_id: vis.id, order_id: ord.id });

    const count = async (c, table, filter) => { let q = c.from(table).select('id', { count: 'exact', head: true }); if (filter) q = filter(q); const { count: n, error } = await q; return error ? -1 : n; };

    // anon
    check('K1 anon: baca produk visible saja', (await count(anon, 'products', (q) => q.in('id', [vis.id, hid.id]))) === 1);
    for (const t of ['orders', 'order_items', 'payments', 'downloads', 'bookings', 'profiles'])
      check(`K1 anon: ${t} kosong`, (await count(anon, t)) === 0, await count(anon, t));
    let e1 = (await anon.from('products').insert({ slug: `uji-x-${tag}`, judul: 'x', jenjang: 'Q1' })).error;
    check('K1 anon tidak bisa insert produk', !!e1);

    // pembeli 1 (pemilik)
    check('K1 pembeli: lihat order sendiri', (await count(B1.c, 'orders')) === 1);
    check('K1 pembeli: lihat item order sendiri', (await count(B1.c, 'order_items')) === 1);
    check('K1 pembeli: lihat riwayat unduhan sendiri', (await count(B1.c, 'downloads')) === 1);
    // pembeli 2 (orang lain)
    check('K1 pembeli lain: order orang tidak terlihat', (await count(B2.c, 'orders', (q) => q.eq('id', ord.id))) === 0);
    check('K1 pembeli lain: item order orang tidak terlihat', (await count(B2.c, 'order_items')) === 0);
    check('K1 pembeli lain: unduhan orang tidak terlihat', (await count(B2.c, 'downloads')) === 0);
    check('K1 pembeli lain: profil orang tidak terlihat', (await count(B2.c, 'profiles', (q) => q.eq('id', B1.id))) === 0);
    // tulis ditolak
    const bad = async (label, p) => { const res = await p; const changed = res.data && res.data.length; check(label, !!res.error || !changed, res.error ? res.error.message.slice(0, 60) : ''); };
    await bad('K1 pembeli tidak bisa insert produk', B2.c.from('products').insert({ slug: `uji-y-${tag}`, judul: 'y', jenjang: 'Q1' }).select());
    await bad('K1 pembeli tidak bisa ubah harga produk', B2.c.from('products').update({ harga: 1 }).eq('id', vis.id).select());
    await bad('K1 pembeli tidak bisa buat order', B2.c.from('orders').insert({ user_id: B2.id, total: 1, status: 'lunas' }).select());
    await bad('K1 pembeli tidak bisa ubah status order sendiri', B1.c.from('orders').update({ status: 'gagal' }).eq('id', ord.id).select());
    await bad('K1 pembeli tidak bisa hapus order sendiri', B1.c.from('orders').delete().eq('id', ord.id).select());
    await bad('K1 pembeli tidak bisa naik jadi admin', B2.c.from('profiles').update({ role: 'admin' }).eq('id', B2.id).select());
    await bad('K1 pembeli tidak bisa menulis downloads', B2.c.from('downloads').insert({ user_id: B2.id, product_id: vis.id, order_id: ord.id }).select());
    const { data: still } = await admin.from('profiles').select('role').eq('id', B2.id).single();
    check('K1 role pembeli tetap pembeli', still.role === 'pembeli', still.role);

    // admin
    check('K1 admin: melihat produk tersembunyi', (await count(A.c, 'products', (q) => q.eq('id', hid.id))) === 1);
    check('K1 admin: melihat semua order', (await count(A.c, 'orders', (q) => q.eq('id', ord.id))) === 1);
    check('K1 admin: melihat semua profil', (await count(A.c, 'profiles', (q) => q.in('id', [B1.id, B2.id]))) === 2);
    const upd = await A.c.from('products').update({ harga: 4321 }).eq('id', vis.id).select();
    check('K1 admin: bisa ubah harga produk', !upd.error && upd.data.length === 1, upd.error && upd.error.message);

    // ---------- L4 robots + sitemap + meta ----------
    r = await fetch(BASE + '/robots.txt');
    const rb = await r.text();
    check('L4 robots.txt: blok /admin /akun /checkout /unduh + sitemap', r.status === 200 && ['/admin', '/akun', '/checkout', '/unduh'].every((x) => rb.includes('Disallow: ' + x)) && /Sitemap:/.test(rb));
    r = await fetch(BASE + '/sitemap.xml');
    const sm = await r.text();
    check('L4 sitemap.xml XML valid, memuat halaman publik', r.status === 200 && /<urlset/.test(sm) && sm.includes('/tentang') && sm.includes('/bantuan'));
    check('L4 sitemap memuat produk visible, bukan yang tersembunyi', sm.includes(vis.slug) && !sm.includes(hid.slug));
    check('L4 sitemap tanpa halaman privat', !/\/admin|\/akun|\/checkout|\/unduh/.test(sm));
    for (const p of ['/', '/tentang', '/bantuan', '/templates', '/konsultasi']) {
      const t = await (await fetch(BASE + p)).text();
      check(`L4 meta di ${p}: title, description, og:title`, /<title>[^<]+<\/title>/.test(t) && /name="description" content="[^"]{10,}/.test(t) && /property="og:title"/.test(t));
    }
  } catch (e) {
    console.log('ERROR', e && e.stack ? e.stack : e);
    results.push(['error', false]);
  } finally {
    try {
      if (orderIds.length) {
        await admin.from('downloads').delete().in('order_id', orderIds);
        await admin.from('order_items').delete().in('order_id', orderIds);
        await admin.from('orders').delete().in('id', orderIds);
      }
      await admin.from('products').delete().like('slug', 'uji-%');
      for (const u of users) await admin.auth.admin.deleteUser(u);
      const left = await admin.from('products').select('id').like('slug', 'uji-%');
      console.log('bersih: produk uji tersisa =', left.data && left.data.length);
    } catch (e) { console.log('CLEANUP ERROR', e.message); }
    const badn = results.filter((x) => !x[1]).length;
    console.log(badn ? `GAGAL ${badn}/${results.length}` : `SEMUA LOLOS ${results.length}`);
    process.exit(badn ? 1 : 0);
  }
})();
