import type { APIRoute } from 'astro';
import { readCart } from '../../lib/cart';
import { cleanEmail, cleanName } from '../../lib/auth';
import { createOrder, ensureBuyer } from '../../lib/orders';

// POST /checkout/buat  (nama, email untuk guest)
// Login: pakai akun sesi, abaikan email dari form. Guest: akun otomatis dari email.
export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  const slugs = readCart(cookies);
  if (slugs.length === 0) return redirect('/keranjang', 303);

  const form = await request.formData();
  let userId: string | null = locals.user?.id ?? null;

  if (!userId) {
    const email = cleanEmail(form.get('email'));
    const nama = cleanName(form.get('nama'));
    if (!email || !nama) return redirect('/checkout?e=data', 303);
    userId = await ensureBuyer(email, nama);
    if (!userId) return redirect('/checkout?e=akun', 303);
  }

  const result = await createOrder(userId, slugs);
  if (!result.ok) {
    const code = result.reason === 'gagal' ? 'gagal' : result.reason === 'tanpa-file' ? 'file' : 'harga';
    return redirect(`/checkout?e=${code}`, 303);
  }
  return redirect(`/checkout/status?order=${result.orderId}`, 303);
};
