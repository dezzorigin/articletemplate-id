import { optionalEnv } from './env';
import { getSupabaseAdmin } from './supabase';

// Satu pintu kirim email (WES-18). Provider: Brevo (bila BREVO_API_KEY terisi) atau Resend,
// keduanya lewat HTTP API. Ganti provider = ubah isi sendEmail() saja.
// Kegagalan kirim TIDAK boleh menggagalkan order.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailResult = { ok: true; id?: string } | { ok: false; reason: string };

const SITE = () => (optionalEnv('SITE_URL') ?? 'https://articletemplate.id').replace(/\/$/, '');

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const FROM_NAME = 'ArticleTemplate.id';

/**
 * Pilih provider dari env: BREVO_API_KEY terisi -> Brevo; selain itu Resend.
 * Pengirim (EMAIL_FROM) harus alamat yang sudah diverifikasi di provider itu
 * (Brevo: Senders & IP, verifikasi lewat email, tanpa DNS; Resend: domain terverifikasi).
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const from = optionalEnv('EMAIL_FROM');
  const brevoKey = optionalEnv('BREVO_API_KEY');
  if (brevoKey) {
    if (!from) return { ok: false, reason: 'EMAIL_FROM belum diisi' };
    return sendViaBrevo(brevoKey, from, msg);
  }
  return sendViaResend(from, msg);
}

async function sendViaBrevo(key: string, from: string, msg: EmailMessage): Promise<EmailResult> {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: from },
        to: [{ email: msg.to }],
        subject: msg.subject,
        htmlContent: msg.html,
        textContent: msg.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, reason: `Brevo ${res.status}: ${body?.code ?? ''} ${body?.message ?? 'gagal'}`.trim() };
    return { ok: true, id: body?.messageId };
  } catch (e: any) {
    return { ok: false, reason: `kirim email gagal: ${e?.message ?? e}` };
  }
}

async function sendViaResend(from: string | undefined, msg: EmailMessage): Promise<EmailResult> {
  const key = optionalEnv('RESEND_API_KEY');
  if (!key || !from) return { ok: false, reason: 'RESEND_API_KEY atau EMAIL_FROM belum diisi' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${FROM_NAME} <${from}>`,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, reason: `Resend ${res.status}: ${body?.message ?? 'gagal'}` };
    return { ok: true, id: body?.id };
  } catch (e: any) {
    return { ok: false, reason: `kirim email gagal: ${e?.message ?? e}` };
  }
}

/**
 * Email "pembayaran lunas + tautan unduhan" untuk satu order.
 * Dipakai saat order jadi lunas dan untuk kirim ulang (H6). Tidak pernah melempar error.
 */
export async function sendOrderPaidEmail(orderId: string): Promise<EmailResult> {
  try {
    const admin = getSupabaseAdmin();
    const { data: order } = await admin
      .from('orders')
      .select('id, user_id, total, status, order_items(product_id, products(judul))')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return { ok: false, reason: 'order tidak ditemukan' };
    if (order.status !== 'lunas') return { ok: false, reason: 'order belum lunas' };

    const { data: u } = await admin.auth.admin.getUserById(order.user_id as string);
    const to = u?.user?.email;
    if (!to) return { ok: false, reason: 'email pembeli tidak ditemukan' };

    const items = ((order as any).order_items ?? []).map((i: any) => ({
      judul: (i.products?.judul as string) ?? 'Template',
      url: `${SITE()}/unduh/${order.id}/${i.product_id}`,
    }));

    const listHtml = items
      .map((i: any) => `<li><a href="${esc(i.url)}">${esc(i.judul)}</a></li>`)
      .join('');
    const html =
      `<p>Terima kasih, pembayaran kamu sudah kami terima.</p>` +
      `<p>Unduh template kamu (perlu masuk ke akun yang sama):</p><ul>${listHtml}</ul>` +
      `<p>Riwayat order dan unduhan ada di <a href="${esc(SITE())}/akun">halaman akun</a>.</p>`;
    const text =
      `Terima kasih, pembayaran kamu sudah kami terima.\n\nUnduh template (masuk ke akun yang sama):\n` +
      items.map((i: any) => `- ${i.judul}: ${i.url}`).join('\n') +
      `\n\nRiwayat order: ${SITE()}/akun\n`;

    return await sendEmail({ to, subject: 'Pembayaran diterima, template siap diunduh', html, text });
  } catch (e: any) {
    return { ok: false, reason: `email order gagal: ${e?.message ?? e}` };
  }
}
