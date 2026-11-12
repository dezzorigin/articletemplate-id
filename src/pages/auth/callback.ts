import type { APIRoute } from 'astro';
import { safeNext } from '../../lib/auth';

// GET /auth/callback?code=...&next=...  (tautan email / Google OAuth, alur PKCE)
export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');
  if (!code) return redirect('/masuk?e=tautan', 303);
  const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
  if (error) return redirect('/masuk?e=tautan', 303);
  return redirect(safeNext(url.searchParams.get('next')), 303);
};
