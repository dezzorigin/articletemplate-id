import type { APIRoute } from 'astro';
import { writeCart, isValidSlug } from '../../lib/cart';
import { getProductBySlug } from '../../lib/catalog';
import { isPurchasable } from '../../lib/money';

// POST /keranjang/beli-sekarang  (slug)
// "Beli sekarang" (PRD §7.3): ganti isi keranjang dengan produk ini saja,
// lalu langsung ke checkout — tanpa lewat halaman keranjang.
// Penolakan dilakukan DI SERVER, sama seperti /keranjang/tambah: produk tanpa
// harga final tidak bisa dibeli walau form dikirim manual.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const slug = form.get('slug');
  if (!isValidSlug(slug)) return redirect('/templates', 303);

  const product = await getProductBySlug(slug);
  if (!product) return redirect('/templates', 303);
  if (!isPurchasable(product.harga)) {
    return redirect(`/templates/${slug}?e=belum-dijual`, 303);
  }

  writeCart(cookies, [slug]);
  return redirect('/checkout', 303);
};
