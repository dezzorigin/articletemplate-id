// Klien BorderPay (WES-17) — REST API + verifikasi webhook.
//
// FAKTA TERKONFIRMASI dari Referensi API resmi (dibaca penuh 16 Nov 2026):
// https://borderpay.id/api-reference (Scalar UI, OpenAPI 3.1.0)
// - Base URL SATU saja: https://borderpay.id/api/v1 (tidak ada host sandbox
//   terpisah). Mode ditentukan prefix key: bp_live_ = live, bp_test_ = test.
// - Auth: header `Authorization: Bearer <key>`.
// - POST /api/v1/payments (body JSON): amount integer (SATU-SATUNYA field
//   required); method enum persis "qris" / "va" / "ewallet" (tanpa method =
//   checkout session, pembeli pilih metode); bank_code string max 16, WAJIB
//   untuk method va/ewallet (mis. BCA, BNI, DANA); reference_id string max 64
//   — kirim SELALU (idempotensi; request ulang dengan reference_id sama
//   mengembalikan resource yang sama, reused=true); return_url string opsional
//   (URL https toko, customer diarahkan ke sini setelah bayar); fee_borne_by
//   enum merchant/customer tapi DEPRECATED (biaya diatur per-project di
//   dashboard — kode TIDAK mengatur fee). Respons: 201 created; 200 idempotent
//   reused=true; 400/401/403/409 (already_paid, reference_mode_mismatch)/
//   422/429. Rate limit 120 request/60 detik per key.
// - Field respons Payment (201): type (charge/session), id, reference_id,
//   status (pending/paid/expired/failed/refunded), mode (test/live), amount,
//   customer_pays, merchant_receives, fee, fee_borne_by, pay_url (halaman
//   pembayaran BorderPay), checkout_url (string|null), qr_string (string|null,
//   untuk qris), va_number (string|null, untuk va), va_bank (string|null),
//   expires_at (string|null, RFC 3339), return_url, reused.
// - GET /payment-methods (butuh auth): {qris: {enabled, fee {fixed, percent}},
//   va: {enabled, fee, banks: [{code, name, enabled, fee}]}, ewallet: {...}}.
//   Contoh fee: qris 0.7%, VA BCA fixed 4000.
// - Webhook: event payment.paid/expired/failed; verifikasi HANYA pencocokan
//   token timing-safe header x-borderpay-token (TIDAK ADA HMAC); header lain
//   x-borderpay-event, x-borderpay-mode (test/live); balas 2xx untuk ACK.
//   Payload: {event, mode, data: {slug, mode, reference_id, order_id, status,
//   amount, fee, merchant_receives, method}}.
// - Durasi kedaluwarsa QRIS/VA TIDAK DITULIS di referensi — kode TIDAK
//   mengasumsikan durasi apa pun; masa berlaku SELALU dibaca dari expires_at
//   tiap respons pembayaran (bila null, tidak ada klaim masa berlaku).
// - Endpoint lain: GET /payments (50 terakhir), GET /payments/{reference},
//   POST /payments/{reference}/cancel (menandai expired, hanya saat pending),
//   POST /payments/{reference}/simulate (menandai test payment sebagai paid —
//   HANYA mode test), GET /balance.
//
// KEAMANAN: key + token webhook HANYA dari env (server). Tidak ada nilai
// rahasia di file ini. Webhook yang token-nya tidak cocok DITOLAK —
// tidak ada order yang ditandai lunas dari webhook tak terverifikasi.

import { timingSafeEqual } from 'node:crypto';
import { optionalEnv } from './env';
import type { FinalResult, Metode } from './payments';

export type BorderPayMethod = 'qris' | 'va' | 'ewallet';

/** Root API BorderPay (terkonfirmasi dari Referensi API). Host publik, bukan rahasia. */
export const BORDERPAY_API_ROOT = 'https://borderpay.id/api/v1';

