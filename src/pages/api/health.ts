import type { APIRoute } from 'astro';

// Health check ringan. Dipakai monitoring uptime, BUKAN keepalive Supabase
// (keepalive harus menyentuh database; workflow keepalive di repo sudah
// dihapus 16 Nov 2026 atas keputusan Nabil).
export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      ok: true,
      service: 'articletemplate',
      time: new Date().toISOString(),
    }),
    { headers: { 'content-type': 'application/json' } },
  );
};
