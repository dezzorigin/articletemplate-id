import type { APIRoute } from 'astro';
import { readCart, writeCart, isValidSlug } from '../../lib/cart';
import { getProductBySlug } from '../../lib/catalog';
import { isPurchasable } from '../../lib/money';

// POST /keranjang/tambah  (slug)
// Penolakan dilakukan DI SERVER: produk tanpa harga final tidak bisa masuk
// keranjang walau tombol di UI diakali atau form dikirim manual.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const slug = form.get('slug');
  if (!isValidSlug(slug)) return redirect('/templates', 303);

  const product = await getProductBySlug(slug);
  if (!product) return redirect('/templates', 303);
  if (!isPurchasable(product.harga)) {
    return redirect(`/templates/${slug}?e=belum-dijual`, 303);
  }

  const cart = readCart(cookies);
  if (!cart.includes(slug)) writeCart(cookies, [...cart, slug]);
  return redirect('/keranjang', 303);
};
