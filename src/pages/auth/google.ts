import type { APIRoute } from 'astro';
import { googleEnabled, safeNext } from '../../lib/auth';

// GET /auth/google  -> mulai OAuth Google. Hanya aktif bila GOOGLE_LOGIN_ENABLED=true
// (provider Google harus dihidupkan dulu di dashboard Supabase).
export const GET: APIRoute = async ({ url, locals, redirect }) => {
  if (!googleEnabled()) return redirect('/masuk?e=google', 303);
  const next = safeNext(url.searchParams.get('next'));
  const { data, error } = await locals.supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) return redirect('/masuk?e=google', 303);
  return redirect(data.url, 303);
};
