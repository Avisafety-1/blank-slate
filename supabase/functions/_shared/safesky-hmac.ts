/**
 * SafeSky HMAC-SHA256-V1 Authentication Module
 * 
 * Implements the HMAC signing protocol required by SafeSky's API.
 * Uses Deno's Web Crypto API (HKDF + HMAC via crypto.subtle).
 */

const encoder = new TextEncoder();

/** Base64url encode (no padding) */
function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 hash of a string, returned as lowercase hex */
async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Import API key as raw key material for HKDF */
async function importKeyMaterial(apiKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(apiKey),
    'HKDF',
    false,
    ['deriveBits']
  );
}

/** Derive KID (Key Identifier) from API key using HKDF-SHA256 */
export async function deriveKid(apiKey: string): Promise<string> {
  const keyMaterial = await importKeyMaterial(apiKey);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // empty salt (32 zero bytes)
      info: encoder.encode('safesky-kid'),
    },
    keyMaterial,
    256 // 32 bytes
  );
  return base64url(derived);
}

/** Derive HMAC signing key from API key using HKDF-SHA256 */
export async function deriveHmacKey(apiKey: string): Promise<CryptoKey> {
  const keyMaterial = await importKeyMaterial(apiKey);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: encoder.encode('safesky-hmac'),
    },
    keyMaterial,
    256
  );
  return crypto.subtle.importKey(
    'raw',
    derived,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/** Generate a UUID v4 nonce */
export function generateNonce(): string {
  return crypto.randomUUID();
}

/** Generate ISO8601 UTC timestamp */
export function generateTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Build the canonical request string for HMAC signature.
 */
export async function buildCanonicalRequest(
  method: string,
  path: string,
  queryString: string,
  host: string,
  timestamp: string,
  nonce: string,
  body: string
): Promise<string> {
  const bodyHash = await sha256Hex(body);
  return [
    method.toUpperCase(),
    path,
    queryString,
    `host:${host}`,
    `x-ss-date:${timestamp}`,
    `x-ss-nonce:${nonce}`,
    bodyHash,
  ].join('\n');
}

/** Generate HMAC-SHA256 signature as lowercase hex */
export async function generateSignature(
  canonicalRequest: string,
  hmacKey: CryptoKey
): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(canonicalRequest));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate all required HMAC authentication headers for a SafeSky API request.
 * 
 * @param apiKey - SafeSky API key (e.g., ssk_sandbox_... or ssk_live_...)
 * @param method - HTTP method (GET, POST, etc.)
 * @param url - Full request URL including protocol, host, path, and query string
 * @param body - Request body for POST/PUT requests (default: empty string)
 * @returns Object containing all required headers
 */
export async function generateAuthHeaders(
  apiKey: string,
  method: string,
  url: string,
  body: string = ''
): Promise<Record<string, string>> {
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const path = parsedUrl.pathname;
  const queryString = parsedUrl.search ? parsedUrl.search.substring(1) : '';

  const timestamp = generateTimestamp();
  const nonce = generateNonce();

  const [kid, hmacKey] = await Promise.all([
    deriveKid(apiKey),
    deriveHmacKey(apiKey),
  ]);

  const canonicalRequest = await buildCanonicalRequest(
    method, path, queryString, host, timestamp, nonce, body
  );

  const signature = await generateSignature(canonicalRequest, hmacKey);

  return {
    'Authorization': `SS-HMAC Credential=${kid}/v1, SignedHeaders=host;x-ss-date;x-ss-nonce, Signature=${signature}`,
    'X-SS-Date': timestamp,
    'X-SS-Nonce': nonce,
    'X-SS-Alg': 'SS-HMAC-SHA256-V1',
  };
}
