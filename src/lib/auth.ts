import type { AstroCookies } from 'astro';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { requireEnv, optionalEnv } from './env';

/** Klien Supabase server dengan sesi dari cookie. Dibuat per request. */
export function createSupabaseServer(request: Request, cookies: AstroCookies) {
  return createServerClient(
    requireEnv('PUBLIC_SUPABASE_URL'),
    requireEnv('PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get('Cookie') ?? '').map((c) => ({
            name: c.name,
            value: c.value ?? '',
          }));
        },
        setAll(list) {
          // Sesi hanya dipakai di server: httpOnly agar tidak bisa dibaca skrip (XSS).
          for (const { name, value, options } of list) {
            cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: import.meta.env.PROD,
            });
          }
        },
      },
    },
  );
}

/** Hanya path internal. Cegah open redirect ("//evil.com", "https://...", "/\evil"). */
export function safeNext(next: string | null | undefined, fallback = '/akun'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback;
  }
  return next;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/** Panjang 8..72 (batas bcrypt). */
export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 72;
}

export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim().slice(0, 80);
  return name || null;
}

export function googleEnabled(): boolean {
  return optionalEnv('GOOGLE_LOGIN_ENABLED') === 'true';
}
