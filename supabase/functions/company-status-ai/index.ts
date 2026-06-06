import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Felter som kan inneholde PII - fjernes rekursivt fra payload før det sendes til AI
const BLOCKED_KEYS = new Set([
  "full_name", "fullname", "name", "navn", "email", "e_post", "epost",
  "reporter", "reported_by", "created_by_name", "opprettet_av", "user_name",
  "person_name", "navn_kontaktperson", "kontaktperson", "phone", "telefon",
  "companyName", "company_name", "selskap", "selskap_navn",
]);

// Tillatte unntak (drone-modell, utstyrs-type osv. som tilfeldigvis har "name")
const ALLOWED_NAME_CONTEXTS = new Set([
  "flightHoursByDrone", "droneStatus", "equipmentStatus",
  "byCategory", "byMainCause", "byContributingCause",
  "byMonth", "byStatus", "byRisk", "bySeverity", "operationTypes",
]);

function sanitize(value: any, parentKey: string = ""): any {
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, parentKey));
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const lk = k.toLowerCase();
      if (BLOCKED_KEYS.has(lk) && !ALLOWED_NAME_CONTEXTS.has(parentKey)) {
        continue;
      }
      out[k] = sanitize(v, k);
    }
    return out;
  }
  return value;
}

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const rawPayload = body?.payload;
    if (!rawPayload || typeof rawPayload !== "object") {
      return new Response(JSON.stringify({ error: "Missing payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = sanitize(rawPayload);
    const payloadStr = JSON.stringify(payload);
    if (payloadStr.length > 150_000) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Du er en erfaren, vennlig sikkerhets- og driftsrådgiver for droneoperasjoner. \
Du skriver en leservennlig vurdering til en leder på norsk - varm i tonen, men direkte og konkret. \
Du baserer deg KUN på dataene i meldingen. Du nevner ALDRI personnavn, e-postadresser eller andre identifiserende detaljer om enkeltpersoner.

VIKTIG om vurdering av tall:
- Bruk feltet \`resourceCounts\` (antall droner, utstyr, piloter) til å normalisere risiko. 5 hendelser på 2 droner er kritisk; 5 hendelser på 40 droner er moderat.
- Regn ut og kommenter rater der det gir mening (f.eks. hendelser per pilot, flytimer per drone, avvik per oppdrag).
- Vær eksplisitt på flåtestørrelse i Nøkkeltall-seksjonen.

Bruk denne EKSAKTE strukturen og overskriftene i markdown:

**Sammendrag**
(3-4 setninger, vennlig åpning, hovedinntrykk)

**Nøkkeltall (flåte og aktivitet)**
- Droner: <total> (Grønn/Gul/Rød hvis tilgjengelig)
- Utstyr: <total>
- Piloter/personell: <total>
- Oppdrag og flytimer i perioden

**Trender**
(kulepunkter med ↑/↓ og prosent når mulig)

**Risikoområder**
(rangert etter alvorlighet, alltid normalisert mot flåtestørrelse)

**Anbefalt fokus**
(opplæring, kurs, sjekklister, prosesser, utstyr)

**Konkrete tiltak**
1. [Høy] ...
2. [Medium] ...
3. [Lav] ...

Maks 450 ord totalt. Hvis datagrunnlaget er tynt: si det først og foreslå hvilke data som bør samles inn.`;

    const userPrompt = `Periode: ${payload.periodLabel ?? "ukjent"}.\n\nDATA (JSON):\n${payloadStr}`;

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
        temperature: 0,
        top_p: 0.1,
        seed: 42,
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
    console.error("company-status-ai error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Ukjent feil" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
