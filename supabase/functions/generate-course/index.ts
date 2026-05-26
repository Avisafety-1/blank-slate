import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPrompts } from "./prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const buildCourseSchema = (prompts: ReturnType<typeof getPrompts>) => ({
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    learning_objectives: { type: "array", items: { type: "string" } },
    intro_slides: {
      type: "array",
      description: prompts.schemaDescriptions.introSlides,
      items: {
        type: "object",
        properties: {
          heading: { type: "string", description: prompts.schemaDescriptions.heading },
          narration_text: { type: "string", description: prompts.schemaDescriptions.narrationText },
          image_prompt: { type: "string", description: prompts.schemaDescriptions.imagePrompt },
          source_reference: { type: "string", description: prompts.schemaDescriptions.sourceReference },
        },
        required: ["heading", "narration_text", "image_prompt", "source_reference"],
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" }, description: prompts.schemaDescriptions.options },
          correct_answer: { type: "string", description: prompts.schemaDescriptions.correctAnswer },
          explanation: { type: "string" },
          source_reference: { type: "string" },
        },
        required: ["question", "options", "correct_answer", "explanation", "source_reference"],
      },
    },
  },
  required: ["title", "description", "intro_slides", "questions"],
});

async function generateWithAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  prompts: ReturnType<typeof getPrompts>,
) {
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
          description: prompts.toolDescription,
          parameters: buildCourseSchema(prompts),
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

async function generateImage(prompt: string, apiKey: string): Promise<Uint8Array | null> {
  try {
    const styleSuffix = ", professional technical illustration, dark SaaS background tones (deep navy/charcoal), photorealistic drone operation context, cinematic lighting, no text in image, no watermarks, clean composition";
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt + styleSuffix }],
        modalities: ["image", "text"],
      }),
    });
    if (!resp.ok) {
      console.error("[image] gen failed", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    const url: string | undefined = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url || !url.startsWith("data:")) return null;
    const base64 = url.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch (e) {
    console.error("[image] gen error", e);
    return null;
  }
}

const ALLOWED_VOICES = new Set(["coral", "sage", "onyx", "nova", "alloy", "ash", "ballad", "echo", "fable", "shimmer", "verse", "marin", "cedar"]);

