// Klien BorderPay (WES-17) — REST API + verifikasi webhook.
//
// DOKUMEN YANG DIPAKAI (16 Nov 2026):
// - https://borderpay.id/docs (ringkasan: 4 cara integrasi; istilah; status)
// - https://borderpay.id/blog/payment-link-vs-api (REST API: GET /payment-methods,
//   webhook payment.paid/expired/failed, idempotensi,
//   QRIS 60 menit, VA 24 jam, mode test/sandbox sejak hari pertama, KYC untuk live).
//   Blog menulis webhook "ditandatangani dengan HMAC" — tetapi pemilik akun
//   mengonfirmasi 16 Nov 2026 bahwa skema yang berlaku adalah token
//   (lihat asumsi A5): HMAC hanya legacy untuk integrasi lama.
// - Postingan resmi @borderid_ (Threads) yang menampilkan halaman docs "Buat
//   pembayaran": POST /api/v1/payments, parameter amount + method (wajib),
//   bank_code + reference_id (opsional), respons 201 dengan rincian fee, pay_url.
//
// YANG DITETAPKAN DOKUMEN: endpoint POST /api/v1/payments, parameter di atas,
// GET /payment-methods, event webhook, masa berlaku QRIS/VA, sandbox.
//
// ASUMSI (tidak tercantum di halaman docs yang bisa dibaca; HARUS dikonfirmasi
// dari halaman Referensi API / dashboard BorderPay sebelum go-live — lihat
// README.md bagian BorderPay):
// - A1 Base URL: diambil dari env BORDERPAY_BASE_URL, TANPA nilai default.
//   Host API tidak tertulis di halaman docs yang bisa diekstrak, jadi kode
//   TIDAK menebak host — aplikasi gagal jelas bila env ini kosong.
// - A2 Auth: header `Authorization: Bearer <key>` (key bp_test_/bp_live_).
// - A3 Nilai method: 'qris' dan 'va' (huruf kecil).
// - A4 Respons create-payment diparse defensif: pay_url dicari di beberapa
//   nama field yang umum; QR mentah / nomor VA ditampilkan bila ada, dan
//   pay_url selalu jadi jalan utama bayar (halaman bayar BorderPay).
// - A5 Verifikasi webhook (TERKONFIRMASI pemilik akun, 16 Nov 2026): cocokkan
//   header request `x-borderpay-token` dengan token verifikasi dari env
//   BORDERPAY_WEBHOOK_TOKEN; tidak cocok -> tolak 401. Verifikasi HMAC
//   hanya LEGACY untuk integrasi lama — sengaja TIDAK dipakai di sini.
// - A6 Fee TIDAK ditambahkan ke tagihan (ditanggung penjual) sampai tim
//   memutuskan; fee dari respons API dicatat bila ada, hanya untuk rekonsiliasi.
// - A7 bank_code TIDAK dikirim (opsional menurut docs) — bank VA dipilih
//   BorderPay; bila dashboard mengharuskan bank tertentu, isi dari sana.
// - A8 Mode test vs live dipilih oleh key-nya sendiri (bp_test_ vs bp_live_);
//   bila dashboard menyediakan host sandbox terpisah, isi BORDERPAY_BASE_URL
//   dengan host itu.
//
// KEAMANAN: key + token webhook HANYA dari env (server). Tidak ada nilai
// rahasia di file ini. Webhook yang token-nya tidak cocok DITOLAK —
// tidak ada order yang ditandai lunas dari webhook tak terverifikasi.

import { timingSafeEqual } from 'node:crypto';
import { optionalEnv } from './env';
import type { FinalResult, Metode } from './payments';

export type BorderPayMethod = 'qris' | 'va';

/** Masa berlaku kode bayar menurut dokumen BorderPay. */
export const QRIS_TTL_MS = 60 * 60 * 1000;
export const VA_TTL_MS = 24 * 60 * 60 * 1000;

