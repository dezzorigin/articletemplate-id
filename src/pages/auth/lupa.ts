import type { APIRoute } from 'astro';
import { cleanEmail } from '../../lib/auth';

// POST /auth/lupa  (email). Balasan selalu sama, tidak membocorkan apakah email terdaftar.
export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
  const form = await request.formData();
  const email = cleanEmail(form.get('email'));
  if (!email) return redirect('/lupa-password?e=email', 303);

  await locals.supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${url.origin}/auth/callback?next=/atur-password`,
  });
  return redirect('/lupa-password?ok=terkirim', 303);
};
