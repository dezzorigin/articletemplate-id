import type { APIRoute } from 'astro';
import { cleanEmail, signUpErrorCode } from '../../lib/auth';

// POST /auth/kirim-ulang-konfirmasi  (email). Kirim ulang email konfirmasi
// pendaftaran untuk akun yang sudah terdaftar tapi belum dikonfirmasi.
// Dipakai dari halaman /masuk saat error 'konfirmasi' muncul.
export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
  const form = await request.formData();
  const email = cleanEmail(form.get('email'));
  if (!email) return redirect('/masuk?e=kirim-gagal', 303);

  const { error } = await locals.supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${url.origin}/auth/callback` },
  });
  if (error) {
    // Alasan rinci (SMTP mati, alamat tidak dikenal, dsb.) hanya di log
    // server — ke user cukup pesan generik, tanpa membocorkan akun.
    console.error('[auth] kirim ulang konfirmasi gagal', {
      code: signUpErrorCode(error),
      status: error.status ?? null,
      message: error.message,
    });
    return redirect('/masuk?e=kirim-gagal', 303);
  }
  return redirect('/masuk?ok=kirim-ulang', 303);
};
