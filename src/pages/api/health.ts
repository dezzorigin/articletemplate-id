import type { APIRoute } from 'astro';

// Health check ringan. Dipakai monitoring uptime, BUKAN keepalive Supabase
// (keepalive harus menyentuh database — lihat .github/workflows/keepalive.yml).
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
