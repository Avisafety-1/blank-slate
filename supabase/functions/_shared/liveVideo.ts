// Felles hjelpere for live video (MediaMTX på Fly.io).

const encoder = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Token på formatet "<utløp>.<hmac>" signert over "<sti>:<utløp>". */
export async function signPlaybackToken(
  path: string,
  expiresAt: number,
  secret: string,
): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${path}:${expiresAt}`),
  );
  return `${expiresAt}.${toHex(sig)}`;
}

export async function verifyPlaybackToken(
  path: string,
  token: string,
  secret: string,
): Promise<boolean> {
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!exp || !sig) return false;
  if (exp * 1000 < Date.now()) return false;
  const expected = await signPlaybackToken(path, exp, secret);
  const given = `${exp}.${sig}`;
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0;
}

const KEY_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Strømnøkkel uten bindestrek – bindestrek skiller nøkkel fra etikett. */
export function generateStreamKey(length = 28): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  return out;
}

/** "live/<nøkkel>[-etikett]" -> { key, label } */
export function parseStreamPath(
  rawPath: string,
): { key: string; label: string | null } | null {
  const path = rawPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = path.split("/");
  if (parts.length !== 2 || parts[0] !== "live") return null;
  const [key, ...labelParts] = parts[1].split("-");
  if (!/^[a-z0-9]{16,64}$/.test(key)) return null;
  const label = labelParts.join("-").trim();
  return { key, label: label.length > 0 ? label.slice(0, 40) : null };
}

export function streamPathFor(key: string, label?: string | null): string {
  const clean = (label ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean ? `live/${key}-${clean}` : `live/${key}`;
}
