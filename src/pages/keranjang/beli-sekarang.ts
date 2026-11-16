import type { APIRoute } from 'astro';
import { writeCart, isValidSlug } from '../../lib/cart';
import { getProductBySlug } from '../../lib/catalog';
import { getSupabaseAdmin } from '../../lib/supabase';
import { isPurchasable } from '../../lib/money';

// POST /keranjang/beli-sekarang  (slug)
// "Beli sekarang" (PRD §7.3): ganti isi keranjang dengan produk ini saja,
// lalu langsung ke checkout — tanpa lewat halaman keranjang.
// Penolakan dilakukan DI SERVER, sama seperti /keranjang/tambah: produk tanpa
// harga final tidak bisa dibeli walau form dikirim manual.
// Sama untuk produk tanpa file template (jaring pertama sebelum guard di
// createOrder — src/lib/orders.ts).
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const slug = form.get('slug');
  if (!isValidSlug(slug)) return redirect('/templates', 303);

  const product = await getProductBySlug(slug);
  if (!product) return redirect('/templates', 303);
  if (!isPurchasable(product.harga)) {
    return redirect(`/templates/${slug}?e=belum-dijual`, 303);
  }
  const { data: row } = await getSupabaseAdmin()
    .from('products')
    .select('file_path')
    .eq('slug', slug)
    .eq('is_visible', true)
    .maybeSingle();
  if (!row?.file_path) {
    return redirect(`/templates/${slug}?e=belum-dijual`, 303);
  }

  writeCart(cookies, [slug]);
  return redirect('/checkout', 303);
};