async function generateTTS(
  text: string,
  openaiKey: string | undefined,
  warnings: string[],
  slideLabel: string,
  voice: string,
  prompts: ReturnType<typeof getPrompts>,
): Promise<Uint8Array | null> {
  console.log(`[tts:${slideLabel}] start — text length=${text?.length ?? 0}, voice=${voice}, openaiKey=${openaiKey ? "PRESENT" : "MISSING"}`);
  if (!openaiKey) {
    warnings.push(prompts.errors.openAiMissingForTts);
    return null;
  }
  if (!text || text.trim().length === 0) {
    console.warn(`[tts:${slideLabel}] empty text, skipping`);
    return null;
  }
  try {
    const resp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text.slice(0, 4000),
        instructions: prompts.ttsInstructions,
        response_format: "mp3",
      }),
    });
    console.log(`[tts:${slideLabel}] openai status=${resp.status}`);
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[tts:${slideLabel}] openai failed`, resp.status, body);
      warnings.push(prompts.errors.openAiTtsFailed(resp.status));
      return null;
    }
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    console.log(`[tts:${slideLabel}] received ${bytes.length} bytes`);
    return bytes;
  } catch (e) {
    console.error(`[tts:${slideLabel}] exception`, e);
    warnings.push(prompts.errors.openAiTtsException);
    return null;
  }
}

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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const warnings: string[] = [];

    console.log(`[startup] LOVABLE_API_KEY=${LOVABLE_API_KEY ? "PRESENT" : "MISSING"}, OPENAI_API_KEY=${OPENAI_API_KEY ? "PRESENT" : "MISSING"}`);

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

    const body = await req.json();
    const {
      manual_id,
      length,
      folder_id,
      topic_title,
      topic_description,
      chapter_reference,
      include_narration,
      include_visuals,
      voice: requestedVoice,
      language,
    } = body as {
      manual_id: string;
      length: number;
      folder_id?: string | null;
      topic_title: string;
      topic_description?: string;
      chapter_reference?: string;
      focus_query?: string;
      include_narration?: boolean;
      include_visuals?: boolean;
      voice?: string;
      language?: string;
    };

    prompts = getPrompts(language);

    if (!OPENAI_API_KEY) {
      warnings.push(prompts.errors.openAiMissingWarning);
    }

    const voice = requestedVoice && ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : "coral";

    console.log(`[request] manual_id=${manual_id}, length=${length}, include_narration=${include_narration}, include_visuals=${include_visuals}, voice=${voice}`);

    if (!manual_id || !topic_title || !length) {
      return new Response(JSON.stringify({ error: prompts.errors.missingFields }), {
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
      return new Response(JSON.stringify({ error: prompts.errors.manualNotFound }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorize
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

    // Retrieve chunks via even sampling (embedding model removed from AI Gateway)
    const chunks: { chunk_index: number; chunk_text: string; section_heading: string | null }[] = [];
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
    const want = Math.min(14, total);
    const step = Math.max(1, Math.floor(total / want));
    for (let i = 0; i < total && chunks.length < want; i += step) {
      chunks.push(all![i]);
    }
    console.log(`[chunks] selected ${chunks.length} of ${total}`);

    const contextBlock = chunks
      .map((c, i) => `${prompts.chunkLabel(i, c.section_heading)}\n${c.chunk_text}`)
      .join("\n\n");

    const systemPrompt = prompts.systemPrompt(length);
    const userPrompt = prompts.userPrompt({
      topic_title,
      chapter_reference,
      topic_description,
      length,
      manual_title: manual.title,
      context_block: contextBlock,
    });

    let aiResult: any;
    try {
      aiResult = await generateWithAI(systemPrompt, userPrompt, LOVABLE_API_KEY, prompts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : prompts.errors.aiFailed;
      if (msg === "rate_limit") {
        return new Response(JSON.stringify({ error: prompts.errors.aiOverloaded }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (msg === "payment_required") {
        return new Response(
          JSON.stringify({ error: prompts.errors.creditsExhausted }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        aiResult = await generateWithAI(systemPrompt, userPrompt, LOVABLE_API_KEY, prompts);
      } catch {
        return new Response(JSON.stringify({ error: prompts.errors.aiGenerationFailed }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const courseTitle = (aiResult.title || topic_title).slice(0, 200);
    const description =
      (aiResult.description || topic_description || "") +
      (aiResult.learning_objectives?.length
        ? `\n\n${prompts.fallbackDescription.learningObjectivesLabel}:\n• ` + aiResult.learning_objectives.join("\n• ")
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

    let sortOrder = 0;
    let createdSlides = 0;
    let createdQuestions = 0;

    // 1. Insert intro slides (with optional image + TTS)
    const introSlides = Array.isArray(aiResult.intro_slides) ? aiResult.intro_slides : [];
    console.log(`[intro] ${introSlides.length} slides from AI`);
    let slideIdx = 0;
    for (const slide of introSlides) {
      slideIdx++;
      const slideId = crypto.randomUUID();
      const label = `intro${slideIdx}`;

      let imageUrl: string | null = null;
      if (include_visuals && slide.image_prompt) {
        const imgBytes = await generateImage(slide.image_prompt, LOVABLE_API_KEY);
        if (imgBytes) {
          const path = `${manual.company_id}/${courseId}/${slideId}.png`;
          const { error: upErr } = await admin.storage
            .from("training-visuals")
            .upload(path, imgBytes, { contentType: "image/png", upsert: true });
          if (!upErr) {
            const { data: signed } = await admin.storage
              .from("training-visuals")
              .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
            imageUrl = signed?.signedUrl || null;
          } else {
            console.error("[image] upload error", upErr);
          }
        }
      }

      let narrationAudioUrl: string | null = null;
      console.log(`[${label}] include_narration=${include_narration}, has_text=${!!slide.narration_text}`);
      if (include_narration && slide.narration_text) {
        const audioBytes = await generateTTS(slide.narration_text, OPENAI_API_KEY, warnings, label, voice, prompts);
        if (audioBytes) {
          const path = `${manual.company_id}/${courseId}/${slideId}.mp3`;
          const { error: upErr } = await admin.storage
            .from("training-narration")
            .upload(path, audioBytes, { contentType: "audio/mpeg", upsert: true });
          if (upErr) {
            console.error(`[${label}] audio upload error`, upErr);
            warnings.push(prompts.errors.audioUploadFailed(label, upErr.message));
          } else {
            const { data: signed } = await admin.storage
              .from("training-narration")
              .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
            narrationAudioUrl = signed?.signedUrl || null;
            console.log(`[${label}] uploaded mp3, signed url=${narrationAudioUrl ? "OK" : "FAILED"}`);
          }
        }
      }

      const contentJson = {
        heading: slide.heading || null,
        narration_text: slide.narration_text || null,
        narration_audio_url: narrationAudioUrl,
        ai_generated: true,
        source_reference: slide.source_reference || null,
      };

      const insertRow: any = {
        id: slideId,
        course_id: courseId,
        question_text: slide.heading || prompts.fallbackDescription.introHeading,
        sort_order: sortOrder++,
        slide_type: "content",
        image_url: imageUrl,
        content_json: contentJson,
      };
      const { error: insErr } = await admin.from("training_questions").insert(insertRow);

      if (insErr) {
        console.error(`[${label}] insert error`, insErr);
        warnings.push(prompts.errors.introInsertFailed(insErr.message));
        continue;
      }
      createdSlides++;

      // Verify content_json was persisted; if NULL, fall back to UPDATE
      const { data: verifyRow } = await admin
        .from("training_questions")
        .select("content_json")
        .eq("id", slideId)
        .maybeSingle();
      const isNull = !verifyRow?.content_json;
      console.log(`[${label}] verified content_json: ${isNull ? "NULL — applying UPDATE fallback" : "NOT NULL"}`);
      if (isNull) {
        const { error: updErr } = await admin
          .from("training_questions")
          .update({ content_json: contentJson } as any)
          .eq("id", slideId);
        if (updErr) {
          console.error(`[${label}] update fallback failed`, updErr);
          warnings.push(prompts.errors.contentJsonNotPersisted(label, updErr.message));
        } else {
          const { data: re } = await admin
            .from("training_questions")
            .select("content_json")
            .eq("id", slideId)
            .maybeSingle();
          console.log(`[${label}] after UPDATE content_json: ${re?.content_json ? "NOT NULL ✓" : "STILL NULL ✗"}`);
        }
      }
      console.log(`[${label}] done (audio=${narrationAudioUrl ? "yes" : "no"}, image=${imageUrl ? "yes" : "no"})`);
    }

    // 2. Insert questions (multiple_choice only)
    const aiQuestions = Array.isArray(aiResult.questions) ? aiResult.questions : [];
    console.log(`[questions] ${aiQuestions.length} from AI`);
    for (const q of aiQuestions) {
      const contentJson = {
        explanation: q.explanation || null,
        source_reference: q.source_reference || null,
        ai_generated: true,
        question_type: "multiple_choice",
      };

      const { data: qRow, error: qErr } = await admin
        .from("training_questions")
        .insert({
          course_id: courseId,
          question_text: q.question,
          sort_order: sortOrder++,
          slide_type: "question",
          content_json: contentJson,
        } as any)
        .select("id")
        .single();

      if (qErr || !qRow) {
        console.error("question insert error", qErr);
        if (qErr) warnings.push(prompts.errors.questionInsertFailed(qErr.message));
        continue;
      }

      const opts = Array.isArray(q.options) ? q.options : [];
      const correct = (q.correct_answer || "").trim();
      const options = opts.map((o: string) => ({
        text: String(o).slice(0, 500),
        is_correct: String(o).trim() === correct,
      }));
      if (options.length > 0 && !options.some((o: { is_correct: boolean }) => o.is_correct)) {
        options[0].is_correct = true;
      }

      if (options.length > 0) {
        const optRows = options.map((o: { text: string; is_correct: boolean }, j: number) => ({
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

    console.log(`[done] course=${courseId}, intro=${createdSlides}, questions=${createdQuestions}, warnings=${warnings.length}`);

    return new Response(
      JSON.stringify({
        course_id: courseId,
        intro_slides_generated: createdSlides,
        questions_generated: createdQuestions,
        questions_requested: length,
        warnings,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-course error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : prompts.errors.unknown }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
