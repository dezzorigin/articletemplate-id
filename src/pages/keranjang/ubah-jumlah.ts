import type { APIRoute } from 'astro';
import { MAX_QTY, readCartItems, writeCartItems, isValidSlug } from '../../lib/cart';

// POST /keranjang/ubah-jumlah  (slug, aksi = tambah | kurang)
// Produk digital boleh dibeli > 1 (mis. untuk tim/kelas); qty 1..MAX_QTY.
// Kurang dari 1 = hapus produk dari keranjang.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const slug = form.get('slug');
  const aksi = form.get('aksi');
  if (isValidSlug(slug) && (aksi === 'tambah' || aksi === 'kurang')) {
    const items = readCartItems(cookies);
    const item = items.find((i) => i.slug === slug);
    if (item) {
      item.qty += aksi === 'tambah' ? 1 : -1;
      if (item.qty < 1) {
        writeCartItems(
          cookies,
          items.filter((i) => i.slug !== slug),
        );
      } else {
        item.qty = Math.min(item.qty, MAX_QTY);
        writeCartItems(cookies, items);
      }
    }
  }
  return redirect('/keranjang', 303);
};
