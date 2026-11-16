import type { APIRoute } from 'astro';
import {
  cleanEmail,
  cleanName,
  isExampleDomain,
  signUpErrorCode,
  validPassword,
} from '../../lib/auth';
import { getSupabaseAdmin } from '../../lib/supabase';

// POST /auth/daftar  (nama, email, password)
export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
  const form = await request.formData();
  const rawEmail = form.get('email');
  const email = cleanEmail(rawEmail);
  const password = form.get('password');
  const nama = cleanName(form.get('nama'));

  // Pertahankan isian saat gagal (nama + email lewat query; sandi TIDAK
  // PERNAH dibawa di URL). Halaman /daftar membaca lagi param ini.
  const keep = `&nama=${encodeURIComponent(nama ?? '')}&email=${encodeURIComponent(
    email ?? (typeof rawEmail === 'string' ? rawEmail.trim() : ''),
  )}`;

  if (!email) {
    return redirect(`/daftar?e=${isExampleDomain(rawEmail) ? 'domain' : 'email'}${keep}`, 303);
  }
  if (!validPassword(password)) return redirect(`/daftar?e=sandi${keep}`, 303);

  const { data, error } = await locals.supabase.auth.signUp({
    email,
    password,
    options: {
      data: nama ? { nama } : {},
      emailRedirectTo: `${url.origin}/auth/callback`,
    },
  });
  if (error) {
    const code = signUpErrorCode(error);
    // JANGAN telan error: kode + pesan GoTrue adalah satu-satunya petunjuk
    // apakah yang rusak itu domain email, SMTP, atau konfigurasi server.
    // (Tanpa email/sandi di log — cukup kode + pesan + status.)
    console.error('[auth] daftar gagal', {
      code,
      status: error.status ?? null,
      message: error.message,
    });
    // Email yang sudah terdaftar dibalas SAMA seperti sukses (cek email),
    // tidak membocorkan akun.
    if (code === 'terdaftar') return redirect('/daftar?ok=cek-email', 303);
    return redirect(`/daftar?e=${code}${keep}`, 303);
  }

  // Baris profiles dibuat trigger on_auth_user_created — TAPI bila trigger
  // itu belum ada / gagal di database live, pastikan di sini lewat service
  // role (best-effort, tidak pernah menggagalkan signup: bila gagal, yang
  // rugi hanya pengaman ini — user auth sudah terbuat dan login tetap jalan).
  if (data.user) {
    try {
      const { error: profileError } = await getSupabaseAdmin()
        .from('profiles')
        .upsert(
          { id: data.user.id, email, nama: nama ?? null },
          { onConflict: 'id', ignoreDuplicates: true },
        );
      if (profileError) {
        console.warn('[auth] profil daftar tidak terbuat', { message: profileError.message });
      }
    } catch (e) {
      console.warn('[auth] profil daftar tidak terbuat', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Konfirmasi email nonaktif -> langsung login. Aktif -> minta cek email.
  // Email yang sudah terdaftar dibalas sama (cek email), tidak membocorkan akun.
  if (data.session) return redirect('/akun', 303);
  return redirect('/daftar?ok=cek-email', 303);
};
