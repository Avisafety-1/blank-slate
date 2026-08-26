// Shared DroneLog key resolution + DJI login caching.
//
// Goal: drastically reduce the number of calls to DroneLog `/accounts/dji`.
// Every login burns from a rate-limit pool that is shared between users
// (many companies share the same API key, and all our calls leave from the
// same Supabase egress IPs). Two mechanisms:
//
//   1. Account caching — when `dji_credentials.dji_account_id` is known we
//      skip the login entirely and go straight to `/logs/{accountId}`.
//      A login only happens when the account id is missing or the list call
//      answers 401/403.
//   2. Per-user DroneLog API keys — lazily provisioned via `POST /keys`
//      using the master key, stored encrypted on `dji_credentials`.
//      Resolution order: user key -> company key -> global key.

import { DRONELOG_BASE, TIMEOUTS, withTimeout } from "./dji-parser.ts";

export type KeySource = "user" | "company" | "global";

export interface ResolvedKey {
  key: string;
  source: KeySource;
  fingerprint: string;
  provisioningError?: string;
}

// ── Encryption (same AES-GCM scheme used for the DJI password) ──

async function cryptoKey(): Promise<CryptoKey> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(serviceKey.slice(0, 32)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), new TextEncoder().encode(plaintext)),
  );
  const buf = new Uint8Array(iv.length + ct.length);
  buf.set(iv);
  buf.set(ct, iv.length);
  return btoa(String.fromCharCode(...buf));
}

export async function decryptSecret(stored: string): Promise<string> {
  const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await cryptoKey(), ct);
  return new TextDecoder().decode(plain);
}

function fp(key: string): string {
  return key.substring(0, 6) + "…";
}

// ── Key resolution ──

/**
 * Resolve the DroneLog API key to use for a given user/company.
 *
 * Order: the user's own key -> the company key -> the global Avisafe key.
 * When `provision` is true and the user has no key yet, a new key is created
 * via DroneLog `POST /keys` and stored encrypted on `dji_credentials`.
 * Provisioning never blocks the caller: on any failure we fall back silently.
 */
export async function resolveDronelogKey(
  serviceClient: any,
  opts: { userId?: string | null; companyId?: string | null; provision?: boolean },
): Promise<ResolvedKey | null> {
  const globalKey = Deno.env.get("DRONELOG_AVISAFE_KEY") || null;

  let companyId = opts.companyId ?? null;
  let credRow: { dronelog_api_key_encrypted: string | null; dji_email: string | null; company_id: string | null } | null = null;

  if (opts.userId) {
    const { data } = await serviceClient
      .from("dji_credentials")
      .select("dronelog_api_key_encrypted, dji_email, company_id")
      .eq("user_id", opts.userId)
      .maybeSingle();
    credRow = data ?? null;
    if (!companyId) companyId = credRow?.company_id ?? null;

    if (credRow?.dronelog_api_key_encrypted) {
      try {
        const key = await decryptSecret(credRow.dronelog_api_key_encrypted);
        if (key) return { key, source: "user", fingerprint: fp(key) };
      } catch (e) {
        console.warn("[dronelog-auth] could not decrypt user key:", (e as Error).message);
      }
    }
  }

  let companyKey: string | null = null;
  let companyName = "Avisafe";
  let provisioningError: string | undefined;
  if (companyId) {
    const { data: company } = await serviceClient
      .from("companies")
      .select("navn, dronelog_api_key")
      .eq("id", companyId)
      .maybeSingle();
    companyKey = company?.dronelog_api_key || null;
    companyName = company?.navn ?? companyName;
  }

  // Provision independently of company lookup. The global key is the master
  // credential used only to mint a personal key, never preferred for normal calls.
  if (opts.provision && opts.userId && credRow && !credRow.dronelog_api_key_encrypted && globalKey) {
    const provisioned = await provisionUserKey(serviceClient, {
      userId: opts.userId,
      masterKey: globalKey,
      name: `${companyName} – ${credRow.dji_email ?? opts.userId}`,
    });
    if (provisioned.key) {
      return { key: provisioned.key, source: "user", fingerprint: fp(provisioned.key) };
    }
    provisioningError = provisioned.error;
  }

  if (companyKey) return { key: companyKey, source: "company", fingerprint: fp(companyKey), provisioningError };
  if (globalKey) return { key: globalKey, source: "global", fingerprint: fp(globalKey), provisioningError };
  return null;
}

export interface ProvisionUserKeyResult {
  key: string | null;
  status: number | null;
  error?: string;
}

