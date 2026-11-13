import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServer } from './lib/auth';
import { applySecurityHeaders, checkRateLimit, clientKey } from './lib/security';

// Path yang tidak butuh sesi (aset + health check tidak boleh gagal karena env).
const SKIP = [/^\/_astro\//, /^\/api\/health$/, /^\/favicon/];
const NEED_LOGIN = ['/akun', '/admin', '/unduh'];

const startsWithPath = (path: string, base: string) =>
  path === base || path.startsWith(base + '/');

const inner = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  if (SKIP.some((re) => re.test(path))) return next();

  const supabase = createSupabaseServer(context.request, context.cookies);
  context.locals.supabase = supabase;

  // getUser memverifikasi token ke server Auth (bukan sekadar membaca cookie).
  const { data } = await supabase.auth.getUser();
  context.locals.user = data.user ?? null;

  if (NEED_LOGIN.some((base) => startsWithPath(path, base))) {
    if (!context.locals.user) {
      return context.redirect(`/masuk?next=${encodeURIComponent(path)}`, 303);
    }
  }

  // Admin: hanya role 'admin'. Selain itu 404 (jangan membocorkan keberadaan halaman).
  if (startsWithPath(path, '/admin') && context.locals.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', context.locals.user.id)
      .maybeSingle();
    if (profile?.role !== 'admin') {
      return context.rewrite('/404');
    }
  }

  return next();
});

// Lapisan luar: rate limit sebelum pekerjaan berat, header keamanan di SEMUA respons.
export const onRequest = defineMiddleware(async (context, next) => {
  const { limited, retryAfterS } = checkRateLimit(
    context.request.method,
    context.url.pathname,
    clientKey(context.request, (() => { try { return context.clientAddress; } catch { return undefined; } })()),
  );
  if (limited) {
    return applySecurityHeaders(
      new Response('Terlalu banyak permintaan. Coba lagi sebentar lagi.', {
        status: 429,
        headers: { 'Retry-After': String(retryAfterS), 'Content-Type': 'text/plain; charset=utf-8' },
      }),
      import.meta.env.PROD,
    );
  }
  const res = await inner(context, next);
  return applySecurityHeaders(res, import.meta.env.PROD);
});
