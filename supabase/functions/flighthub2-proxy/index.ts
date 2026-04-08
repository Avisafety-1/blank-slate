const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Get FlightHub 2 config from company
    const { data: company } = await supabase
      .from("companies")
      .select("flighthub2_token, flighthub2_base_url")
      .eq("id", profile.company_id)
      .single();

    const fh2Token = (company as any)?.flighthub2_token;
    const fh2BaseUrl = (company as any)?.flighthub2_base_url;

    if (!fh2Token) {
      return new Response(JSON.stringify({ error: "FlightHub 2 er ikke konfigurert for dette selskapet. Legg inn organisasjonsnøkkel under Admin → Mitt selskap." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!fh2BaseUrl) {
      return new Response(JSON.stringify({ error: "FlightHub 2 base URL er ikke konfigurert. Legg inn server-adressen under Admin → Mitt selskap (f.eks. https://fh.dji.com eller din on-premises server)." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, projectUuid, ...params } = body;

    const commonHeaders: Record<string, string> = {
      "X-User-Token": fh2Token,
      "X-Request-Id": crypto.randomUUID(),
      "X-Language": "en",
      "Content-Type": "application/json",
    };
    if (projectUuid) {
      commonHeaders["X-Project-Uuid"] = projectUuid;
    }

    // ─── Action: list-projects ───
    if (action === "list-projects") {
      const res = await fetch(`${fh2BaseUrl}/openapi/v0.1/project?page=1&page_size=100&usage=simple`, {
        method: "GET",
        headers: commonHeaders,
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: get-sts-token ───
    if (action === "get-sts-token") {
      const res = await fetch(`${fh2BaseUrl}/openapi/v0.1/project/sts-token`, {
        method: "GET",
        headers: commonHeaders,
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: upload-route ───
    // 1. Get STS token, 2. Upload KMZ to OSS, 3. Call finish-upload
    if (action === "upload-route") {
      const { kmzBase64, routeName } = params;

      // Step 1: Get STS token
      const stsRes = await fetch(`${fh2BaseUrl}/openapi/v0.1/project/sts-token`, {
        method: "GET",
        headers: commonHeaders,
      });
      const stsData = await stsRes.json();

      if (stsData.code !== 0) {
        return new Response(JSON.stringify({ error: "Kunne ikke hente STS-token", detail: stsData }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { endpoint, bucket, credentials, object_key_prefix } = stsData.data;
      const objectKey = `${object_key_prefix}/${crypto.randomUUID()}/wayline.kmz`;

      // Step 2: Upload to Alibaba Cloud OSS using PUT with STS credentials
      const kmzBinary = Uint8Array.from(atob(kmzBase64), (c) => c.charCodeAt(0));

      const ossUrl = `${endpoint}/${bucket}/${objectKey}`;
      const ossRes = await fetch(ossUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-oss-security-token": credentials.security_token,
          "Authorization": `OSS ${credentials.access_key_id}:placeholder`,
        },
        body: kmzBinary,
      });

      // If direct PUT doesn't work with simple auth, try using signed URL approach
      // For now, we'll use the ali-oss compatible approach
      if (!ossRes.ok) {
        // Fallback: try using the simpler approach with query params
        const ossUrl2 = `${endpoint}/${bucket}/${objectKey}?OSSAccessKeyId=${encodeURIComponent(credentials.access_key_id)}&security-token=${encodeURIComponent(credentials.security_token)}`;
        const ossRes2 = await fetch(ossUrl2, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: kmzBinary,
        });

        if (!ossRes2.ok) {
          const errText = await ossRes2.text();
          return new Response(JSON.stringify({ error: "OSS-opplasting feilet", detail: errText }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Step 3: Notify FlightHub 2
      const finishRes = await fetch(`${fh2BaseUrl}/openapi/v0.1/wayline/finish-upload`, {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify({ name: routeName || "Avisafe Route", object_key: objectKey }),
      });
      const finishData = await finishRes.json();

      return new Response(JSON.stringify(finishData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: create-annotation ───
    if (action === "create-annotation") {
      const { name, desc, geoJson, annotationType } = params;

      const res = await fetch(`${fh2BaseUrl}/openapi/v0.1/map/element`, {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify({
          name: name || "SORA Buffer Zone",
          desc: desc || "Generated by Avisafe",
          resource: {
            type: annotationType ?? 2, // 2 = area
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