/** Bank VA bila discovery tidak menjawab (daftar umum; API adalah sumber utama). */
export const FALLBACK_VA_BANKS: { code: string; name: string }[] = [
  { code: 'BCA', name: 'BCA' },
  { code: 'BNI', name: 'BNI' },
  { code: 'BRI', name: 'BRI' },
  { code: 'MANDIRI', name: 'Mandiri' },
  { code: 'PERMATA', name: 'Permata' },
  { code: 'CIMB', name: 'CIMB Niaga' },
];

/** Penyedia e-wallet bila discovery tidak menjawab (daftar umum; API adalah sumber utama). */
export const FALLBACK_EWALLET_PROVIDERS: { code: string; name: string }[] = [
  { code: 'DANA', name: 'DANA' },
  { code: 'OVO', name: 'OVO' },
  { code: 'GOPAY', name: 'GoPay' },
  { code: 'SHOPEEPAY', name: 'ShopeePay' },
];

export interface BorderPayConfig {
  apiKey: string;
  baseUrl: string;
  /** Token verifikasi webhook (env BORDERPAY_WEBHOOK_TOKEN). */
  webhookToken: string | undefined;
}

/**
 * Normalisasi root API: buang trailing slash; bila belum berakhiran
 * `/api/v1`, tambahkan — supaya nilai env `https://borderpay.id` maupun
 * `https://borderpay.id/api/v1` sama-sama benar.
 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, '');
  if (trimmed === '') return BORDERPAY_API_ROOT;
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

/** Konfigurasi dari env. Base URL punya default (host publik terkonfirmasi). */
export function getBorderPayConfig(): BorderPayConfig {
  return {
    apiKey: optionalEnv('BORDERPAY_API_KEY') ?? '',
    baseUrl: normalizeBaseUrl(optionalEnv('BORDERPAY_BASE_URL') ?? ''),
    webhookToken: optionalEnv('BORDERPAY_WEBHOOK_TOKEN'),
  };
}

/** BorderPay aktif bila key terisi (base URL selalu ada via default). */
export function isBorderPayEnabled(): boolean {
  const c = getBorderPayConfig();
  return c.apiKey !== '';
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
  /** URL checkout session (bila ada; untuk type=session). */
  checkoutUrl: string | undefined;
  /** Isi QR mentah (field resmi `qr_string`, untuk qris). */
  qrString: string | undefined;
  /** Nomor Virtual Account (field resmi `va_number`, untuk va). */
  vaNumber: string | undefined;
  /** Bank VA (field resmi `va_bank`). */
  vaBank: string | undefined;
  /** Kedaluwarsa kode bayar — SELALU dari `expires_at` respons API; undefined bila API tidak memberikannya (tidak ada durasi asumsi). */
  expiresAt: string | undefined;
  /** Fee dari respons API (bila ada) — hanya catatan rekonsiliasi; biaya diatur di dashboard, bukan di kode. */
  fee: number | undefined;
  /** Yang dibayar customer (field resmi `customer_pays`). */
  customerPays: number | undefined;
  /** Yang diterima merchant (field resmi `merchant_receives`). */
  merchantReceives: number | undefined;
  /** Mode pembayaran (field resmi `mode`: test/live). */
  mode: string | undefined;
  /** true bila respons ini hasil idempotensi (request ulang reference_id sama). */
  reused: boolean;
}

export interface CreatePaymentInput {
  /** Total tagihan, rupiah utuh (sudah dibulatkan). */
  amount: number;
  method: BorderPayMethod;
  /** ID order kita — dipakai sebagai reference_id + Idempotency-Key. */
  referenceId: string;
  /** WAJIB untuk method va/ewallet (Referensi API); diabaikan untuk qris. */
  bankCode?: string;
  /** URL kembali setelah bayar (halaman status order). */
  returnUrl: string;
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
  if (!input.returnUrl) throw new BorderPayError('returnUrl wajib diisi', 0);
  const needsBank = input.method === 'va' || input.method === 'ewallet';
  const bankCode = input.bankCode?.trim().toUpperCase();
  if (needsBank && !bankCode) {
    throw new BorderPayError(`bank_code wajib untuk method ${input.method}`, 0);
  }
  const body: Record<string, unknown> = {
    amount: input.amount,
    method: input.method,
    reference_id: input.referenceId,
    return_url: input.returnUrl,
  };
  if (bankCode) body.bank_code = bankCode;
  return {
    url: `${config.baseUrl}/payments`,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      // Idempotency-Key = order id: pengulangan request yang sama (retry
      // setelah timeout, tombol bayar ditekan dua kali) tidak membuat
      // tagihan ganda di BorderPay.
      'Idempotency-Key': input.referenceId,
    },
    body,
  };
}

