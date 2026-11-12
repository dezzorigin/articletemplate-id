import type { APIRoute } from 'astro';
import { cleanEmail, validPassword, safeNext } from '../../lib/auth';

// POST /auth/masuk  (email, password, next)
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const email = cleanEmail(form.get('email'));
  const password = form.get('password');
  const next = safeNext(String(form.get('next') ?? ''));
  const back = (code: string) =>
    redirect(`/masuk?e=${code}&next=${encodeURIComponent(next)}`, 303);

  if (!email || !validPassword(password)) return back('salah');

  const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
  // Pesan sama untuk email tidak ada / sandi salah / belum konfirmasi: tidak membocorkan akun.
  if (error) return back(error.message.toLowerCase().includes('not confirmed') ? 'konfirmasi' : 'salah');
  return redirect(next, 303);
};
