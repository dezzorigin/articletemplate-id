import type { APIRoute } from 'astro';
import { validPassword } from '../../lib/auth';

// POST /auth/atur  (password, ulangi). Butuh sesi dari tautan email (callback).
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/masuk?e=tautan', 303);
  const form = await request.formData();
  const password = form.get('password');
  if (!validPassword(password)) return redirect('/atur-password?e=sandi', 303);
  if (password !== form.get('ulangi')) return redirect('/atur-password?e=beda', 303);

  const { error } = await locals.supabase.auth.updateUser({ password });
  if (error) return redirect('/atur-password?e=gagal', 303);
  return redirect('/akun?ok=sandi', 303);
};
