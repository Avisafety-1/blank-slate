import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AVISAFE_COMPANY_ID = "a6698b2d-8464-4f88-9bc4-ebcc072f629d";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData } = await admin
      .from("user_roles").select("role").eq("user_id", userId).single();
    if (!roleData || roleData.role !== "superadmin") {
      return new Response(JSON.stringify({ error: "Forbidden: superadmin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await admin
      .from("profiles").select("company_id").eq("id", userId).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: company } = await admin
      .from("companies").select("navn").eq("id", profile.company_id).single();
    if (!company || company.navn.toLowerCase() !== "avisafe") {
      return new Response(JSON.stringify({ error: "Forbidden: must be logged in as Avisafe" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const excludeAvisafe = body?.exclude_avisafe !== false;
    const excludeCompanyId = excludeAvisafe ? AVISAFE_COMPANY_ID : null;

    // Aggregated platform statistics (same RPC as the page)
    const { data: stats, error: statsErr } = await admin.rpc("get_platform_statistics", {
      p_exclude_company_id: excludeCompanyId,
    });
    if (statsErr) throw statsErr;

    // Recent incidents (anonymized)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    let incidentsQuery = admin
      .from("incidents")
      .select("type, severity, category, created_at, company_id")
      .gte("created_at", sixMonthsAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    if (excludeCompanyId) incidentsQuery = incidentsQuery.neq("company_id", excludeCompanyId);
    const { data: incidents } = await incidentsQuery;

    // Aggregate incidents by category and severity, plus trend last 3 vs prior 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const incCatCount: Record<string, number> = {};
    const incSevCount: Record<string, number> = {};
    let incLast3 = 0, incPrior3 = 0;
    for (const i of incidents ?? []) {
      const cat = (i as any).category || (i as any).type || "Ukjent";
      const sev = (i as any).severity || "Ukjent";
      incCatCount[cat] = (incCatCount[cat] ?? 0) + 1;
      incSevCount[sev] = (incSevCount[sev] ?? 0) + 1;
      const d = new Date((i as any).created_at);
      if (d >= threeMonthsAgo) incLast3++; else incPrior3++;
    }

    // Deviations
    let devQuery = admin
      .from("mission_deviation_reports")
      .select("category_id, created_at, company_id")
      .gte("created_at", sixMonthsAgo.toISOString())
      .limit(500);
    if (excludeCompanyId) devQuery = devQuery.neq("company_id", excludeCompanyId);
    const { data: deviations } = await devQuery;

    const { data: devCategories } = await admin
      .from("deviation_report_categories").select("id, name");
    const catName: Record<string, string> = {};
    for (const c of devCategories ?? []) catName[(c as any).id] = (c as any).name;

    const devCatCount: Record<string, number> = {};
    let devLast3 = 0, devPrior3 = 0;
    for (const d of deviations ?? []) {
      const name = catName[(d as any).category_id] || "Ukategorisert";
      devCatCount[name] = (devCatCount[name] ?? 0) + 1;
      const dt = new Date((d as any).created_at);
      if (dt >= threeMonthsAgo) devLast3++; else devPrior3++;
    }

    const dataContext = {
      kpis: stats?.kpis,
      metrics: stats?.metrics,
      trends: stats?.trends,
      distributions: stats?.distributions,
      topCompanies: stats?.rankings,
      incidents: {
        total_6mo: (incidents ?? []).length,
        last_3mo: incLast3,
        prior_3mo: incPrior3,
        by_category: incCatCount,
        by_severity: incSevCount,
      },
      deviations: {
        total_6mo: (deviations ?? []).length,
        last_3mo: devLast3,
        prior_3mo: devPrior3,
        by_category: devCatCount,
      },
    };

    const systemPrompt = `Du er en erfaren sikkerhets- og driftsanalytiker for droneoperasjoner. \
Du analyserer aggregert plattformdata for en leder, og leverer en kort, handlingsrettet vurdering på norsk. \
Vær konkret, unngå generelle floskler, og baser deg KUN på dataene du får. \
Format (markdown):
**Sammendrag** (3-4 setninger om hovedinntrykket)
**Trender** (kulepunkter, marker opp/ned med pil)
**Risikoområder** (hva som peker seg ut negativt)
**Anbefalt fokus** (opplæring, kurs, sjekklister, prosesser)
**Konkrete tiltak** (prioritert som Høy / Medium / Lav, hvert tiltak 1 setning)`;

    const userPrompt = `Analyser denne plattformdataen og gi meg en lederrettet vurdering. \
Eksklusjon av Avisafe-data: ${excludeAvisafe ? "ja" : "nei"}.\n\nDATA (JSON):\n${JSON.stringify(dataContext, null, 2)}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Forespørselsgrense nådd. Prøv igjen om litt." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI-kreditter brukt opp. Legg til kreditter i workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("platform-statistics-ai error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Ukjent feil" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
