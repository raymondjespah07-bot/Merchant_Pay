import crypto from 'node:crypto';

const API_BASE = (process.env.PAYTOTA_API_BASE_URL || 'https://paygateway.paytota.com').replace(/\/$/, '');

export type PaytotaResponse = Record<string, any>;

function secretKey() {
  const value = process.env.PAYTOTA_SECRET_KEY;
  if (!value) throw new Error('Paytota secret key is not configured.');
  return value;
}

function brandId() {
  const value = process.env.PAYTOTA_BRAND_ID;
  if (!value) throw new Error('Paytota brand ID is not configured.');
  return value;
}

export function normalizeUgandaPhone(input: string): string {
  const raw = String(input ?? '').trim().replace(/[^0-9+]/g, '');
  if (raw.startsWith('+256')) return `256${raw.slice(4)}`;
  if (raw.startsWith('256')) return raw;
  if (raw.startsWith('0')) return `256${raw.slice(1)}`;
  return raw;
}

export type PaytotaNetwork = 'airtel' | 'mtnmomo';

export function normalizePaytotaNetwork(input: string): PaytotaNetwork {
  const value = String(input || '').trim().toUpperCase();
  if (value === 'AIRTEL' || value === 'AIRTEL_MONEY') return 'airtel';
  if (value === 'MTN' || value === 'MTN_MOBILE_MONEY' || value === 'MTNMOMO') return 'mtnmomo';
  throw new Error('A valid Paytota mobile money network is required.');
}

export function formatPaytotaPayoutPhone(phone: string, network: PaytotaNetwork): string {
  const normalized = normalizeUgandaPhone(phone);
  if (!/^2567\d{8}$/.test(normalized)) throw new Error('Enter a valid Ugandan mobile money number.');
  return network === 'airtel' ? normalized.slice(3) : normalized;
}

async function request(path: string, init: RequestInit = {}): Promise<PaytotaResponse> {
  const response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await response.text();
  let data: PaytotaResponse = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`Paytota returned an invalid response (${response.status}).`); }
  if (!response.ok) {
    const message = data?.error?.message || data?.detail || data?.message || `Paytota HTTP ${response.status}.`;
    throw new Error(String(message));
  }
  return data;
}

export async function createPurchase(input: { amount: string; phone: string; reference: string; currency: string; description: string }) {
  return request('/api/v1/purchases/', {
    method: 'POST',
    body: JSON.stringify({
      client: { phone: normalizeUgandaPhone(input.phone), country: 'UG' },
      purchase: { currency: input.currency, products: [{ name: input.description.slice(0, 120), price: input.amount }] },
      reference: input.reference,
      skip_capture: false,
      brand_id: brandId(),
      payment_method_whitelist: ['airtel', 'mtnmomo'],
    }),
  });
}

export async function executePurchase(input: { id: string; phone: string }) {
  const form = new FormData();
  form.set('s2s', 'true');
  form.set('pm', 'paytota_proxy');
  form.set('phone', normalizeUgandaPhone(input.phone));
  return request(`/p/${encodeURIComponent(input.id)}/`, { method: 'POST', body: form });
}

export async function getPurchaseStatus(id: string) {
  return request(`/api/v1/purchases/${encodeURIComponent(id)}/`, { method: 'GET' });
}

export async function createPayout(input: { amount: string; phone: string; network: PaytotaNetwork; reference: string; currency: string; reason: string }) {
  return request('/api/v1/payouts/', {
    method: 'POST',
    body: JSON.stringify({
      client: { phone: formatPaytotaPayoutPhone(input.phone, input.network), country: 'UG' },
      payment: { currency: input.currency, amount: input.amount, description: input.reason.slice(0, 120) },
      reference: input.reference,
      brand_id: brandId(),
    }),
  });
}

export async function executePayout(input: { executionUrl: string }) {
  return request(input.executionUrl.replace(/^https?:\/\/[^/]+/i, ''), { method: 'POST', body: JSON.stringify({}) });
}

export async function getPayoutStatus(id: string) {
  return request(`/api/v1/payouts/${encodeURIComponent(id)}/`, { method: 'GET' });
}

export async function getAccountBalance() {
  return request('/api/v1/account/json/balance/', { method: 'GET' });
}

export function verifyPaytotaWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const publicKey = process.env.PAYTOTA_WEBHOOK_PUBLIC_KEY?.replace(/\\n/g, '\n');
  if (!publicKey) throw new Error('Paytota webhook public key is not configured.');
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

export function paytotaWebhookSignature(rawBody: string, privateKey: crypto.KeyObject | string) {
  return crypto.createSign('RSA-SHA256').update(rawBody).end().sign(privateKey).toString('base64');
}
