import type { APIRoute } from 'astro';
import { cleanEmail, safeNext, verifyOtpErrorCode } from '../../lib/auth';

// POST /auth/verifikasi-kode  (email, kode, jenis=signup|recovery, next)
// Jalur tanpa PKCE: kode 6 digit dari email diverifikasi langsung via
// verifyOtp — tidak butuh cookie verifier, jadi jalan walau alur dimulai
// di klien lain (atau verifier cookie hilang). Dipakai dari halaman
// /konfirmasi-kode. Sukses signup -> sesi -> /akun (atau `next`);
// sukses recovery -> sesi recovery -> /atur-password.
// PENTING: kode dan tautan menebus token sekali pakai yang SAMA — kode
// dari email yang tautannya sudah diklik tidak bisa dipakai lagi
// (GoTrue menjawab otp_expired). Pakai kode dari email segar TANPA
// mengklik tautannya.
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const email = cleanEmail(form.get('email'));
  const rawKodeEntry = form.get('kode');
  const rawKode = typeof rawKodeEntry === 'string' ? rawKodeEntry.trim() : '';
  const kode = /^\d{6}$/.test(rawKode) ? rawKode : null;
  const jenis = form.get('jenis') === 'recovery' ? 'recovery' : 'signup';
  const next = safeNext(String(form.get('next') ?? ''));

  // Pertahankan isian saat gagal (email + jenis + next lewat query).
  const back = (code: string) =>
    redirect(
      `/konfirmasi-kode?e=${code}&jenis=${jenis}&next=${encodeURIComponent(next)}&email=${encodeURIComponent(email ?? '')}`,
      303,
    );

  if (!email) return back('email');
  if (!kode) return back('kode');

  const { error } = await locals.supabase.auth.verifyOtp({
    email,
    token: kode,
    type: jenis,
  });
  if (error) {
    // Alasan rinci hanya di log server — ke user cukup kode ?e=...,
    // tanpa membocorkan akun.
    console.error('[auth] verifikasi kode gagal', {
      code: error.code ?? null,
      status: error.status ?? null,
      message: error.message,
    });
    return back(verifyOtpErrorCode(error));
  }
  return redirect(jenis === 'recovery' ? '/atur-password' : next, 303);
};