/** Parse respons create-payment — field persis Referensi API (defensif seperlunya). */
export function parseCreatePaymentResponse(json: unknown): BorderPayPayment {
  const root = asRecord(json);
  const data = asRecord(root.data ?? root);
  const id = asNonEmptyString(data.id ?? data.payment_id ?? root.id);
  const payUrl = asNonEmptyString(data.pay_url ?? data.checkout_url ?? root.pay_url);
  if (!id) throw new BorderPayError('respons BorderPay tanpa id pembayaran', 0);
  if (!payUrl) throw new BorderPayError('respons BorderPay tanpa pay_url', 0);
  // expires_at: pakai apa adanya dari API; bila null/tidak ada, undefined —
  // TIDAK dihitung dari durasi asumsi (durasi tidak ditulis di referensi).
  return {
    id,
    payUrl,
    checkoutUrl: asNonEmptyString(data.checkout_url),
    qrString: asNonEmptyString(data.qr_string ?? data.qr_content ?? data.qr_code ?? data.qr),
    vaNumber: asNonEmptyString(
      data.va_number ?? data.account_number ?? data.virtual_account_number ?? data.virtual_account ?? data.va_no,
    ),
    vaBank: asNonEmptyString(data.va_bank),
    expiresAt: asNonEmptyString(data.expires_at ?? data.expired_at ?? data.expiresAt),
    fee: asNumber(data.fee ?? data.fee_amount ?? data.total_fee),
    customerPays: asNumber(data.customer_pays),
    merchantReceives: asNumber(data.merchant_receives),
    mode: asNonEmptyString(data.mode),
    reused: data.reused === true,
  };
}

/** Buat pembayaran BorderPay (QRIS / VA / E-Wallet). Dipanggil hanya dari server. */
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
  return parseCreatePaymentResponse(json);
}

// ---------- discovery metode: GET /payment-methods ----------

export interface BankInfo {
  code: string;
  name: string;
}

export interface BorderPayMethodInfo {
  qrisEnabled: boolean;
  /** Bank VA yang aktif (hanya yang enabled). Kosong bila discovery gagal. */
  vaBanks: BankInfo[];
  /** Penyedia e-wallet yang aktif (hanya yang enabled). Kosong bila discovery gagal. */
  ewalletBanks: BankInfo[];
}

/** Parse GET /payment-methods — bentuk persis Referensi API. Diekspor agar bisa diuji tanpa jaringan. */
export function parsePaymentMethods(json: unknown): BorderPayMethodInfo {
  const root = asRecord(json);
  const data = asRecord(root.data ?? root);
  const parseBanks = (section: unknown): BankInfo[] => {
    const banks = asRecord(section).banks;
    if (!Array.isArray(banks)) return [];
    const out: BankInfo[] = [];
    for (const b of banks) {
      const rec = asRecord(b);
      const code = asNonEmptyString(rec.code);
      if (!code) continue;
      if (rec.enabled === false) continue;
      out.push({ code: code.toUpperCase(), name: asNonEmptyString(rec.name) ?? code });
    }
    return out;
  };
  const qrisEnabled = asRecord(data.qris).enabled !== false;
  return {
    qrisEnabled,
    vaBanks: parseBanks(data.va),
    ewalletBanks: parseBanks(data.ewallet),
  };
}

/**
 * Daftar metode dari GET /payment-methods (Referensi API).
 * Gagal (tanpa key, timeout, respons tak dikenal) -> qris dianggap aktif dan
 * daftar bank kosong — pemanggil memakai daftar fallback (FALLBACK_*).
 */