export interface BorderPayConfig {
  apiKey: string;
  baseUrl: string;
  /** Token verifikasi webhook (env BORDERPAY_WEBHOOK_TOKEN). */
  webhookToken: string | undefined;
}

/** Konfigurasi dari env. Base URL TIDAK punya default (asumsi A1). */
export function getBorderPayConfig(): BorderPayConfig {
  return {
    apiKey: optionalEnv('BORDERPAY_API_KEY') ?? '',
    baseUrl: (optionalEnv('BORDERPAY_BASE_URL') ?? '').replace(/\/+$/, ''),
    webhookToken: optionalEnv('BORDERPAY_WEBHOOK_TOKEN'),
  };
}

/** BorderPay aktif bila key + base URL terisi. Tanpa keduanya, checkout tetap jalan tanpa tombol bayar. */
export function isBorderPayEnabled(): boolean {
  const c = getBorderPayConfig();
  return c.apiKey !== '' && c.baseUrl !== '';
}

export class BorderPayError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'BorderPayError';
    this.status = status;
  }
}

export interface BorderPayPayment {
  /** ID pembayaran di BorderPay (disimpan ke payments.borderpay_ref). */
  id: string;
  /** Halaman bayar BorderPay — jalan utama pembeli membayar. */
  payUrl: string;
  /** Isi QR mentah (bila API mengembalikannya). */
  qrContent: string | undefined;
  /** Nomor Virtual Account (bila API mengembalikannya). */
  vaNumber: string | undefined;
  /** Kedaluwarsa kode bayar (dari API, atau dihitung dari TTL dokumen). */
  expiresAt: string;
  /** Fee dari respons API (bila ada) — hanya catatan, bukan tambahan tagihan (asumsi A6). */
  fee: number | undefined;
}

export interface CreatePaymentInput {
  /** Total tagihan, rupiah utuh (sudah dibulatkan). */
  amount: number;
  method: BorderPayMethod;
  /** ID order kita — dipakai sebagai reference_id + Idempotency-Key. */
  referenceId: string;
}

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

const asNonEmptyString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined;

const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Bentuk request create-payment — diekspor agar bisa diuji tanpa jaringan. */
export function buildCreatePaymentRequest(
  config: BorderPayConfig,
  input: CreatePaymentInput,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  if (!config.apiKey) throw new BorderPayError('BORDERPAY_API_KEY belum diisi', 0);
  if (!config.baseUrl) throw new BorderPayError('BORDERPAY_BASE_URL belum diisi', 0);
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new BorderPayError('amount harus rupiah utuh > 0', 0);
  }
  if (!input.referenceId) throw new BorderPayError('referenceId wajib diisi', 0);
  return {
    url: `${config.baseUrl}/api/v1/payments`,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      // Idempotency-Key = order id: pengulangan request yang sama (retry
      // setelah timeout, tombol bayar ditekan dua kali) tidak membuat
      // tagihan ganda di BorderPay.
      'Idempotency-Key': input.referenceId,
    },
    body: {
      amount: input.amount,
      method: input.method,
      reference_id: input.referenceId,
    },
  };
}

/** Parse respons create-payment secara defensif (asumsi A4). */
export function parseCreatePaymentResponse(json: unknown, method: BorderPayMethod): BorderPayPayment {
  const root = asRecord(json);
  const data = asRecord(root.data ?? root);
  const id = asNonEmptyString(data.id ?? data.payment_id ?? data.reference_id ?? root.id);
  const payUrl = asNonEmptyString(
    data.pay_url ?? data.checkout_url ?? data.payment_url ?? data.url ?? root.pay_url,
  );
  if (!id) throw new BorderPayError('respons BorderPay tanpa id pembayaran', 0);
  if (!payUrl) throw new BorderPayError('respons BorderPay tanpa pay_url', 0);
  const expiresRaw = asNonEmptyString(data.expires_at ?? data.expired_at ?? data.expiresAt);
  const ttl = method === 'qris' ? QRIS_TTL_MS : VA_TTL_MS;
  const expiresAt = expiresRaw ?? new Date(Date.now() + ttl).toISOString();
  return {
    id,
    payUrl,
    qrContent: asNonEmptyString(data.qr_content ?? data.qr_string ?? data.qr_code ?? data.qr),
    vaNumber: asNonEmptyString(
      data.va_number ?? data.account_number ?? data.virtual_account_number ?? data.virtual_account ?? data.va_no,
    ),
    expiresAt,
    fee: asNumber(data.fee ?? data.fee_amount ?? data.total_fee),
  };
}

