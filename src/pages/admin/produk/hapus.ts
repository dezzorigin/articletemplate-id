import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { requireAdmin, isUuid, removeFiles } from '../../../lib/admin';

export const prerender = false;

// POST /admin/produk/hapus (id). Produk yang sudah ada di order_items/downloads tidak dihapus
// (riwayat & unduhan ulang pembeli harus utuh): disembunyikan saja.
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!(await requireAdmin(locals.supabase, locals.user))) return new Response('Tidak ditemukan', { status: 404 });
  const id = (await request.formData()).get('id');
  if (!isUuid(id)) return new Response('Tidak ditemukan', { status: 404 });

  const admin = getSupabaseAdmin();
  const { data: p } = await admin.from('products').select('file_path, preview_path').eq('id', id).maybeSingle();
  if (!p) return redirect('/admin/produk', 303);

  const { count } = await admin.from('order_items').select('id', { count: 'exact', head: true }).eq('product_id', id);
  if ((count ?? 0) > 0) {
    await admin.from('products').update({ is_visible: false }).eq('id', id);
    return redirect('/admin/produk?m=disembunyikan', 303);
  }

  const { error } = await admin.from('products').delete().eq('id', id);
  if (error) {
    console.error('[admin] gagal hapus produk:', error.message);
    return redirect('/admin/produk?m=gagal', 303);
  }
  await removeFiles('templates', [p.file_path]);
  await removeFiles('previews', [p.preview_path]);
  return redirect('/admin/produk?m=dihapus', 303);
};
