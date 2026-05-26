import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPrompts } from "./prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_VOICES = new Set([
  "coral", "sage", "onyx", "nova", "alloy", "ash", "ballad", "echo", "fable", "shimmer", "verse", "marin", "cedar",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Default prompts (norsk) – overstyres når vi har lest body.
  let prompts = getPrompts(undefined);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: prompts.errors.missingAuth }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: prompts.errors.openAiNotConfigured }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: prompts.errors.invalidAuth }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const { text, course_id, slide_key, voice: requestedVoice, speed: requestedSpeed, language } = body as {
      text: string;
      course_id: string;
      slide_key?: string;
      voice?: string;
      speed?: number;
      language?: string;
    };
    prompts = getPrompts(language);

    const speed = typeof requestedSpeed === "number" && requestedSpeed >= 0.25 && requestedSpeed <= 4
      ? requestedSpeed
      : 1.0;

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: prompts.errors.textMissing }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!course_id) {
      return new Response(JSON.stringify({ error: prompts.errors.courseIdMissing }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const voice = requestedVoice && ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : "coral";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: courseRow, error: courseErr } = await admin
      .from("training_courses")
      .select("id, company_id")
      .eq("id", course_id)
      .maybeSingle();
    if (courseErr || !courseRow) {
      return new Response(JSON.stringify({ error: prompts.errors.courseNotFound }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: visibleRaw } = await admin.rpc("get_user_visible_company_ids", { p_user_id: userId });
    const visibleIds: string[] = Array.isArray(visibleRaw)
      ? visibleRaw
          .map((v: any) => (typeof v === "string" ? v : v?.company_id ?? v?.get_user_visible_company_ids ?? null))
          .filter(Boolean)
      : [];
    let authorized = visibleIds.includes(courseRow.company_id);
    if (!authorized) {
      const { data: prof } = await admin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
      authorized = prof?.company_id === courseRow.company_id;
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: prompts.errors.forbidden }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ttsResp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text.slice(0, 4000),
        instructions: prompts.ttsInstructions,
        response_format: "mp3",
        speed,
      }),
    });

    if (!ttsResp.ok) {
      const errText = await ttsResp.text();
      console.error("[tts] openai failed", ttsResp.status, errText);
      return new Response(
        JSON.stringify({ error: prompts.errors.ttsFailed(ttsResp.status) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const audioBuf = await ttsResp.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuf);

    const fileKey = (slide_key && /^[a-zA-Z0-9-]+$/.test(slide_key)) ? slide_key : crypto.randomUUID();
    const path = `${courseRow.company_id}/${course_id}/manual-${fileKey}-${Date.now()}.mp3`;

    const { error: upErr } = await admin.storage
      .from("training-narration")
      .upload(path, audioBytes, { contentType: "audio/mpeg", upsert: true });
    if (upErr) {
      console.error("[tts] upload error", upErr);
      return new Response(JSON.stringify({ error: prompts.errors.uploadFailed(upErr.message) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: signed } = await admin.storage
      .from("training-narration")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);

    return new Response(
      JSON.stringify({ audio_url: signed?.signedUrl || null, voice, speed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-narration error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : prompts.errors.unknown }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
