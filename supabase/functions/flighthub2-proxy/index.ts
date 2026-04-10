/* flighthub2-proxy v2 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from "npm:@supabase/supabase-js@2";

// ─── AWS SigV4 helpers (minimal, for OSS/S3-compatible upload) ───

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(secret: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function signV4Put(
  endpoint: string, bucket: string, objectKey: string,
  body: Uint8Array, credentials: { access_key_id: string; access_key_secret: string; security_token: string }
): Promise<Response> {
  const url = new URL(`/${bucket}/${objectKey}`, endpoint);
  const host = url.host;
  const region = host.match(/oss-([^.]+)\./)?.[1] || host.match(/s3\.([^.]+)\./)?.[1] || "us-east-1";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z/, "Z");
  const dateStamp = amzDate.substring(0, 8);

  const payloadHash = await sha256Hex(body);
  const contentType = "application/octet-stream";

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-security-token:${credentials.security_token}\n`;

  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token";

  const canonicalRequest = [
    "PUT", url.pathname, "", canonicalHeaders, signedHeaders, payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const signingKey = await getSignatureKey(credentials.access_key_secret, dateStamp, region, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.access_key_id}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url.toString(), {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Host": host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "x-amz-security-token": credentials.security_token,
      "Authorization": authHeader,
    },
    body: body,
  });
}

// ─── Helper: Try fetching projects with both API variants ───

interface ApiVariant {
  name: string;
  listUrl: (base: string) => string;
  headerName: string;
  projectHeaderName?: string;
}

const NEW_API: ApiVariant = {
  name: "openapi-v0.1",
  listUrl: (base) => `${base}/openapi/v0.1/project?page=1&page_size=100&usage=simple`,
  headerName: "X-User-Token",
  projectHeaderName: "X-Project-Uuid",
};

const OLD_API: ApiVariant = {
  name: "manage-v1.0",
  listUrl: (base) => `${base}/manage/api/v1.0/projects?page=1&page_size=100`,
  headerName: "X-Organization-Key",
  projectHeaderName: "X-Project-Uuid",
};

const API_VARIANTS = [NEW_API, OLD_API];

async function tryListProjects(
  baseUrl: string, token: string, variant: ApiVariant,
  safeFetch: (url: string, opts: RequestInit) => Promise<Response>
): Promise<{ ok: boolean; data: any; status: number; variant: string; bodyText: string }> {
  const url = variant.listUrl(baseUrl);
  const headers: Record<string, string> = {
    [variant.headerName]: token,
    "X-Request-Id": crypto.randomUUID(),
    "X-Language": "en",
  };

  console.log(`=== tryListProjects [${variant.name}] ===`);
  console.log("URL:", url);
  console.log("Auth header:", variant.headerName);

  const res = await safeFetch(url, { method: "GET", headers });
  const bodyText = await res.text();
  
  // Log ALL response headers for debugging
  const respHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => { respHeaders[key] = value; });
  console.log(`[${variant.name}] Status: ${res.status}, Body: ${bodyText.substring(0, 300)}`);
  console.log(`[${variant.name}] Response headers:`, JSON.stringify(respHeaders));

  let data: any = null;
  try { data = JSON.parse(bodyText); } catch { /* not JSON */ }

  // Check if this variant worked
  const isSuccess = res.ok && data?.code === 0;
  const isUnauthorized = data?.code === 200401 || res.status === 401;

  return {
    ok: isSuccess,
    data,
    status: res.status,
    variant: variant.name,
    bodyText,
  };
}

