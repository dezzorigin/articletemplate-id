import type { APIRoute } from 'astro';
import { readCartItems, writeCartItems, isValidSlug } from '../../lib/cart';
import { getProductBySlug } from '../../lib/catalog';
import { getSupabaseAdmin } from '../../lib/supabase';
import { isPurchasable } from '../../lib/money';

// POST /keranjang/tambah  (slug)
// Penolakan dilakukan DI SERVER: produk tanpa harga final tidak bisa masuk
// keranjang walau tombol di UI diakali atau form dikirim manual.
// Sama untuk produk tanpa file template: yang belum punya file tidak boleh
// dibeli — jaring pertama sebelum guard di createOrder (src/lib/orders.ts).
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

  // Sudah di keranjang: biarkan jumlahnya (diatur dari halaman keranjang).
  const items = readCartItems(cookies);
  if (!items.some((i) => i.slug === slug)) writeCartItems(cookies, [...items, { slug, qty: 1 }]);
  return redirect('/keranjang', 303);
};
