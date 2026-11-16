import type { APIRoute } from 'astro';
import { readCartItems, writeCartItems, isValidSlug } from '../../lib/cart';

// POST /keranjang/hapus  (slug)
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const slug = form.get('slug');
  if (isValidSlug(slug)) {
    writeCartItems(
      cookies,
      readCartItems(cookies).filter((i) => i.slug !== slug),
    );
  }
  return redirect('/keranjang', 303);
};
