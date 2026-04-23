import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMBED_DIM = 1536;
const padOrTrim = (v: number[], d: number) =>
  v.length === d ? v : v.length > d ? v.slice(0, d) : v.concat(new Array(d - v.length).fill(0));

async function embedQuery(text: string, apiKey: string): Promise<number[]> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/text-embedding-004", input: [text] }),
  });
  if (!resp.ok) throw new Error(`embedding ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return padOrTrim(data.data[0].embedding, EMBED_DIM);
}

const courseSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    learning_objectives: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["multiple_choice", "scenario"] },
          scenario: { type: "string" },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_answer: { type: "string" },
          answer: { type: "string" },
          explanation: { type: "string" },
          source_reference: { type: "string" },
        },
        required: ["type", "question", "explanation", "source_reference"],
      },
    },
  },
  required: ["title", "description", "questions"],
};

async function generateWithAI(systemPrompt: string, userPrompt: string, apiKey: string) {
  const body = {
    model: "google/gemini-2.5-pro",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "emit_course",
          description: "Emit the structured training course based on the manual content.",
          parameters: courseSchema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "emit_course" } },
  };

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (resp.status === 429) throw new Error("rate_limit");
  if (resp.status === 402) throw new Error("payment_required");
  if (!resp.ok) throw new Error(`ai ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool call returned");
  return JSON.parse(toolCall.function.arguments);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const { manual_id, role, difficulty, length, focus_area, folder_id } = body as {
      manual_id: string;
      role: string;
      difficulty: string;
      length: number;
      focus_area?: string | null;
      folder_id?: string | null;
    };

    if (!manual_id || !role || !difficulty || !length) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: manual, error: manualErr } = await admin
      .from("manuals")
      .select("id, title, company_id")
      .eq("id", manual_id)
      .maybeSingle();
    if (manualErr || !manual) {
      return new Response(JSON.stringify({ error: "Manual not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorize: user must have visibility to that company
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
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Retrieve relevant chunks
    let chunks: { chunk_index: number; chunk_text: string; section_heading: string | null }[] = [];
    if (focus_area && focus_area.trim().length > 0) {
      try {
        const queryVec = await embedQuery(focus_area.trim(), LOVABLE_API_KEY);
        const { data: matched, error: matchErr } = await admin.rpc("match_manual_chunks", {
          p_manual_id: manual_id,
          p_query_embedding: queryVec as any,
          p_match_count: 12,
        });
        if (matchErr) throw matchErr;
        chunks = (matched || []).map((m: any) => ({
          chunk_index: m.chunk_index,
          chunk_text: m.chunk_text,
          section_heading: m.section_heading,
        }));
      } catch (e) {
        console.error("vector search failed, falling back to diversified", e);
      }
    }

    if (chunks.length === 0) {
      // Diversified across manual
      const { data: all } = await admin
        .from("manual_chunks")
        .select("chunk_index, chunk_text, section_heading")
        .eq("manual_id", manual_id)
        .order("chunk_index", { ascending: true });
      const total = all?.length || 0;
      if (total === 0) {
        return new Response(JSON.stringify({ error: "Ingen innhold funnet i manualen" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const want = Math.min(12, total);
      const step = Math.max(1, Math.floor(total / want));
      for (let i = 0; i < total && chunks.length < want; i += step) {
        chunks.push(all![i]);
      }
    }

    const contextBlock = chunks
      .map(
        (c, i) =>
          `--- CHUNK ${i + 1}${c.section_heading ? ` (Seksjon: ${c.section_heading})` : ""} ---\n${c.chunk_text}`
      )
      .join("\n\n");

    const systemPrompt = `Du er en ekspert på flysikkerhet og droneoperasjoner og lager opplæringsmateriell på norsk.

Din oppgave er å generere et høykvalitets treningskurs basert UTELUKKENDE på det oppgitte manualinnholdet.

Regler:
- IKKE finn på eller anta informasjon
- Bruk kun den oppgitte teksten
- Prioriter sikkerhetskritiske prosedyrer
- Lag realistiske, scenariobaserte spørsmål
- Unngå generiske eller åpenbare spørsmål
- Hvis informasjonen er utilstrekkelig for et spørsmål, hopp over det
- For flervalgsspørsmål: gi nøyaktig 4 svaralternativer, hvor "correct_answer" matcher EN av "options" ord-for-ord
- Alle felt skal være på norsk
- "source_reference" skal peke til seksjonsnavn eller kapittel fra manualen

Returner KUN gyldig strukturert output via emit_course-verktøyet.`;

    const userPrompt = `Generer et kurs for:
Rolle: ${role}
Vanskelighetsgrad: ${difficulty}
Antall spørsmål: ${length}
Fokus: ${focus_area || "(ingen — bruk dekkende utvalg fra manualen)"}

Manualtittel: ${manual.title}

Innhold:
${contextBlock}`;

    let aiResult: any;
    try {
      aiResult = await generateWithAI(systemPrompt, userPrompt, LOVABLE_API_KEY);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI feilet";
      if (msg === "rate_limit") {
        return new Response(JSON.stringify({ error: "AI er overbelastet. Prøv igjen om litt." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (msg === "payment_required") {
        return new Response(
          JSON.stringify({ error: "AI-kreditter brukt opp. Legg til kreditter i Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Retry once
      try {
        aiResult = await generateWithAI(systemPrompt, userPrompt, LOVABLE_API_KEY);
      } catch (e2) {
        return new Response(JSON.stringify({ error: "AI-generering feilet" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Create course
    const courseTitle = (aiResult.title || `AI-generert kurs fra ${manual.title}`).slice(0, 200);
    const description =
      (aiResult.description || "") +
      (aiResult.learning_objectives?.length
        ? "\n\nLæringsmål:\n• " + aiResult.learning_objectives.join("\n• ")
        : "");

    const { data: courseRow, error: courseErr } = await admin
      .from("training_courses")
      .insert({
        title: courseTitle,
        description,
        company_id: manual.company_id,
        created_by: userId,
        status: "draft",
        passing_score: 80,
        validity_months: 12,
        folder_id: folder_id || null,
        source_manual_id: manual_id,
      } as any)
      .select("id")
      .single();
    if (courseErr || !courseRow) {
      console.error("course insert error", courseErr);
      throw courseErr;
    }
    const courseId = courseRow.id;

    // Insert questions
    const aiQuestions = Array.isArray(aiResult.questions) ? aiResult.questions : [];
    let sortOrder = 0;
    let createdQuestions = 0;

    for (const q of aiQuestions) {
      const isScenario = q.type === "scenario";
      const qText = isScenario && q.scenario
        ? `Scenario:\n${q.scenario}\n\nSpørsmål: ${q.question}`
        : q.question;

      const contentJson = {
        explanation: q.explanation || null,
        source_reference: q.source_reference || null,
        ai_generated: true,
        question_type: q.type,
      };

      const { data: qRow, error: qErr } = await admin
        .from("training_questions")
        .insert({
          course_id: courseId,
          question_text: qText,
          sort_order: sortOrder++,
          slide_type: "question",
          content_json: contentJson as any,
        } as any)
        .select("id")
        .single();

      if (qErr || !qRow) {
        console.error("question insert error", qErr);
        continue;
      }

      // Build options
      let options: { text: string; is_correct: boolean }[] = [];
      if (isScenario) {
        // Scenario: render free-text explanation as a single-option "correct" answer flow.
        // We synthesize a Yes/No correct options pattern based on the answer.
        const correctAns = (q.answer || q.correct_answer || "Riktig svar").trim();
        options = [
          { text: correctAns.slice(0, 500), is_correct: true },
          { text: "Ikke i henhold til prosedyre", is_correct: false },
        ];
      } else {
        const opts = Array.isArray(q.options) ? q.options : [];
        const correct = (q.correct_answer || "").trim();
        options = opts.map((o: string) => ({
          text: String(o).slice(0, 500),
          is_correct: String(o).trim() === correct,
        }));
        // Ensure at least one is marked correct
        if (options.length > 0 && !options.some((o) => o.is_correct)) {
          options[0].is_correct = true;
        }
      }

      if (options.length > 0) {
        const optRows = options.map((o, j) => ({
          question_id: qRow.id,
          option_text: o.text,
          is_correct: o.is_correct,
          sort_order: j,
        }));
        const { error: optErr } = await admin.from("training_question_options").insert(optRows as any);
        if (optErr) console.error("options insert error", optErr);
      }

      createdQuestions++;
    }

    return new Response(
      JSON.stringify({
        course_id: courseId,
        questions_generated: createdQuestions,
        questions_requested: length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-course error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
