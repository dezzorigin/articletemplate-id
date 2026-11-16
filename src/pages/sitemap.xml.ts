import type { APIRoute } from 'astro';
import { listProducts } from '../lib/catalog';

export const prerender = false;

// Hanya halaman publik + produk is_visible. Domain tetap (bukan dari header Host).
const SITE = (process.env.SITE_URL ?? 'https://articletemplate.id').replace(/\/$/, '');
const STATIC = ['/', '/templates', '/harga', '/tentang', '/bantuan', '/konsultasi'];

export const GET: APIRoute = async () => {
  let products: { slug: string }[] = [];
  try {
    // Rute publik: bila Supabase sedang tidak terjangkau, sitemap tetap
    // terbit berisi halaman statis saja (bukan 500).
    ({ products } = await listProducts({ urut: 'terbaru' }));
  } catch (e) {
    console.error('[sitemap] gagal baca produk:', (e as Error)?.message ?? e);
  }
  const urls = [...STATIC, ...products.map((p) => `/templates/${p.slug}`)];
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
