import type { APIRoute } from 'astro';
import { readCart, writeCart, isValidSlug } from '../../lib/cart';

// POST /keranjang/hapus  (slug)
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const slug = form.get('slug');
  if (isValidSlug(slug)) {
    writeCart(cookies, readCart(cookies).filter((s) => s !== slug));
  }
  return redirect('/keranjang', 303);
};
