import type { APIRoute } from 'astro';
import { isVerifierError, safeNext, validFlowId } from '../../lib/auth';

// GET /auth/callback?code=...&sb_flow_id=...&next=...  (tautan email / Google OAuth, alur PKCE)
export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');
  if (!code) return redirect('/masuk?e=tautan', 303);
  const next = safeNext(url.searchParams.get('next'));

  // auth-js 2.118 di server TIDAK membaca `sb_flow_id` dari URL
  // (isBrowser() false -> requestedFlowId null), sehingga
  // exchangeCodeForSession(code) tanpa flowId hanya memakai kunci legacy
  // `<storageKey>-code-verifier` — cerminan verifier ALUR TERAKHIR yang
  // dimulai di browser itu. Tautan dari alur yang lebih lama (daftar lalu
  // kirim-ulang, atau reset lalu reset lagi) menukar verifier basi dan
  // GoTrue menjawab 400 bad_code_verifier. Teruskan flowId dari URL
  // supaya auth-js memakai slot verifier alur yang benar
  // (`<storageKey>-flow-<flowId>-code-verifier`). Bila tidak ada flowId
  // (tautan lama), perilaku lama dipertahankan (kunci legacy).
  const flowId = url.searchParams.get('sb_flow_id');
  const { error } = await locals.supabase.auth.exchangeCodeForSession(
    code,
    validFlowId(flowId) ? { flowId } : undefined,
  );
  if (!error) return redirect(next, 303);

  // JANGAN telan error: kode + pesan GoTrue adalah satu-satunya petunjuk
  // apakah yang rusak itu verifier, tautan, atau konfigurasi server.
  // (Tanpa email di log — cukup kode + pesan + status.)
  console.error('[auth] callback gagal', {
    code: error.code ?? null,
    status: error.status ?? null,
    message: error.message,
  });

  // Gagal karena verifier (bukan tautan tidak valid): langkah /verify
  // GoTrue SUDAH mengonfirmasi email sebelum mengeluarkan code, jadi
  // "Tautan tidak valid" menyesatkan. Arahkan sesuai alur:
  // - signup: email sudah terkonfirmasi -> masuk dengan kata sandi.
  // - reset (next=/atur-password): user tidak punya sesi untuk mengatur
  //   sandi baru -> minta tautan baru di /lupa-password.
  if (isVerifierError(error)) {
    if (next === '/atur-password') return redirect('/lupa-password?e=tautan', 303);
    return redirect('/masuk?e=terkonfirmasi', 303);
  }
  return redirect('/masuk?e=tautan', 303);
};
