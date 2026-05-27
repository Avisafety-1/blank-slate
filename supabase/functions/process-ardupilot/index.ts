import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callArdupilotParser,
  extractBinBytes,
  normalizeToUnified,
  sanitizeResult,
} from "../_shared/ardupilot-normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse multipart form data
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: "Expected multipart/form-data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileName = file.name.toLowerCase();
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    let binData: Uint8Array;
    try {
      binData = await extractBinBytes(fileBytes, fileName);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: (e as Error).message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let rawData: any;
    try {
      rawData = await callArdupilotParser(binData);
    } catch (e: any) {
      console.error("ArduPilot parser error:", e?.message ?? e);
      const status = e?.status === undefined ? 502 : (e.status >= 500 ? 502 : e.status);
      return new Response(
        JSON.stringify({ error: e?.message ?? "Parser error" }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("ArduPilot raw data keys:", Object.keys(rawData));
    const result = sanitizeResult(normalizeToUnified(rawData));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-ardupilot error:", error);
    const msg = error instanceof Error ? error.message : "Ukjent feil";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
