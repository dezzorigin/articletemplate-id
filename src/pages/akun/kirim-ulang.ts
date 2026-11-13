import type { APIRoute } from 'astro';
import { sendOrderPaidEmail } from '../../lib/email';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /akun/kirim-ulang (order). Kirim ulang email lunas + tautan unduhan (H6).
// Hanya pemilik order yang sudah lunas; email selalu ke alamat akun pemilik, bukan input form.
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect(`/masuk?next=${encodeURIComponent('/akun')}`, 303);

  const form = await request.formData();
  const order = String(form.get('order') ?? '');
  if (!UUID_RE.test(order)) return redirect('/akun?e=email', 303);

  // Klien sesi + RLS: hanya order milik sendiri yang terbaca.
  const { data } = await locals.supabase.from('orders').select('id, status').eq('id', order).maybeSingle();
  if (!data) return new Response('Tidak ditemukan', { status: 404 });
  if (data.status !== 'lunas') return redirect('/akun?e=belum-lunas', 303);

  const r = await sendOrderPaidEmail(order);
  if (!r.ok) {
    console.warn(`[email] kirim ulang ${order}: ${r.reason}`);
    return redirect('/akun?e=email', 303);
  }
  return redirect('/akun?ok=email', 303);
};