export async function listBorderPayMethods(
  config: BorderPayConfig = getBorderPayConfig(),
): Promise<BorderPayMethodInfo> {
  const empty: BorderPayMethodInfo = { qrisEnabled: true, vaBanks: [], ewalletBanks: [] };
  if (!config.apiKey || !config.baseUrl) return empty;
  try {
    const res = await fetch(`${config.baseUrl}/payment-methods`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return empty;
    const json: unknown = await res.json();
    return parsePaymentMethods(json);
  } catch {
    return empty;
  }
}

// ---------- cancel + simulate: POST /payments/{reference}/... ----------

/** Bentuk request cancel/simulate — diekspor agar bisa diuji tanpa jaringan. */
export function buildPaymentActionRequest(
  config: BorderPayConfig,
  referenceId: string,
  action: 'cancel' | 'simulate',
): { url: string; headers: Record<string, string> } {
  if (!config.apiKey) throw new BorderPayError('BORDERPAY_API_KEY belum diisi', 0);
  if (!config.baseUrl) throw new BorderPayError('BORDERPAY_BASE_URL belum diisi', 0);
  if (!referenceId) throw new BorderPayError('referenceId wajib diisi', 0);
  return {
    url: `${config.baseUrl}/payments/${encodeURIComponent(referenceId)}/${action}`,
    headers: { Authorization: `Bearer ${config.apiKey}` },
  };
}

/**
 * Batalkan pembayaran (menandai expired, hanya saat pending).
 * Dipakai admin/manual — belum ada UI-nya; fungsi ini disiapkan untuk itu.
 */
export async function cancelBorderPayPayment(
  referenceId: string,
  config: BorderPayConfig = getBorderPayConfig(),
): Promise<BorderPayPayment> {
  const req = buildPaymentActionRequest(config, referenceId, 'cancel');
  const res = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    signal: AbortSignal.timeout(15_000),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = asNonEmptyString(asRecord(json).message ?? asRecord(json).error) ?? `HTTP ${res.status}`;
    throw new BorderPayError(`BorderPay menolak pembatalan: ${msg}`, res.status);
  }
  return parseCreatePaymentResponse(json);
}

/**
 * Tandai test payment sebagai paid — HANYA mode test (Referensi API).
 * Dipakai untuk uji end-to-end tanpa uang sungguhan; di live API menolak.
 */
export async function simulateBorderPayPayment(
  referenceId: string,
  config: BorderPayConfig = getBorderPayConfig(),
): Promise<BorderPayPayment> {
  const req = buildPaymentActionRequest(config, referenceId, 'simulate');
  const res = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    signal: AbortSignal.timeout(15_000),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = asNonEmptyString(asRecord(json).message ?? asRecord(json).error) ?? `HTTP ${res.status}`;
    throw new BorderPayError(`BorderPay menolak simulasi: ${msg}`, res.status);
  }
  return parseCreatePaymentResponse(json);
}

// ---------- webhook: verifikasi token (skema terkonfirmasi, Referensi API) ----------

/**
 * Verifikasi webhook BorderPay: header `x-borderpay-token` harus sama
 * persis dengan token dari env BORDERPAY_WEBHOOK_TOKEN. FAIL-CLOSED: tanpa
 * token di header, tanpa token di env, atau tidak cocok -> false.
 * Perbandingan constant-time (timingSafeEqual) agar tidak bocor lewat
 * timing. Catatan: TIDAK ADA verifikasi HMAC di Referensi API — HMAC hanya
 * LEGACY untuk integrasi lama dan sengaja tidak dipakai di sini.
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

/** Metode tampilan ('QRIS' | 'VA' | 'EWALLET') -> nilai method API BorderPay. */
export function toBorderPayMethod(metode: Metode): BorderPayMethod {
  if (metode === 'QRIS') return 'qris';
  if (metode === 'VA') return 'va';
  return 'ewallet';
}
