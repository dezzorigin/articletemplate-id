// Uji J2: booking nyata tidak bisa dibuat lewat UI maupun API (PostgREST langsung dengan sesi pembeli).
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

(async () => {
  let uid = null;
  try {
    // layanan: tidak ada yang visible
    const { data: vis } = await admin.from('services').select('id').eq('is_visible', true);
    check('tidak ada layanan is_visible', (vis || []).length === 0, (vis || []).length);
    const { data: svc } = await admin.from('services').select('id,harga,durasi_menit').limit(1);

    // API publik (anon) tidak melihat layanan
    const anon = createClient(U, ANON, { auth: { persistSession: false } });
    const { data: aSvc } = await anon.from('services').select('id');
    check('anon tidak melihat layanan', (aSvc || []).length === 0);
    const { data: anonIns, error: anonErr } = await anon.from('bookings').insert({ user_id: '00000000-0000-0000-0000-000000000000', service_id: svc && svc[0] ? svc[0].id : '00000000-0000-0000-0000-000000000000', slot_at: new Date(Date.now() + 864e5).toISOString() }).select();
    check('anon tidak bisa membuat booking', !!anonErr && !(anonIns && anonIns.length), anonErr && anonErr.message);

    // pembeli login
    const email = `uji-${tag}-bk@mailinator.com`, pw = 'UjiPass-' + tag + '!9';
    const { data: cu, error: ce } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (ce) throw ce;
    uid = cu.user.id;
    const buyer = createClient(U, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: se } = await buyer.auth.signInWithPassword({ email, password: pw });
    if (se) throw se;

    const target = svc && svc[0] ? svc[0].id : null;
    check('ada layanan placeholder untuk diuji', !!target);
    if (target) {
      const { data: ins, error } = await buyer.from('bookings').insert({ user_id: uid, service_id: target, slot_at: new Date(Date.now() + 864e5).toISOString() }).select();
      check('pembeli login tidak bisa booking layanan tersembunyi', !!error && !(ins && ins.length), error && error.message);
    }
    const { data: mine } = await admin.from('bookings').select('id').eq('user_id', uid);
    check('tidak ada baris booking tercipta', (mine || []).length === 0);

    // pembeli tidak bisa membuka layanan sendiri
    const { error: upErr, data: upd } = await buyer.from('services').update({ is_visible: true }).eq('id', target).select();
    check('pembeli tidak bisa menampakkan layanan', !(upd && upd.length));
    const { data: after } = await admin.from('services').select('is_visible').eq('id', target).single();
    check('layanan tetap tersembunyi', after && after.is_visible === false);

    // UI: tidak ada form/endpoint booking
    const html = await (await fetch(BASE + '/konsultasi')).text();
    check('/konsultasi tanpa <form>', !/<form/i.test(html));
    // Tombol menu mobile (header) dan penutupnya bukan tombol booking.
    const tombol = [...html.replace(/<nav[\s\S]*?<\/nav>/g, '').matchAll(/<button[^>]*>/gi)].map((m) => m[0]).filter((t) => !/id="(menu-btn|sheet-close)"/.test(t));
    check('/konsultasi tanpa tombol booking aktif', tombol.length === 0, tombol.join(' ').slice(0, 120));
    for (const p of ['/konsultasi/booking', '/konsultasi/buat', '/api/booking', '/booking']) {
      const r = await fetch(BASE + p, { method: 'POST', redirect: 'manual', headers: { Origin: BASE } });
      check(`POST ${p} tidak ada (404/405)`, r.status === 404 || r.status === 405, r.status);
    }
  } catch (e) {
    console.log('ERROR', e && e.stack ? e.stack : e);
    results.push(['error', false]);
  } finally {
    try { if (uid) await admin.auth.admin.deleteUser(uid); } catch (e) { console.log('CLEANUP ERROR', e.message); }
    const bad = results.filter((x) => !x[1]).length;
    console.log(bad ? `GAGAL ${bad}/${results.length}` : `SEMUA LOLOS ${results.length}`);
    process.exit(bad ? 1 : 0);
  }
})();
