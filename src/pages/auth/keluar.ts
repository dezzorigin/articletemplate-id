import type { APIRoute } from 'astro';

// POST /auth/keluar
export const POST: APIRoute = async ({ locals, redirect }) => {
  await locals.supabase.auth.signOut();
  return redirect('/', 303);
};
