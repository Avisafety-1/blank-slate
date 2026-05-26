// Lokale prompts for generate-course edge function.
// Frittstående, ingen frontend-imports.

export type Lang = 'no' | 'en';

const FALLBACK: Lang = 'no';

const normalize = (input: unknown): Lang => {
  const s = typeof input === 'string' ? input.toLowerCase() : '';
  if (s.startsWith('en')) return 'en';
  if (s.startsWith('no') || s.startsWith('nb') || s.startsWith('nn')) return 'no';
  return FALLBACK;
};

interface UserPromptArgs {
  topic_title: string;
  chapter_reference?: string | null;
  topic_description?: string | null;
  length: number;
  manual_title: string;
  context_block: string;
}

interface Prompts {
  systemPrompt: (length: number) => string;
  userPrompt: (args: UserPromptArgs) => string;
  ttsInstructions: string;
  chunkLabel: (i: number, section?: string | null) => string;
  schemaDescriptions: {
    introSlides: string;
    heading: string;
    narrationText: string;
    imagePrompt: string;
    sourceReference: string;
    options: string;
    correctAnswer: string;
  };
  toolDescription: string;
  fallbackDescription: {
    introHeading: string;
    learningObjectivesLabel: string;
  };
  errors: {
    missingAuth: string;
    invalidAuth: string;
    apiKeyMissing: string;
    openAiMissingWarning: string;
    openAiMissingForTts: string;
    openAiTtsFailed: (status: number) => string;
    openAiTtsException: string;
    audioUploadFailed: (label: string, msg: string) => string;
    contentJsonNotPersisted: (label: string, msg: string) => string;
    introInsertFailed: (msg: string) => string;
    questionInsertFailed: (msg: string) => string;
    missingFields: string;
    manualNotFound: string;
    forbidden: string;
    noContent: string;
    aiOverloaded: string;
    creditsExhausted: string;
    aiFailed: string;
    aiGenerationFailed: string;
    unknown: string;
  };
}

