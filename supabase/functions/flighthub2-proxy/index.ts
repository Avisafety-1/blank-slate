const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  // Try to extract region from endpoint like oss-cn-hangzhou.aliyuncs.com → cn-hangzhou
  const regionMatch = host.match(/oss-([^.]+)\./);
  const region = regionMatch ? regionMatch[1] : "us-east-1";
  const service = "s3"; // OSS is S3-compatible

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z/, "Z"); // 20260409T120000Z
  const dateStamp = amzDate.substring(0, 8); // 20260409

  const payloadHash = await sha256Hex(body);
  const contentType = "application/octet-stream";

  // Canonical headers (sorted)
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-security-token:${credentials.security_token}\n`;

  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token";

  const canonicalRequest = [
    "PUT",
    url.pathname,
    "", // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
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

    // Get FlightHub 2 config from company (with parent fallback)
    const { data: company } = await supabase
      .from("companies")
      .select("flighthub2_token, flighthub2_base_url, parent_company_id")
      .eq("id", profile.company_id)
      .single();

    let fh2Token = ((company as any)?.flighthub2_token || "").trim();
    let fh2BaseUrl = ((company as any)?.flighthub2_base_url || "").trim();

    // Strip accidental "Bearer " prefix
    if (fh2Token.toLowerCase().startsWith("bearer ")) {
      fh2Token = fh2Token.substring(7).trim();
      console.log("Stripped 'Bearer ' prefix from token");
    }

    // Fallback to parent company if token is missing
    if (!fh2Token && (company as any)?.parent_company_id) {
      console.log("No FH2 token on company, checking parent:", (company as any).parent_company_id);
      const { data: parent } = await supabase
        .from("companies")
        .select("flighthub2_token, flighthub2_base_url")
        .eq("id", (company as any).parent_company_id)
        .single();
      if ((parent as any)?.flighthub2_token) {
        fh2Token = (parent as any).flighthub2_token;
        fh2BaseUrl = fh2BaseUrl || (parent as any).flighthub2_base_url;
        console.log("Using FH2 token from parent company");
      }
    }

    if (!fh2Token) {
      return new Response(JSON.stringify({ error: "FlightHub 2 er ikke konfigurert for dette selskapet. Legg inn organisasjonsnøkkel under Admin → Mitt selskap." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!fh2BaseUrl) {
      return new Response(JSON.stringify({ error: "FlightHub 2 base URL er ikke konfigurert. Legg inn server-adressen under Admin → Mitt selskap." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, projectUuid, ...params } = body;

    // Extract project_uuid from JWT for auto-fallback
    let jwtProjectUuid = "";
    let jwtOrgUuid = "";
    try {
      const jwtParts = fh2Token.split(".");
      if (jwtParts.length === 3) {
        const payload = JSON.parse(atob(jwtParts[1]));
        jwtProjectUuid = payload.project_uuid || "";
        jwtOrgUuid = payload.organization_uuid || "";
        console.log("JWT project_uuid:", jwtProjectUuid, "organization_uuid:", jwtOrgUuid);
      }
    } catch (_) { /* ignore decode errors */ }

    const commonHeaders: Record<string, string> = {
      "X-User-Token": fh2Token,
      "X-Request-Id": crypto.randomUUID(),
      "X-Language": "en",
    };
    // X-Project-Uuid: only added for project-specific actions, NOT for list-projects/test-connection
    const effectiveProjectUuid = projectUuid || jwtProjectUuid;
    const projectHeaders: Record<string, string> = { ...commonHeaders };
    if (effectiveProjectUuid) {
      projectHeaders["X-Project-Uuid"] = effectiveProjectUuid;
      console.log("Project-specific X-Project-Uuid available:", effectiveProjectUuid, projectUuid ? "(from client)" : "(from JWT)");
    }

    // Helper: fetch with DNS error handling
    const safeFetch = async (url: string, opts: RequestInit) => {
      try {
        return await fetch(url, opts);
      } catch (err: any) {
        if (err.message?.includes("dns error") || err.message?.includes("Name or service not known")) {
          throw new Error(`DNS-oppslag feilet for ${new URL(url).hostname}. Sjekk at Base URL er korrekt. Forsøkt URL: ${url}`);
        }
        throw new Error(`Nettverksfeil mot ${url}: ${err.message}`);
      }
    };

    // ─── Action: test-connection ───
    if (action === "test-connection") {
      const result: any = { server_ok: false, token_ok: false };

      // Step 1: Check system_status (no auth needed)
      const statusUrl = `${fh2BaseUrl}/openapi/v0.1/system_status`;
      try {
        const statusRes = await safeFetch(statusUrl, { method: "GET", headers: commonHeaders });
        const statusText = await statusRes.text();
        const ct = statusRes.headers.get("content-type") || "";

        if (ct.includes("text/html")) {
          return new Response(JSON.stringify({
            error: `URL-en returnerer HTML (web-innlogging), ikke API-JSON. Dette er sannsynligvis feil base URL.`,
            server_ok: false, token_ok: false,
            _tested_url: statusUrl, _status: statusRes.status,
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        let statusData: any;
        try { statusData = JSON.parse(statusText); } catch { statusData = null; }

        if (statusRes.ok && statusData?.code === 0) {
          result.server_ok = true;
          result._system_status = statusData;
        } else {
          result._system_status_error = statusText.substring(0, 200);
        }
      } catch (err: any) {
        return new Response(JSON.stringify({
          error: err.message, server_ok: false, token_ok: false, _tested_url: statusUrl,
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Step 2: Check list-projects (requires valid org key)
      const projectUrl = `${fh2BaseUrl}/openapi/v0.1/project?page=1&page_size=1&usage=simple`;
      try {
        const projRes = await safeFetch(projectUrl, { method: "GET", headers: commonHeaders });
        const projText = await projRes.text();
        let projData: any;
        try { projData = JSON.parse(projText); } catch { projData = null; }

        console.log("test-connection project check:", projRes.status, projText.substring(0, 200));

        if (projData?.code === 0) {
          result.token_ok = true;
          result.project_count = projData?.data?.list?.length ?? 0;
        } else {
          result.token_ok = false;
          result._project_error_code = projData?.code;
          result._project_error_message = projData?.message || projText.substring(0, 200);
        }
      } catch (err: any) {
        result.token_ok = false;
        result._project_error_message = err.message;
      }

      // Step 3: Decode JWT token for diagnostics -- show ALL fields
      try {
        const parts = fh2Token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          result.jwt_info = {
            is_jwt: true,
            organization_uuid: payload.organization_uuid || null,
            project_uuid: payload.project_uuid || null,
            account: payload.account || null,
            user_id: payload.user_id || null,
            sub: payload.sub || null,
            exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
            iat: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
            expired: payload.exp ? (payload.exp * 1000 < Date.now()) : null,
            raw_keys: Object.keys(payload),
            raw_payload: payload, // full payload for debugging
          };
          console.log("JWT full payload:", JSON.stringify(payload));
        } else {
          result.jwt_info = { is_jwt: false, token_length: fh2Token.length, parts: parts.length };
        }
      } catch (jwtErr: any) {
        result.jwt_info = { is_jwt: false, decode_error: jwtErr.message, token_length: fh2Token.length };
      }

      result._tested_url = statusUrl;
      result._token_length = fh2Token.length;
      const httpStatus = result.server_ok ? 200 : 502;
      return new Response(JSON.stringify(result), {
        status: httpStatus, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: list-projects ───
    if (action === "list-projects") {
      const listUrl = `${fh2BaseUrl}/openapi/v0.1/project?page=1&page_size=100&usage=simple&prj_authorized_status=project-status-authorized`;
      
      // Verbose request logging
      const reqHeaders = { ...commonHeaders };
      console.log("=== list-projects REQUEST ===");
      console.log("URL:", listUrl);
      console.log("Header keys:", Object.keys(reqHeaders));
      console.log("Token length:", fh2Token.length, "prefix:", fh2Token.substring(0, 8) + "...", "suffix: ..." + fh2Token.substring(fh2Token.length - 4));
      console.log("Token has newlines:", fh2Token.includes("\n") || fh2Token.includes("\r"));
      console.log("Token has spaces:", fh2Token.includes(" "));
      
      const res = await safeFetch(listUrl, {
        method: "GET",
        headers: reqHeaders,
      });
      const contentType = res.headers.get("content-type") || "";
      const bodyText = await res.text();
      
      // Verbose response logging
      console.log("=== list-projects RESPONSE ===");
      console.log("Status:", res.status);
      console.log("Content-Type:", contentType);
      console.log("Body:", bodyText.substring(0, 500));
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { respHeaders[k] = v; });
      console.log("Response headers:", JSON.stringify(respHeaders));

      if (!res.ok) {
        return new Response(JSON.stringify({
          error: `FlightHub 2 returnerte ${res.status}: ${bodyText.substring(0, 200)}`,
          code: -1,
          _status: res.status,
          _response_headers: respHeaders,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let data: any;
      try {
        data = JSON.parse(bodyText);
      } catch {
        return new Response(JSON.stringify({
          error: `Uventet respons fra FlightHub 2 (ikke JSON). Content-Type: ${contentType}`,
          code: -1,
          _body_preview: bodyText.substring(0, 200),
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: get-sts-token ───
    if (action === "get-sts-token") {
      const res = await safeFetch(`${fh2BaseUrl}/openapi/v0.1/project/sts-token`, {
        method: "GET",
        headers: projectHeaders,
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: upload-route ───
    if (action === "upload-route") {
      const { kmzBase64, routeName } = params;

      // Step 1: Get STS token
      const stsRes = await safeFetch(`${fh2BaseUrl}/openapi/v0.1/project/sts-token`, {
        method: "GET",
        headers: projectHeaders,
      });
      const stsData = await stsRes.json();
      console.log("STS response code:", stsData.code, "keys:", stsData.data ? Object.keys(stsData.data) : "no data");

      if (stsData.code !== 0) {
        return new Response(JSON.stringify({ error: "Kunne ikke hente STS-token", detail: stsData }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { endpoint, bucket, credentials, object_key_prefix } = stsData.data;
      const objectKey = `${object_key_prefix}/${crypto.randomUUID()}/wayline.kmz`;

      // Step 2: Decode KMZ and upload with SigV4
      const kmzBinary = Uint8Array.from(atob(kmzBase64), (c) => c.charCodeAt(0));
      console.log("Uploading KMZ to:", endpoint, "bucket:", bucket, "key:", objectKey, "size:", kmzBinary.length);

      try {
        const ossRes = await signV4Put(endpoint, bucket, objectKey, kmzBinary, credentials);
        const ossBody = await ossRes.text();
        console.log("OSS upload status:", ossRes.status, "body:", ossBody.substring(0, 300));

        if (!ossRes.ok) {
          // Try with x-oss-security-token header name instead (Alibaba OSS variant)
          console.log("SigV4 upload failed, trying OSS presigned URL fallback...");
          const presignedUrl = `${endpoint}/${bucket}/${objectKey}?OSSAccessKeyId=${encodeURIComponent(credentials.access_key_id)}&Signature=placeholder&Expires=${Math.floor(Date.now() / 1000) + 3600}&security-token=${encodeURIComponent(credentials.security_token)}`;
          
          return new Response(JSON.stringify({
            error: "OSS-opplasting feilet med SigV4",
            oss_status: ossRes.status,
            oss_body: ossBody.substring(0, 500),
            _debug: {
              endpoint,
              bucket,
              objectKey,
              credentials_available: !!(credentials.access_key_id && credentials.access_key_secret && credentials.security_token),
            }
          }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (uploadErr: any) {
        return new Response(JSON.stringify({
          error: `Feil ved opplasting til lagring: ${uploadErr.message}`,
          _debug: { endpoint, bucket, objectKey }
        }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 3: Notify FlightHub 2 that upload is complete
      const finishRes = await safeFetch(`${fh2BaseUrl}/openapi/v0.1/wayline/finish-upload`, {
        method: "POST",
        headers: { ...projectHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: routeName || "Avisafe Route", object_key: objectKey }),
      });
      const finishData = await finishRes.json();
      console.log("finish-upload response:", JSON.stringify(finishData));

      return new Response(JSON.stringify(finishData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: create-annotation ───
    if (action === "create-annotation") {
      const { name, desc, geoJson, annotationType } = params;

      const res = await safeFetch(`${fh2BaseUrl}/openapi/v0.1/map/element`, {
        method: "POST",
        headers: { ...projectHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "SORA Buffer Zone",
          desc: desc || "Generated by Avisafe",
          resource: {
            type: annotationType ?? 2,
            content: geoJson,
          },
        }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("flighthub2-proxy error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
