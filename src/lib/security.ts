// Header keamanan + rate limit (CHECKLIST K4, K5). Dipasang di middleware untuk semua respons.

const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.PUBLIC_SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return '';
  }
})();

// Tidak ada skrip inline/eksternal di situs ini, jadi script-src 'self' saja.
// style 'unsafe-inline' dibutuhkan karena Astro menyisipkan <style>. Pratinjau (gambar) dari Supabase Storage publik.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${SUPABASE_HOST}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${SUPABASE_HOST}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function applySecurityHeaders(res: Response, isProd: boolean): Response {
  let h = res.headers;
  try {
    h.set('X-Content-Type-Options', 'nosniff');
  } catch {
    // Header respons tertentu bisa tidak dapat diubah (immutable): salin ke Response baru.
    res = new Response(res.body, { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) });
    h = res.headers;
  }
  h.set('Content-Security-Policy', CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (isProd) h.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  return res;
}

// ---------- rate limit (memori proses; cukup untuk satu instance Coolify) ----------

interface Rule {
  match: (method: string, path: string) => boolean;
  name: string;
  max: number;
  windowMs: number;
}

const MIN = 60_000;
export const RULES: Rule[] = [
  { name: 'masuk', match: (m, p) => m === 'POST' && p === '/auth/masuk', max: 10, windowMs: MIN },
  { name: 'daftar', match: (m, p) => m === 'POST' && p === '/auth/daftar', max: 5, windowMs: 10 * MIN },
  { name: 'lupa', match: (m, p) => m === 'POST' && p === '/auth/lupa', max: 5, windowMs: 10 * MIN },
  { name: 'atur', match: (m, p) => m === 'POST' && p === '/auth/atur', max: 10, windowMs: 10 * MIN },
  { name: 'checkout', match: (m, p) => m === 'POST' && p === '/checkout/buat', max: 15, windowMs: 10 * MIN },
  { name: 'keranjang', match: (m, p) => m === 'POST' && p.startsWith('/keranjang/'), max: 60, windowMs: MIN },
  { name: 'unduh', match: (_m, p) => p.startsWith('/unduh/'), max: 30, windowMs: MIN },
  { name: 'webhook', match: (m, p) => m === 'POST' && p === '/api/webhook-borderpay', max: 120, windowMs: MIN },
];

const hits = new Map<string, number[]>();
let lastSweep = Date.now();

/** IP klien. Di belakang proxy tepercaya (Traefik/Coolify), entri TERKANAN X-Forwarded-For
 *  ditambahkan proxy sehingga tidak bisa dipalsukan klien; entri kiri bisa. */
export function clientKey(request: Request, fallback: string | undefined): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const last = xff.split(',').map((s) => s.trim()).filter(Boolean).pop();
    if (last) return last;
  }
  return fallback ?? 'tak-dikenal';
}

export interface LimitResult {
  limited: boolean;
  retryAfterS: number;
}

export function checkRateLimit(method: string, path: string, key: string, now = Date.now()): LimitResult {
  const rule = RULES.find((r) => r.match(method, path));
  if (!rule) return { limited: false, retryAfterS: 0 };

  if (now - lastSweep > 5 * MIN) {
    lastSweep = now;
    for (const [k, arr] of hits) if (arr.length === 0 || now - arr[arr.length - 1] > 30 * MIN) hits.delete(k);
  }

  const id = `${rule.name}|${key}`;
  const arr = (hits.get(id) ?? []).filter((t) => now - t < rule.windowMs);
  if (arr.length >= rule.max) {
    hits.set(id, arr);
    return { limited: true, retryAfterS: Math.max(1, Math.ceil((arr[0] + rule.windowMs - now) / 1000)) };
  }
  arr.push(now);
  hits.set(id, arr);
  return { limited: false, retryAfterS: 0 };
}
