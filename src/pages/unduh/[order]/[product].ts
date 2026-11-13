import type { APIRoute } from 'astro';
import { authorizeDownload } from '../../../lib/downloads';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect(`/masuk?next=${encodeURIComponent('/akun')}`, 303);

  const r = await authorizeDownload(user.id, params.order ?? '', params.product ?? '');
  if (r.ok) return redirect(r.url, 302);

  if (r.reason === 'tidak-valid' || r.reason === 'tidak-berhak') return new Response('Tidak ditemukan', { status: 404 });
  if (r.reason === 'belum-lunas') return redirect('/akun?e=belum-lunas', 303);
  if (r.reason === 'file-belum-ada') return redirect('/akun?e=file-belum-ada', 303);
  return redirect('/akun?e=gagal', 303);
};
