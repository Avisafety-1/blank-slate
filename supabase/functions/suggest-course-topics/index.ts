import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPrompts } from "./prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const buildTopicsSchema = (prompts: ReturnType<typeof getPrompts>) => ({
  type: "object",
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: prompts.schemaDescriptions.title },
          chapter_reference: { type: "string", description: prompts.schemaDescriptions.chapterReference },
          description: { type: "string", description: prompts.schemaDescriptions.description },
          focus_query: { type: "string", description: prompts.schemaDescriptions.focusQuery },
        },
        required: ["title", "chapter_reference", "description", "focus_query"],
      },
    },
  },
  required: ["topics"],
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: prompts.errors.apiKeyMissing }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
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

    const { manual_id, language } = (await req.json()) as { manual_id: string; language?: string };
    prompts = getPrompts(language);

    if (!manual_id) {
      return new Response(JSON.stringify({ error: prompts.errors.manualIdRequired }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: manual } = await admin
      .from("manuals")
      .select("id, title, company_id")
      .eq("id", manual_id)
      .maybeSingle();
    if (!manual) {
      return new Response(JSON.stringify({ error: prompts.errors.manualNotFound }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: visibleRaw } = await admin.rpc("get_user_visible_company_ids", { p_user_id: userId });
    const visibleIds: string[] = Array.isArray(visibleRaw)
      ? visibleRaw.map((v: any) => (typeof v === "string" ? v : v?.company_id ?? v?.get_user_visible_company_ids ?? null)).filter(Boolean)
      : [];
    let authorized = visibleIds.includes(manual.company_id);
    if (!authorized) {
      const { data: prof } = await admin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
      authorized = prof?.company_id === manual.company_id;
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: prompts.errors.forbidden }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: all } = await admin
      .from("manual_chunks")
      .select("chunk_index, chunk_text, section_heading")
      .eq("manual_id", manual_id)
      .order("chunk_index", { ascending: true });

    const total = all?.length || 0;
    if (total === 0) {
      return new Response(JSON.stringify({ error: prompts.errors.noContent }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const want = Math.min(20, total);
    const step = Math.max(1, Math.floor(total / want));
    const sampled: any[] = [];
    for (let i = 0; i < total && sampled.length < want; i += step) {
      sampled.push(all![i]);
    }

    const contextBlock = sampled
      .map(
        (c, i) =>
          `${prompts.chunkLabel(i, c.section_heading)}\n${(c.chunk_text || "").slice(0, 1200)}`
      )
      .join("\n\n");

    const userPrompt = prompts.userPrompt(manual.title, contextBlock);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: prompts.systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_topics",
              description: prompts.toolDescription,
              parameters: buildTopicsSchema(prompts),
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_topics" } },
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: prompts.errors.aiOverloaded }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: prompts.errors.creditsExhausted }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      return new Response(JSON.stringify({ error: prompts.errors.aiFailed }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: prompts.errors.noSuggestions }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ topics: parsed.topics || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-course-topics error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : prompts.errors.unknown }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