const PROMPTS: Record<Lang, Prompts> = {
  no: {
    systemPrompt: (length) => `Du er en ekspert på flysikkerhet og droneoperasjoner og lager opplæringsmateriell på norsk.

Din oppgave er å generere et test-orientert treningskurs UTELUKKENDE basert på det oppgitte manualinnholdet.

Kursstruktur:
1. 2-3 INTRO-SLIDES med forklarende tekst (narration_text) som introduserer temaet før testen begynner. Hvert slide skal ha en treffende heading, en god 2-4 setningers fortellende tekst som kan leses opp, og en image_prompt for et illustrerende bilde.
2. ${length} FLERVALGSSPØRSMÅL (kun multiple_choice — én test, ingen scenario-tekst).

Regler:
- IKKE finn på eller anta informasjon — bruk kun det som står i manualen
- Prioriter sikkerhetskritiske prosedyrer
- Hvert spørsmål skal ha NØYAKTIG 4 alternativer
- "correct_answer" må matche EN av "options" ord-for-ord
- Alle felt på norsk (image_prompt på engelsk for bedre AI-bildegenerering)
- "source_reference" peker til kapittel/seksjon fra manualen
- Returner KUN gyldig output via emit_course-verktøyet`,
    userPrompt: ({ topic_title, chapter_reference, topic_description, length, manual_title, context_block }) =>
      `Generer et kurs om følgende tema:

Tittel: ${topic_title}
${chapter_reference ? `Kapittel: ${chapter_reference}` : ''}
${topic_description ? `Beskrivelse: ${topic_description}` : ''}

Antall spørsmål: ${length}

Manualtittel: ${manual_title}

Innhold:
${context_block}`,
    ttsInstructions:
      'Snakk i en rolig, profesjonell og lærerik tone på norsk. Tydelig artikulasjon, moderat tempo, vennlig og inkluderende — som en erfaren instruktør som forklarer for en kollega.',
    chunkLabel: (i, section) =>
      `--- CHUNK ${i + 1}${section ? ` (Seksjon: ${section})` : ''} ---`,
    schemaDescriptions: {
      introSlides: '2-3 forklarende intro-slides FØR spørsmålene',
      heading: 'Tittel på slidet',
      narrationText: 'Tekst som skal leses opp (2-4 setninger på norsk)',
      imagePrompt:
        'Engelsk prompt for AI-bildegenerering. Profesjonell teknisk illustrasjon, mørk SaaS-bakgrunn, fotorealistisk drone-kontekst, ingen tekst i bildet.',
      sourceReference: 'Kapittel-/seksjonsreferanse fra manualen',
      options: 'Nøyaktig 4 alternativer',
      correctAnswer: 'Må matche EN av options ord-for-ord',
    },
    toolDescription: 'Emit the structured training course based on the manual content.',
    fallbackDescription: {
      introHeading: 'Intro',
      learningObjectivesLabel: 'Læringsmål',
    },
    errors: {
      missingAuth: 'Mangler autentisering',
      invalidAuth: 'Ugyldig autentisering',
      apiKeyMissing: 'LOVABLE_API_KEY ikke konfigurert',
      openAiMissingWarning:
        'OPENAI_API_KEY er ikke satt — server-side tale deaktivert (Web Speech fallback brukes).',
      openAiMissingForTts:
        'OPENAI_API_KEY mangler — hopper over server-side tale (bruker nettleser-fallback).',
      openAiTtsFailed: (status) => `OpenAI TTS feilet (${status}) — bruker nettleser-fallback.`,
      openAiTtsException: 'OpenAI TTS-kall kastet exception — bruker nettleser-fallback.',
      audioUploadFailed: (label, msg) => `Lyd-opplasting feilet for ${label}: ${msg}`,
      contentJsonNotPersisted: (label, msg) => `content_json kunne ikke lagres for ${label}: ${msg}`,
      introInsertFailed: (msg) => `Intro-slide insert feilet: ${msg}`,
      questionInsertFailed: (msg) => `Spørsmål-insert feilet: ${msg}`,
      missingFields: 'Mangler felter',
      manualNotFound: 'Manual ikke funnet',
      forbidden: 'Ingen tilgang',
      noContent: 'Ingen innhold funnet i manualen',
      aiOverloaded: 'AI er overbelastet. Prøv igjen om litt.',
      creditsExhausted: 'AI-kreditter brukt opp. Legg til kreditter i Settings → Workspace → Usage.',
      aiFailed: 'AI feilet',
      aiGenerationFailed: 'AI-generering feilet',
      unknown: 'Ukjent feil',
    },
  },
  en: {
    systemPrompt: (length) => `You are an expert on flight safety and drone operations producing training material in English.

Your task is to generate a test-oriented training course based EXCLUSIVELY on the provided manual content.

Course structure:
1. 2-3 INTRO SLIDES with explanatory text (narration_text) that introduce the topic before the test begins. Each slide must have a fitting heading, a solid 2-4 sentence narrative text suitable for reading aloud, and an image_prompt for an illustrative image.
2. ${length} MULTIPLE CHOICE QUESTIONS (multiple_choice only — one test, no scenario text).

Rules:
- DO NOT make up or assume information — use only what is in the manual
- Prioritize safety-critical procedures
- Each question MUST have EXACTLY 4 options
- "correct_answer" must match ONE of "options" word-for-word
- All fields in English (image_prompt also in English for better AI image generation)
- "source_reference" points to chapter/section in the manual
- Return ONLY valid output via the emit_course tool`,
    userPrompt: ({ topic_title, chapter_reference, topic_description, length, manual_title, context_block }) =>
      `Generate a course on the following topic:

Title: ${topic_title}
${chapter_reference ? `Chapter: ${chapter_reference}` : ''}
${topic_description ? `Description: ${topic_description}` : ''}

Number of questions: ${length}

Manual title: ${manual_title}

Content:
${context_block}`,
    ttsInstructions:
      'Speak in a calm, professional and instructive tone in English. Clear articulation, moderate pace, friendly and inclusive — like an experienced instructor explaining to a colleague.',
    chunkLabel: (i, section) =>
      `--- CHUNK ${i + 1}${section ? ` (Section: ${section})` : ''} ---`,
    schemaDescriptions: {
      introSlides: '2-3 explanatory intro slides BEFORE the questions',
      heading: 'Slide title',
      narrationText: 'Text to be read aloud (2-4 sentences in English)',
      imagePrompt:
        'English prompt for AI image generation. Professional technical illustration, dark SaaS background, photorealistic drone context, no text in the image.',
      sourceReference: 'Chapter/section reference from the manual',
      options: 'Exactly 4 options',
      correctAnswer: 'Must match ONE of the options word-for-word',
    },
    toolDescription: 'Emit the structured training course based on the manual content.',
    fallbackDescription: {
      introHeading: 'Intro',
      learningObjectivesLabel: 'Learning objectives',
    },
    errors: {
      missingAuth: 'Missing authentication',
      invalidAuth: 'Invalid authentication',
      apiKeyMissing: 'LOVABLE_API_KEY not configured',
      openAiMissingWarning:
        'OPENAI_API_KEY is not set — server-side narration disabled (Web Speech fallback will be used).',
      openAiMissingForTts:
        'OPENAI_API_KEY missing — skipping server-side narration (using browser fallback).',
      openAiTtsFailed: (status) => `OpenAI TTS failed (${status}) — falling back to browser TTS.`,
      openAiTtsException: 'OpenAI TTS request threw an exception — falling back to browser TTS.',
      audioUploadFailed: (label, msg) => `Audio upload failed for ${label}: ${msg}`,
      contentJsonNotPersisted: (label, msg) => `content_json could not be saved for ${label}: ${msg}`,
      introInsertFailed: (msg) => `Intro slide insert failed: ${msg}`,
      questionInsertFailed: (msg) => `Question insert failed: ${msg}`,
      missingFields: 'Missing fields',
      manualNotFound: 'Manual not found',
      forbidden: 'Forbidden',
      noContent: 'No content found in the manual',
      aiOverloaded: 'AI is overloaded. Please try again shortly.',
      creditsExhausted: 'AI credits exhausted. Add credits under Settings → Workspace → Usage.',
      aiFailed: 'AI request failed',
      aiGenerationFailed: 'AI generation failed',
      unknown: 'Unknown error',
    },
  },
};

export const getPrompts = (language: unknown): Prompts => PROMPTS[normalize(language)];