/** Create and persist a personal DroneLog key. Never logs response bodies or key material. */
export async function provisionUserKey(
  serviceClient: any,
  opts: { userId: string; masterKey: string; name: string },
): Promise<ProvisionUserKeyResult> {
  try {
    const res = await fetch(`${DRONELOG_BASE}/keys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.masterKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name: opts.name.slice(0, 120) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = res.status === 401 || res.status === 403
        ? "master_key_invalid"
        : `provision_http_${res.status}`;
      console.warn(`[dronelog-auth] provision failed status=${res.status} reason=${error}`);
      return { key: null, status: res.status, error };
    }
    const newKey = data?.result?.key
      || data?.key
      || data?.result?.api_key
      || data?.api_key
      || data?.result?.apiKey
      || data?.apiKey
      || data?.data?.key
      || data?.data?.api_key
      || data?.data?.apiKey;
    if (!newKey || typeof newKey !== "string") {
      console.warn("[dronelog-auth] provision failed status=200 reason=missing_key_field");
      return { key: null, status: res.status, error: "missing_key_field" };
    }
    const encrypted = await encryptSecret(newKey);
    const { data: saved, error: saveError } = await serviceClient
      .from("dji_credentials")
      .update({
        dronelog_api_key_encrypted: encrypted,
        dronelog_key_created_at: new Date().toISOString(),
      })
      .eq("user_id", opts.userId)
      .select("dronelog_key_created_at")
      .maybeSingle();
    if (saveError || !saved?.dronelog_key_created_at) {
      console.warn(`[dronelog-auth] provision failed status=200 reason=persist_failed`);
      return { key: null, status: res.status, error: "persist_failed" };
    }
    console.log("[dronelog-auth] provisioned personal DroneLog key successfully");
    return { key: newKey, status: res.status };
  } catch (e) {
    console.warn("[dronelog-auth] provision key exception:", (e as Error).message);
    return { key: null, status: null, error: "provision_exception" };
  }
}

/** Drop a personal key that the API rejected, so it gets re-provisioned next time. */
export async function clearUserKey(serviceClient: any, userId: string): Promise<void> {
  await serviceClient
    .from("dji_credentials")
    .update({ dronelog_api_key_encrypted: null })
    .eq("user_id", userId)
    .then(() => {}, () => {});
}

/** Resolve the next safe key after DroneLog rejected the current key itself. */
export async function recoverInvalidDronelogKey(
  serviceClient: any,
  opts: { userId: string; companyId?: string | null; failedSource: KeySource },
): Promise<ResolvedKey | null> {
  if (opts.failedSource === "global") return null;
  if (opts.failedSource === "user") {
    await clearUserKey(serviceClient, opts.userId);
    return resolveDronelogKey(serviceClient, {
      userId: opts.userId,
      companyId: opts.companyId,
      provision: true,
    });
  }
  const globalKey = Deno.env.get("DRONELOG_AVISAFE_KEY") || null;
  return globalKey ? { key: globalKey, source: "global", fingerprint: fp(globalKey) } : null;
}

// ── Rate-limit cooldown (per key fingerprint, stored in app_config) ──

const COOLDOWN_PREFIX = "dronelog_cooldown_";

export async function isKeyCoolingDown(serviceClient: any, fingerprint: string): Promise<boolean> {
  try {
    const { data } = await serviceClient
      .from("app_config")
      .select("value")
      .eq("key", COOLDOWN_PREFIX + fingerprint)
      .maybeSingle();
    const until = data?.value ? Date.parse(String(data.value)) : NaN;
    return !isNaN(until) && until > Date.now();
  } catch {
    return false;
  }
}

export async function setKeyCooldown(
  serviceClient: any,
  fingerprint: string,
  seconds: number,
): Promise<void> {
  try {
    const until = new Date(Date.now() + Math.max(30, seconds) * 1000).toISOString();
    await serviceClient
      .from("app_config")
      .upsert({ key: COOLDOWN_PREFIX + fingerprint, value: until }, { onConflict: "key" });
  } catch (e) {
    console.warn("[dronelog-auth] could not set cooldown:", (e as Error).message);
  }
}

export function retryAfterSeconds(res: Response, fallback = 120): number {
  const raw = res.headers.get("Retry-After");
  const n = raw ? parseInt(raw, 10) : NaN;
  return isNaN(n) ? fallback : Math.min(n, 900);
}

// ── Login + account resolution ──

export interface LoginResult {
  ok: boolean;
  status: number;
  accountId: string | null;
  retryAfter: number | null;
  body: any;
}

export async function djiLogin(
  key: string,
  email: string,
  password: string,
): Promise<LoginResult> {
  const t = withTimeout(TIMEOUTS.login);
  let res: Response;
  try {
    res = await fetch(`${DRONELOG_BASE}/accounts/dji`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
      signal: t.signal,
    });
  } finally {
    t.clear();
  }
  const body = await res.json().catch(() => ({}));
  const accountId = body?.result?.djiAccountId || body?.result?.id || body?.result?.accountId || null;
  return {
    ok: res.ok,
    status: res.status,
    accountId: res.ok ? accountId : null,
    retryAfter: res.status === 429 ? retryAfterSeconds(res) : null,
    body,
  };
}

export async function djiLoginWithKeyRecovery(
  serviceClient: any,
  args: {
    resolved: ResolvedKey;
    userId: string;
    companyId?: string | null;
    email: string;
    password: string;
  },
): Promise<{ login: LoginResult; resolved: ResolvedKey }> {
  let resolved = args.resolved;
  let login = await djiLogin(resolved.key, args.email, args.password);
  if (login.status === 401 && resolved.source !== "global") {
    console.warn(`[dronelog-auth] rejected key source=${resolved.source}; recovering once`);
    const replacement = await recoverInvalidDronelogKey(serviceClient, {
      userId: args.userId,
      companyId: args.companyId,
      failedSource: resolved.source,
    });
    if (replacement && (replacement.source !== resolved.source || replacement.key !== resolved.key)) {
      resolved = replacement;
      login = await djiLogin(resolved.key, args.email, args.password);
    }
  }
  return { login, resolved };
}

export interface ListLogsResult {
  ok: boolean;
  status: number;
  logs: any[];
  accountId: string | null;
  /** true when we had to log in because the cached account id was rejected */
  didLogin: boolean;
  retryAfter: number | null;
  error?: string;
  body?: any;
}

/**
 * List DJI logs for a user, preferring the cached `dji_account_id` and only
 * logging in when strictly necessary.
 */
export async function listLogsWithCachedAccount(
  serviceClient: any,
  args: {
    key: string;
    userId: string;
    email: string;
    password: string;
    cachedAccountId: string | null;
    query?: string;
  },
): Promise<ListLogsResult> {
  const query = args.query ?? "limit=200";

  const doList = async (accountId: string): Promise<Response> => {
    const t = withTimeout(TIMEOUTS.list);
    try {
      return await fetch(`${DRONELOG_BASE}/logs/${accountId}?${query}`, {
        headers: { Authorization: `Bearer ${args.key}`, Accept: "application/json" },
        signal: t.signal,
      });
    } finally {
      t.clear();
    }
  };

  let accountId = args.cachedAccountId;
  let didLogin = false;

  if (accountId) {
    const res = await doList(accountId);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: true,
        status: res.status,
        logs: data?.result?.logs || data?.result || [],
        accountId,
        didLogin,
        retryAfter: null,
        body: data,
      };
    }
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, status: 429, logs: [], accountId, didLogin, retryAfter: retryAfterSeconds(res), body, error: "rate limited" };
    }
    // 401/403 (and anything else) → the cached account is stale, log in once.
    await res.text().catch(() => "");
    accountId = null;
  }

  const login = await djiLogin(args.key, args.email, args.password);
  didLogin = true;
  if (!login.ok || !login.accountId) {
    return {
      ok: false,
      status: login.status,
      logs: [],
      accountId: null,
      didLogin,
      retryAfter: login.retryAfter,
      body: login.body,
      error: `login ${login.status}`,
    };
  }
  accountId = login.accountId;
  await serviceClient
    .from("dji_credentials")
    .update({ dji_account_id: accountId })
    .eq("user_id", args.userId)
    .then(() => {}, () => {});

  const res2 = await doList(accountId);
  const data2 = await res2.json().catch(() => ({}));
  if (!res2.ok) {
    return {
      ok: false,
      status: res2.status,
      logs: [],
      accountId,
      didLogin,
      retryAfter: res2.status === 429 ? retryAfterSeconds(res2) : null,
      body: data2,
      error: `list ${res2.status}`,
    };
  }
  return {
    ok: true,
    status: res2.status,
    logs: data2?.result?.logs || data2?.result || [],
    accountId,
    didLogin,
    retryAfter: null,
    body: data2,
  };
}

export async function listLogsWithKeyRecovery(
  serviceClient: any,
  args: {
    resolved: ResolvedKey;
    userId: string;
    companyId?: string | null;
    email: string;
    password: string;
    cachedAccountId: string | null;
    query?: string;
  },
): Promise<{ listed: ListLogsResult; resolved: ResolvedKey }> {
  let resolved = args.resolved;
  let listed = await listLogsWithCachedAccount(serviceClient, { ...args, key: resolved.key });
  if (listed.status === 401 && resolved.source !== "global") {
    console.warn(`[dronelog-auth] rejected key source=${resolved.source}; recovering once`);
    const replacement = await recoverInvalidDronelogKey(serviceClient, {
      userId: args.userId,
      companyId: args.companyId,
      failedSource: resolved.source,
    });
    if (replacement && (replacement.source !== resolved.source || replacement.key !== resolved.key)) {
      resolved = replacement;
      listed = await listLogsWithCachedAccount(serviceClient, { ...args, key: resolved.key });
    }
  }
  return { listed, resolved };
}
