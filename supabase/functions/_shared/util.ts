// Shared utilities for FYXITERZ Supabase Edge Functions.
import { corsHeaders } from './cors.ts';

/** JSON response helper that always attaches the shared CORS headers. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function badRequest(msg = 'Bad request'): Response {
  return json({ error: msg }, 400);
}

export function unauthorized(msg = 'Unauthorized'): Response {
  return json({ error: msg }, 401);
}

export function forbidden(msg = 'Forbidden'): Response {
  return json({ error: msg }, 403);
}

export function notFound(msg = 'Not found'): Response {
  return json({ error: msg }, 404);
}

export function serverError(msg = 'Internal server error'): Response {
  return json({ error: msg }, 500);
}

/** Throws when a required environment variable is missing or blank. */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Parse a request body as JSON, returning null on empty or invalid input. */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text || text.trim() === '') return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Read a request body and return both its raw text and a parsed JSON object. */
export async function readBody(
  req: Request,
): Promise<{ raw: string; contentType: string; form: URLSearchParams | null; json: unknown }> {
  const contentType = req.headers.get('content-type') ?? '';
  const raw = await req.text();
  let form: URLSearchParams | null = null;
  let parsed: unknown = null;
  if (contentType.includes('application/x-www-form-urlencoded')) {
    form = new URLSearchParams(raw);
  } else {
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
  }
  return { raw, contentType, form, json: parsed };
}

/** Best-effort client IP extraction (works behind common proxies/CDNs). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

/** Round a monetary value to 2 decimal places. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Basic e-mail shape validation. */
export function isValidEmail(value: unknown): boolean {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Case-insensitive header lookup. */
export function header(req: Request, name: string): string {
  return req.headers.get(name) ?? req.headers.get(name.toLowerCase()) ?? '';
}

// --- Rate limiting -----------------------------------------------------------

/**
 * Best-effort in-memory rate limiter.
 *
 * Each Edge Function instance owns its own Map, so this only protects against
 * bursts that land on the same instance. It is NOT a distributed guarantee and
 * resets on cold starts. For production traffic, back this with a durable store
 * (Postgres table, Redis, Upstash, etc.).
 */
const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    buckets.set(key, hits);
    return { allowed: false, remaining: 0, retryAfter };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, remaining: limit - hits.length, retryAfter: 0 };
}

// --- Encoding helpers --------------------------------------------------------

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Convert a PEM (SPKI) public key into raw DER bytes. */
function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return fromBase64(body);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Signatures --------------------------------------------------------------

/** Compute a raw HMAC-SHA256 digest over the given body. */
export async function hmacSha256(body: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return new Uint8Array(mac);
}

/** Compute a hex-encoded HMAC-SHA256 digest. */
export async function hmacSha256Hex(body: string, secret: string): Promise<string> {
  return toHex(await hmacSha256(body, secret));
}

/** Compute a base64-encoded HMAC-SHA256 digest. */
export async function hmacSha256Base64(body: string, secret: string): Promise<string> {
  return toBase64(await hmacSha256(body, secret));
}

/**
 * Verify an HMAC-SHA256 signature over `rawBody` against `secret`.
 * Supports base64 or hex encoded signatures (defaults to hex).
 */
export async function verifyHmacSha256(
  rawBody: string,
  secret: string,
  signature: string,
  encoding: 'base64' | 'hex' = 'hex',
): Promise<boolean> {
  if (!signature) return false;
  const digest = await hmacSha256(rawBody, secret);
  const computed = encoding === 'base64' ? toBase64(digest) : toHex(digest);
  return timingSafeEqual(computed.toLowerCase(), signature.trim().toLowerCase());
}

/**
 * Verify an RSASSA-PKCS1-v1_5 (SHA-256) signature (e.g. Chip's X-Signature).
 * `publicKeyPem` is the PEM-encoded SPKI public key, `signatureBase64` the
 * base64 signature from the gateway.
 */
export async function verifyRsaSha256(
  rawBody: string,
  publicKeyPem: string,
  signatureBase64: string,
): Promise<boolean> {
  if (!publicKeyPem || !signatureBase64) return false;
  try {
    const key = await crypto.subtle.importKey(
      'spki',
      pemToDer(publicKeyPem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      fromBase64(signatureBase64),
      new TextEncoder().encode(rawBody),
    );
  } catch {
    return false;
  }
}

/** MD5 hex digest — required by some Malaysian gateways (e.g. ToyyibPay hash). */
export async function md5Hex(input: string): Promise<string> {
  const { crypto: stdCrypto } = await import('jsr:@std/crypto@1');
  const digest = await stdCrypto.subtle.digest('MD5', new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

/** Constant-time string comparison (exposed for gateway hash checks). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(a.toLowerCase(), b.toLowerCase());
}