// ─── Main handler ───

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get user's company
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "No company" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get FlightHub 2 config
    const encKey = Deno.env.get("FH2_ENCRYPTION_KEY");
    const { data: company } = await supabase
      .from("companies")
      .select("flighthub2_base_url, parent_company_id")
      .eq("id", profile.company_id)
      .single();

    let fh2BaseUrl = ((company as any)?.flighthub2_base_url || "").trim();

    // Decrypt token from vault table
    let fh2Token = "";
    if (encKey) {
      const { data: decrypted } = await supabase.rpc("get_fh2_token", {
        p_company_id: profile.company_id,
        p_key: encKey,
      });
      fh2Token = (decrypted || "").trim();
    }

    // Strip accidental "Bearer " prefix
    if (fh2Token.toLowerCase().startsWith("bearer ")) {
      fh2Token = fh2Token.substring(7).trim();
    }

    // Fallback to parent company
    if (!fh2Token && (company as any)?.parent_company_id) {
      if (encKey) {
        const { data: parentDecrypted } = await supabase.rpc("get_fh2_token", {
          p_company_id: (company as any).parent_company_id,
          p_key: encKey,
        });
        fh2Token = (parentDecrypted || "").trim();
      }
      if (!fh2BaseUrl) {
        const { data: parent } = await supabase
          .from("companies")
          .select("flighthub2_base_url")
          .eq("id", (company as any).parent_company_id)
          .single();
        fh2BaseUrl = ((parent as any)?.flighthub2_base_url || "").trim();
      }
    }

    const body = await req.json();
    const { action, projectUuid, apiVersion, ...params } = body;

    // ─── Action: save-token (before token check) ───
    if (action === "save-token") {
      const tokenToSave = (params.token || "").trim().replace(/^bearer\s+/i, "");
      if (!tokenToSave) {
        return new Response(JSON.stringify({ error: "Token mangler" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!encKey) {
        return new Response(JSON.stringify({ error: "FH2_ENCRYPTION_KEY er ikke konfigurert på serveren" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: saveErr } = await supabase.rpc("save_fh2_token", {
        p_company_id: profile.company_id,
        p_token: tokenToSave,
        p_key: encKey,
      });
      if (saveErr) {
        console.error("save_fh2_token error:", saveErr);
        return new Response(JSON.stringify({ error: saveErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!fh2Token) {
      return new Response(JSON.stringify({ error: "FlightHub 2 er ikke konfigurert for dette selskapet." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // If no base URL, auto-detect during test-connection; for other actions require it
    if (!fh2BaseUrl && action !== "test-connection") {
      return new Response(JSON.stringify({ error: "FlightHub 2 base URL er ikke konfigurert. Kjør 'Test tilkobling' først." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip trailing slash
    fh2BaseUrl = fh2BaseUrl.replace(/\/+$/, "");

    // Extract project_uuid from JWT
    let jwtProjectUuid = "";
    let jwtOrgUuid = "";
    let jwtPayload: any = null;
    try {
      const jwtParts = fh2Token.split(".");
      if (jwtParts.length === 3) {
        jwtPayload = JSON.parse(atob(jwtParts[1]));
        jwtProjectUuid = jwtPayload.project_uuid || "";
        jwtOrgUuid = jwtPayload.organization_uuid || "";
      }
    } catch (_) { /* ignore */ }

    // Token fingerprint for debugging (never log full token)
    const tokenFingerprint = fh2Token.length > 20
      ? `${fh2Token.substring(0, 10)}...${fh2Token.substring(fh2Token.length - 6)}`
      : `[len=${fh2Token.length}]`;
    console.log(`Token fingerprint: ${tokenFingerprint}, length: ${fh2Token.length}, org_uuid: ${jwtOrgUuid || "none"}`);

    // DNS error handling
    const safeFetch = async (url: string, opts: RequestInit) => {
      try {
        return await fetch(url, opts);
      } catch (err) {
        if (err.message?.includes("dns error") || err.message?.includes("Name or service not known")) {
          throw new Error(`DNS-oppslag feilet for ${new URL(url).hostname}. Sjekk at Base URL er korrekt.`);
        }
        throw new Error(`Nettverksfeil mot ${url}: ${err.message}`);
      }
    };

    // Determine which API variant to use (client can hint with apiVersion)
    function getVariant(): ApiVariant {
      if (apiVersion === "manage-v1.0") return OLD_API;
      if (apiVersion === "openapi-v0.1") return NEW_API;
      return NEW_API; // default
    }

    function makeHeaders(variant: ApiVariant, includeProject: boolean): Record<string, string> {
      const h: Record<string, string> = {
        [variant.headerName]: fh2Token,
        "X-Request-Id": crypto.randomUUID(),
        "X-Language": "en",
      };
      const effectiveProjUuid = projectUuid || jwtProjectUuid;
      if (includeProject && effectiveProjUuid && variant.projectHeaderName) {
        h[variant.projectHeaderName] = effectiveProjUuid;
      }
      return h;
    }

    // ─── Action: test-connection ───
    if (action === "test-connection") {
      const REGION_URLS = [
        "https://es-flight-api-eu.djigate.com",
        "https://es-flight-api-us.djigate.com",
        "https://es-flight-api-cn.djigate.com",
      ];
      // If we have a base URL, try it first; otherwise try all regions
      const urlsToTry = fh2BaseUrl
        ? [fh2BaseUrl, ...REGION_URLS.filter(u => u !== fh2BaseUrl.replace(/\/+$/, "").toLowerCase())]
        : REGION_URLS;

      const result: any = {
        server_ok: false,
        token_ok: false,
        api_version: null,
        project_count: 0,
        project_names: [],
      };

      for (const baseUrl of urlsToTry) {
        for (const variant of API_VARIANTS) {
          try {
            const attempt = await tryListProjects(baseUrl, fh2Token, variant, safeFetch);
            if (attempt.ok) {
              result.server_ok = true;
              result.token_ok = true;
              result.api_version = variant.name;

              // Extract project names
              const projectList = attempt.data?.data?.list || attempt.data?.data || [];
              result.project_count = projectList.length;
              result.project_names = projectList.map((p: any) => p.workspace_name || p.name || p.project_name || "Ukjent").filter(Boolean);

              // Auto-save working base URL
              const normalizedUrl = baseUrl.replace(/\/+$/, "");
              result.working_base_url = normalizedUrl;
              if (normalizedUrl !== (fh2BaseUrl || "").replace(/\/+$/, "")) {
                result.alternate_region_worked = true;
              }
              await supabase.from("companies").update({ flighthub2_base_url: normalizedUrl }).eq("id", profile.company_id);
              console.log(`✅ ${variant.name} worked on ${baseUrl}, saved base URL`);
              break;
            }
          } catch (err) {
            console.log(`❌ ${baseUrl} [${variant.name}] error: ${err.message}`);
          }
        }
        if (result.token_ok) break;

        // At least check if first URL server responds
        if (!result.server_ok) {
          try {
            const statusRes = await safeFetch(`${baseUrl}/openapi/v0.1/system_status`, {
              method: "GET", headers: { "X-Request-Id": crypto.randomUUID() }
            });
            if (statusRes.ok) result.server_ok = true;
          } catch (_) { /* ignore */ }
        }
      }

      // JWT diagnostics
      if (jwtPayload) {
        result.jwt_info = {
          is_jwt: true,
          organization_uuid: jwtPayload.organization_uuid || null,
          exp: jwtPayload.exp ? new Date(jwtPayload.exp * 1000).toISOString() : null,
          expired: jwtPayload.exp ? (jwtPayload.exp * 1000 < Date.now()) : null,
        };
      }

      return new Response(JSON.stringify(result), {
        status: (result.server_ok || result.token_ok) ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: list-projects ───
    if (action === "list-projects") {
      // Try both variants
      for (const variant of API_VARIANTS) {
        try {
          const attempt = await tryListProjects(fh2BaseUrl, fh2Token, variant, safeFetch);
          if (attempt.ok) {
            console.log(`list-projects: ✅ ${variant.name} worked`);
            return new Response(JSON.stringify({ ...attempt.data, _api_version: variant.name }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (err) {
          console.log(`list-projects: ${variant.name} error: ${err.message}`);
        }
      }

      // Both failed
      return new Response(JSON.stringify({
        error: "Kunne ikke hente prosjekter. Begge API-varianter (ny og gammel) returnerte feil. Sjekk at organisasjonsnøkkelen er korrekt.",
        code: -1,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── For remaining actions, try both API variants ───
    const variant = getVariant();
    const projectHeadersForAction = makeHeaders(variant, true);

    // ─── Action: get-sts-token ───
    if (action === "get-sts-token") {
      const urls = [
        { url: `${fh2BaseUrl}/openapi/v0.1/project/sts-token`, v: NEW_API },
        { url: `${fh2BaseUrl}/manage/api/v1.0/project/sts-token`, v: OLD_API },
      ];
      for (const { url, v } of urls) {
        try {
          const h = makeHeaders(v, true);
          const res = await safeFetch(url, { method: "GET", headers: h });
          const data = await res.json();
          if (data.code === 0) {
            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.log(`get-sts-token [${v.name}]: code=${data.code}`);
        } catch (err) {
          console.log(`get-sts-token [${v.name}] error: ${err.message}`);
        }
      }
      return new Response(JSON.stringify({ error: "Kunne ikke hente STS-token fra FlightHub 2" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: upload-route ───
    if (action === "upload-route") {
      const { kmzBase64, routeName } = params;

      // Step 1: Get STS token (try both variants)
      let stsData: any = null;
      let workingVariant = NEW_API;
      for (const v of API_VARIANTS) {
        const stsUrl = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/project/sts-token`
          : `${fh2BaseUrl}/manage/api/v1.0/project/sts-token`;
        try {
          const h = makeHeaders(v, true);
          const res = await safeFetch(stsUrl, { method: "GET", headers: h });
          const d = await res.json();
          if (d.code === 0) {
            stsData = d;
            workingVariant = v;
            break;
          }
        } catch (_) { /* try next */ }
      }

      if (!stsData || stsData.code !== 0) {
        return new Response(JSON.stringify({ error: "Kunne ikke hente STS-token", detail: stsData }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { endpoint, bucket, credentials, object_key_prefix } = stsData.data;
      const objectKey = `${object_key_prefix}/${crypto.randomUUID()}/wayline.kmz`;

      // Step 2: Upload KMZ with SigV4
      const kmzBinary = Uint8Array.from(atob(kmzBase64), (c) => c.charCodeAt(0));
      console.log("Uploading KMZ to:", endpoint, "bucket:", bucket, "key:", objectKey, "size:", kmzBinary.length);

      try {
        const ossRes = await signV4Put(endpoint, bucket, objectKey, kmzBinary, credentials);
        const ossBody = await ossRes.text();
        console.log("OSS upload status:", ossRes.status, "body:", ossBody.substring(0, 300));

        if (!ossRes.ok) {
          return new Response(JSON.stringify({
            error: "OSS-opplasting feilet",
            oss_status: ossRes.status,
            oss_body: ossBody.substring(0, 500),
          }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (uploadErr: any) {
        return new Response(JSON.stringify({ error: `Feil ved opplasting: ${uploadErr.message}` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 3: Notify FlightHub 2
      const finishUrl = workingVariant.name === "openapi-v0.1"
        ? `${fh2BaseUrl}/openapi/v0.1/wayline/finish-upload`
        : `${fh2BaseUrl}/manage/api/v1.0/wayline/finish-upload`;
      const finishHeaders = { ...makeHeaders(workingVariant, true), "Content-Type": "application/json" };
      const finishBody: Record<string, unknown> = {
        name: routeName || "Avisafe Route",
        object_key: objectKey,
      };
      // Include device_model_key if provided by client (e.g. "0-67-0" for M30)
      if (params.deviceModelKey) {
        finishBody.device_model_key = params.deviceModelKey;
      }
      console.log("[finish-upload] URL:", finishUrl);
      console.log("[finish-upload] body:", JSON.stringify(finishBody));
      const finishRes = await safeFetch(finishUrl, {
        method: "POST",
        headers: finishHeaders,
        body: JSON.stringify(finishBody),
      });
      const finishText = await finishRes.text();
      console.log("[finish-upload] status:", finishRes.status);
      console.log("[finish-upload] response:", finishText.substring(0, 2000));
      let finishData;
      try { finishData = JSON.parse(finishText); } catch { finishData = { raw: finishText }; }
      return new Response(JSON.stringify(finishData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: create-annotation ───
    if (action === "create-annotation") {
      const { name, desc, geoJson, annotationType } = params;

      for (const v of API_VARIANTS) {
        const annotUrl = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/map/element`
          : `${fh2BaseUrl}/manage/api/v1.0/map/element`;
        try {
          const h = { ...makeHeaders(v, true), "Content-Type": "application/json" };
          const res = await safeFetch(annotUrl, {
            method: "POST",
            headers: h,
            body: JSON.stringify({
              name: name || "SORA Buffer Zone",
              desc: desc || "Generated by Avisafe",
              resource: { type: annotationType ?? 2, content: geoJson },
            }),
          });
          const data = await res.json();
          if (data.code === 0) {
            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.log(`create-annotation [${v.name}]: code=${data.code}`);
        } catch (err) {
          console.log(`create-annotation [${v.name}] error: ${err.message}`);
        }
      }

      return new Response(JSON.stringify({ error: "Kunne ikke opprette annotasjon" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: list-devices ───
    if (action === "list-devices") {
      for (const v of API_VARIANTS) {
        const url = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/device?page=1&page_size=200`
          : `${fh2BaseUrl}/manage/api/v1.0/device?page=1&page_size=200`;
        try {
          const h = makeHeaders(v, true);
          const res = await safeFetch(url, { method: "GET", headers: h });
          const data = await res.json();
          if (data.code === 0) {
            return new Response(JSON.stringify({ ...data, _api_version: v.name }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.log(`list-devices [${v.name}]: code=${data.code}`);
        } catch (err) {
          console.log(`list-devices [${v.name}] error: ${err.message}`);
        }
      }
      return new Response(JSON.stringify({ error: "Kunne ikke hente enheter" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: device-state ───
    if (action === "device-state") {
      const { deviceSn } = params;
      if (!deviceSn) {
        return new Response(JSON.stringify({ error: "deviceSn er påkrevd" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const v of API_VARIANTS) {
        const url = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/device/${encodeURIComponent(deviceSn)}/state`
          : `${fh2BaseUrl}/manage/api/v1.0/device/${encodeURIComponent(deviceSn)}/state`;
        try {
          const h = makeHeaders(v, true);
          const res = await safeFetch(url, { method: "GET", headers: h });
          const data = await res.json();
          if (data.code === 0) {
            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.log(`device-state [${v.name}]: code=${data.code}`);
        } catch (err) {
          console.log(`device-state [${v.name}] error: ${err.message}`);
        }
      }
      return new Response(JSON.stringify({ error: "Kunne ikke hente enhetsstatus" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: device-hms ───
    if (action === "device-hms") {
      const { deviceSnList } = params;
      if (!deviceSnList) {
        return new Response(JSON.stringify({ error: "deviceSnList er påkrevd" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const v of API_VARIANTS) {
        const url = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/device/hms?device_sn_list=${encodeURIComponent(deviceSnList)}`
          : `${fh2BaseUrl}/manage/api/v1.0/device/hms?device_sn_list=${encodeURIComponent(deviceSnList)}`;
        try {
          const h = makeHeaders(v, true);
          const res = await safeFetch(url, { method: "GET", headers: h });
          const data = await res.json();
          if (data.code === 0) {
            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.log(`device-hms [${v.name}]: code=${data.code}`);
        } catch (err) {
          console.log(`device-hms [${v.name}] error: ${err.message}`);
        }
      }
      return new Response(JSON.stringify({ error: "Kunne ikke hente HMS-data" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: add-project-member ───
    if (action === "add-project-member") {
      const { userId, role, nickname } = params;
      if (!projectUuid || !userId) {
        return new Response(JSON.stringify({ error: "projectUuid og userId er påkrevd" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const v of API_VARIANTS) {
        const url = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/project/member`
          : `${fh2BaseUrl}/manage/api/v1.0/project/member`;
        try {
          const h = { ...makeHeaders(v, true), "Content-Type": "application/json" };
          // Ensure project header is set for this specific project
          if (v.projectHeaderName) h[v.projectHeaderName] = projectUuid;
          const res = await safeFetch(url, {
            method: "PUT",
            headers: h,
            body: JSON.stringify({
              user_id: userId,
              role: role || "project-member",
              nickname: nickname || "",
            }),
          });
          const data = await res.json();
          if (data.code === 0) {
            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.log(`add-project-member [${v.name}]: code=${data.code}, msg=${data.message}`);
        } catch (err) {
          console.log(`add-project-member [${v.name}] error: ${err.message}`);
        }
      }
      return new Response(JSON.stringify({ error: "Kunne ikke legge til personell i prosjektet" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("flighthub2-proxy error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
