import type { APIRoute } from 'astro';
import { cleanEmail, cleanName, validPassword } from '../../lib/auth';

// POST /auth/daftar  (nama, email, password)
export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
  const form = await request.formData();
  const email = cleanEmail(form.get('email'));
  const password = form.get('password');
  const nama = cleanName(form.get('nama'));

  if (!email) return redirect('/daftar?e=email', 303);
  if (!validPassword(password)) return redirect('/daftar?e=sandi', 303);

  const { data, error } = await locals.supabase.auth.signUp({
    email,
    password,
    options: {
      data: nama ? { nama } : {},
      emailRedirectTo: `${url.origin}/auth/callback`,
    },
  });
  if (error) return redirect('/daftar?e=gagal', 303);

  // Konfirmasi email nonaktif -> langsung login. Aktif -> minta cek email.
  // Email yang sudah terdaftar dibalas sama (cek email), tidak membocorkan akun.
  if (data.session) return redirect('/akun', 303);
  return redirect('/daftar?ok=cek-email', 303);
};
