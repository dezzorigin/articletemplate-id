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

// Domain yang dicadangkan (RFC 2606) + tidak bisa menerima email. GoTrue
// (Supabase Auth) menolak domain contoh/tes saat signup dengan error
// `email_address_invalid` ("Example and test domains are currently not
// supported") — jadi tolak lebih awal dengan pesan yang jelas, bukan
// menunggu error generik dari server. Daftar: example.com/net/org/edu.
const EXAMPLE_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'example.edu',
  'example',
  'test',
  'invalid',
  'localhost',
]);

/** true bila alamat memakai domain contoh/tes yang tidak bisa menerima email. */
export function isExampleDomain(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const at = value.lastIndexOf('@');
  if (at < 0) return false;
  return EXAMPLE_DOMAINS.has(value.slice(at + 1).trim().toLowerCase());
}

export function cleanEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  if (isExampleDomain(email)) return null;
  return email;
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

/** Bentuk minimal error Supabase Auth (AuthApiError): kode + pesan + status HTTP. */
export interface AuthErrorLike {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}

/**
 * Kode error pendaftaran yang ditampilkan ke user (dipakai sebagai ?e=...).
 * Dipetakan dari kode error GoTrue (supabase-js AuthApiError.code) + pesan,
 * BUKAN dari tebakan: setiap kode punya arti + perbaikan yang berbeda.
 *
 * - 'domain': GoTrue menolak domain contoh/tes (`email_address_invalid`).
 * - 'terdaftar': email sudah terdaftar — DITANGANI KHUSUS di daftar.ts:
 *   dibalas sama seperti sukses (cek email), TIDAK membocorkan akun.
 * - 'nonaktif': pendaftaran email / signup dimatikan di server
 *   (`email_provider_disabled` / `signup_disabled`).
 * - 'email': email konfirmasi tidak bisa dikirim server — SMTP self-hosted
 *   belum dikonfigurasi, atau alamat ditolak pengirim (`email_address_not_authorized`,
 *   "Error sending confirmation mail"). User TIDAK jadi dibuat (transaksi
 *   signup GoTrue di-rollback), jadi login sesudahnya menjawab 'salah'.
 * - 'batas': rate limit kirim email Auth (429 / `over_email_send_rate_limit`).
 * - 'tautan': URL pengalihan tidak diizinkan server (allow list redirect).
 * - 'gagal': sisanya — pesan generik + log server untuk diagnosis.
 */
export type SignUpErrorCode =
  | 'domain'
  | 'terdaftar'
  | 'nonaktif'
  | 'email'
  | 'batas'
  | 'tautan'
  | 'gagal';

export function signUpErrorCode(error: AuthErrorLike | null | undefined): SignUpErrorCode {
  if (!error) return 'gagal';
  const code = (error.code ?? '').toLowerCase();
  const msg = (error.message ?? '').toLowerCase();
  if (code === 'email_address_invalid' || msg.includes('email address is invalid')) return 'domain';
  if (
    code === 'user_already_exists' ||
    msg.includes('already registered') ||
    msg.includes('already exists')
  ) {
    return 'terdaftar';
  }
  if (
    code === 'email_provider_disabled' ||
    code === 'signup_disabled' ||
    msg.includes('signups are disabled') ||
    msg.includes('sign ups are disabled') ||
    msg.includes('signups not allowed')
  ) {
    return 'nonaktif';
  }
  if (
    code === 'over_email_send_rate_limit' ||
    error.status === 429 ||
    msg.includes('rate limit')
  ) {
    return 'batas';
  }
  if (
    code === 'email_address_not_authorized' ||
    msg.includes('not authorized') ||
    msg.includes('sending confirmation') ||
    msg.includes('error sending confirmation')
  ) {
    return 'email';
  }
  if (msg.includes('redirect')) return 'tautan';
  return 'gagal';
}

/** true bila error login berarti "email belum dikonfirmasi" (kode atau pesan GoTrue). */
export function isNotConfirmedError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  return (
    (error.code ?? '').toLowerCase() === 'email_not_confirmed' ||
    (error.message ?? '').toLowerCase().includes('not confirmed')
  );
}

// Pola flow id PKCE auth-js (helpers.js validatePKCEFlowId): 8..64 karakter
// [A-Za-z0-9_-]. Dipakai untuk memvalidasi `sb_flow_id` dari URL callback
// sebelum diteruskan ke exchangeCodeForSession — nilai lain diabaikan.
const FLOW_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** true bila nilai adalah flow id PKCE yang sah (parameter `sb_flow_id`). */
export function validFlowId(value: unknown): value is string {
  return typeof value === 'string' && FLOW_ID_RE.test(value);
}

/**
 * true bila error exchangeCodeForSession berarti "verifier tidak cocok /
 * tidak ditemukan" — BUKAN tautan tidak valid:
 * - `bad_code_verifier` (AuthApiError.code dari GoTrue, HTTP 400): ada
 *   verifier yang terkirim tapi salah (basi dari alur lain / alur dari
 *   klien lain). Langkah /verify GoTrue SUDAH mengonfirmasi email sebelum
 *   mengeluarkan code, jadi user bisa langsung masuk dengan kata sandi.
 * - `pkce_code_verifier_not_found` / AuthPKCECodeVerifierMissingError:
 *   tidak ada verifier sama sekali (alur dimulai di browser/perangkat
 *   lain). auth-js melempar ini TANPA POST /token, jadi tidak ada
 *   bad_code_verifier di log untuk kasus ini.
 */
export function isVerifierError(
  error: (AuthErrorLike & { name?: string | null }) | null | undefined,
): boolean {
  if (!error) return false;
  const code = (error.code ?? '').toLowerCase();
  return (
    code === 'bad_code_verifier' ||
    code === 'pkce_code_verifier_not_found' ||
    error.name === 'AuthPKCECodeVerifierMissingError'
  );
}

/**
 * Kode error verifikasi kode 6 digit (dipakai sebagai ?e=... di
 * /konfirmasi-kode). Dipetakan dari kode error GoTrue + pesan + status.
 * - 'kode': kode salah, sudah dipakai, atau sudah kedaluwarsa
 *   (`otp_expired` — termasuk kode dari email yang tautannya sudah
 *   diklik: tautan dan kode menebus token sekali pakai yang sama).
 * - 'batas': rate limit verifikasi (429 / `over_request_rate_limit`).
 * - 'gagal': sisanya.
 */
export type VerifyOtpErrorCode = 'kode' | 'batas' | 'gagal' | 'email';

export function verifyOtpErrorCode(error: AuthErrorLike | null | undefined): VerifyOtpErrorCode {
  if (!error) return 'gagal';
  const code = (error.code ?? '').toLowerCase();
  const msg = (error.message ?? '').toLowerCase();
  if (
    code === 'otp_expired' ||
    msg.includes('expired') ||
    msg.includes('invalid token') ||
    msg.includes('token has expired')
  ) {
    return 'kode';
  }
  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    error.status === 429 ||
    msg.includes('rate limit')
  ) {
    return 'batas';
  }
  return 'gagal';
}
