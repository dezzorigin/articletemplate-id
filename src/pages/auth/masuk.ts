import type { APIRoute } from 'astro';
import { cleanEmail, isNotConfirmedError, validPassword, safeNext } from '../../lib/auth';

// POST /auth/masuk  (email, password, next)
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const email = cleanEmail(form.get('email'));
  const password = form.get('password');
  const next = safeNext(String(form.get('next') ?? ''));
  // Pertahankan email saat gagal (sandi tidak pernah dibawa di URL).
  const back = (code: string) =>
    redirect(
      `/masuk?e=${code}&next=${encodeURIComponent(next)}&email=${encodeURIComponent(email ?? '')}`,
      303,
    );

  if (!email || !validPassword(password)) return back('salah');

  const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
  // Pesan sama untuk email tidak ada / sandi salah / belum konfirmasi: tidak membocorkan akun.
  if (error) return back(isNotConfirmedError(error) ? 'konfirmasi' : 'salah');
  return redirect(next, 303);
};
