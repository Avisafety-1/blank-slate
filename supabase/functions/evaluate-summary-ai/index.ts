import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface SubPayload {
  name: string;
  score: number | null;
  comment: string | null;
}
interface CatPayload {
  name: string;
  average: number | null;
  subcategories: SubPayload[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY is not configured" }, 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const language: string = body?.language === "en" ? "en" : "no";
    const templateTitle: string = typeof body?.templateTitle === "string" ? body.templateTitle.slice(0, 200) : "";
    const overallAverage: number | null =
      typeof body?.overallAverage === "number" ? body.overallAverage : null;
    const categories: CatPayload[] = Array.isArray(body?.categories) ? body.categories : [];

    if (!categories.length) return json({ error: "Missing categories" }, 400);

    // Kun karakterer og kommentarer - ingen navn, e-post eller oppdrags-ID
    const safeCategories = categories.slice(0, 40).map((cat) => ({
      name: String(cat?.name ?? "").slice(0, 200),
      average: typeof cat?.average === "number" ? Number(cat.average.toFixed(2)) : null,
      subcategories: (Array.isArray(cat?.subcategories) ? cat.subcategories : [])
        .slice(0, 40)
        .map((sub) => ({
          name: String(sub?.name ?? "").slice(0, 200),
          score: typeof sub?.score === "number" && sub.score > 0 ? sub.score : null,
          comment: typeof sub?.comment === "string" ? sub.comment.slice(0, 2000) : null,
        })),
    }));

    const payloadStr = JSON.stringify({
      templateTitle,
      overallAverage: overallAverage === null ? null : Number(overallAverage.toFixed(2)),
      scale: "1-6 (6 = best)",
      categories: safeCategories,
    });
    if (payloadStr.length > 120_000) return json({ error: "Payload too large" }, 413);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        stream: true,
        instructions: SYSTEM_PROMPT,
        input: buildUserPrompt(language, payloadStr),
      }),
    });

    if (!aiResponse.ok || !aiResponse.body) {
      if (aiResponse.status === 429) {
        return json(
          { error: language === "en" ? "Rate limit reached. Try again shortly." : "Forespørselsgrense nådd. Prøv igjen om litt." },
          429,
        );
      }
      if (aiResponse.status === 402) {
        return json(
          { error: language === "en" ? "AI credits exhausted." : "AI-kreditter brukt opp." },
          402,
        );
      }
      const errText = await aiResponse.text().catch(() => "");
      console.error("AI gateway error:", aiResponse.status, errText);
      return json({ error: "AI gateway error" }, 500);
    }

    // Les SSE server-side og bygg opp den ferdige teksten
    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let summary = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data);
          if (evt?.type === "response.output_text.delta" && typeof evt.delta === "string") {
            summary += evt.delta;
          } else if (evt?.type === "response.completed" && !summary) {
            const out = evt?.response?.output_text;
            if (typeof out === "string") summary = out;
            else if (Array.isArray(out)) summary = out.join("");
          }
        } catch {
          // ignorer ufullstendige/ukjente events
        }
      }
    }

    summary = summary.trim();
    if (!summary) return json({ error: "Empty AI response" }, 502);

    return json({ summary });
  } catch (error) {
    console.error("evaluate-summary-ai error:", error);
    return json({ error: error instanceof Error ? error.message : "Ukjent feil" }, 500);
  }
});