/** Buat pembayaran BorderPay (QRIS / VA). Dipanggil hanya dari server. */
export async function createBorderPayPayment(
  input: CreatePaymentInput,
  config: BorderPayConfig = getBorderPayConfig(),
): Promise<BorderPayPayment> {
  const req = buildCreatePaymentRequest(config, input);
  let res: Response;
  try {
    res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new BorderPayError(`tidak bisa menghubungi BorderPay: ${(e as Error).message}`, 0);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = asNonEmptyString(asRecord(json).message ?? asRecord(json).error) ?? `HTTP ${res.status}`;
    throw new BorderPayError(`BorderPay menolak pembuatan pembayaran: ${msg}`, res.status);
  }
  return parseCreatePaymentResponse(json, input.method);
}

/** Daftar metode dari GET /payment-methods (discovery, sesuai blog BorderPay). Dipakai untuk memvalidasi pilihan metode; gagal = pakai QRIS/VA bawaan. */
export async function listBorderPayMethods(
  config: BorderPayConfig = getBorderPayConfig(),
): Promise<string[]> {
  if (!config.apiKey || !config.baseUrl) return [];
  try {
    const res = await fetch(`${config.baseUrl}/payment-methods`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const json: unknown = await res.json();
    const root = asRecord(json);
    const list = Array.isArray(root.data) ? root.data : Array.isArray(json) ? json : [];
    return (list as unknown[])
      .map((m) => asNonEmptyString(asRecord(m).code ?? asRecord(m).method ?? asRecord(m).id ?? m))
      .filter((s): s is string => !!s)
      .map((s) => s.toLowerCase());
  } catch {
    return [];
  }
}

// ---------- webhook: verifikasi token (skema terkonfirmasi, asumsi A5) ----------

/**
 * Verifikasi webhook BorderPay: header `x-borderpay-token` harus sama
 * persis dengan token dari env BORDERPAY_WEBHOOK_TOKEN. FAIL-CLOSED: tanpa
 * token di header, tanpa token di env, atau tidak cocok -> false.
 * Perbandingan constant-time (timingSafeEqual) agar tidak bocor lewat
 * timing. Catatan: verifikasi HMAC hanya LEGACY untuk integrasi lama dan
 * sengaja tidak dipakai di sini.
 */
export function verifyBorderPayToken(input: { tokenHeader: string | null; token: string | undefined }): boolean {
  const { tokenHeader, token } = input;
  if (!token || !tokenHeader) return false;
  const given = tokenHeader.trim();
  if (given === '') return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(token, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------- webhook: pemetaan event -> status order ----------

/** Petakan event BorderPay ke status akhir order. null = event tidak dikenal (diabaikan). */
export function mapBorderPayEvent(event: string): FinalResult | null {
  switch (event) {
    case 'payment.paid':
      return 'lunas';
    case 'payment.expired':
      return 'kedaluwarsa';
    case 'payment.failed':
      return 'gagal';
    default:
      return null;
  }
}

/** Metode tampilan ('QRIS' | 'VA') -> nilai method API BorderPay. */
export function toBorderPayMethod(metode: Metode): BorderPayMethod {
  return metode === 'QRIS' ? 'qris' : 'va';
}
