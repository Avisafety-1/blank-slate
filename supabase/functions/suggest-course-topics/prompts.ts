// Lokale prompts for suggest-course-topics edge function.
// Frittstående, ingen frontend-imports.

export type Lang = 'no' | 'en';

const FALLBACK: Lang = 'no';

const normalize = (input: unknown): Lang => {
  const s = typeof input === 'string' ? input.toLowerCase() : '';
  if (s.startsWith('en')) return 'en';
  if (s.startsWith('no') || s.startsWith('nb') || s.startsWith('nn')) return 'no';
  return FALLBACK;
};

interface Prompts {
  systemPrompt: string;
  userPrompt: (manualTitle: string, contextBlock: string) => string;
  chunkLabel: (i: number, section?: string | null) => string;
  sectionPrefix: string;
  toolDescription: string;
  schemaDescriptions: {
    title: string;
    chapterReference: string;
    description: string;
    focusQuery: string;
  };
  errors: {
    missingAuth: string;
    invalidAuth: string;
    apiKeyMissing: string;
    manualIdRequired: string;
    manualNotFound: string;
    forbidden: string;
    noContent: string;
    aiOverloaded: string;
    creditsExhausted: string;
    aiFailed: string;
    noSuggestions: string;
    unknown: string;
  };
}

const PROMPTS: Record<Lang, Prompts> = {
  no: {
    systemPrompt: `Du er en ekspert på dronesikkerhet og opplæring. Din oppgave er å analysere en operasjonsmanual og foreslå 5-8 spesifikke kurs-temaer som passer for trening av personell.

Regler:
- Hvert tema skal være FOKUSERT (ikke for bredt)
- Bruk faktiske kapittel-/seksjonsreferanser fra manualen når mulig
- Prioriter sikkerhetskritiske og operativt viktige temaer
- Unngå generiske temaer — vær konkret om hva manualen faktisk dekker
- Alle felt skal være på norsk
- Returner KUN gyldig output via emit_topics-verktøyet`,
    userPrompt: (manualTitle, contextBlock) =>
      `Analyser denne manualen og foreslå 5-8 kurs-temaer:\n\nManualtittel: ${manualTitle}\n\nInnhold (utvalg på tvers av manualen):\n${contextBlock}`,
    chunkLabel: (i, section) =>
      `--- CHUNK ${i + 1}${section ? ` (Seksjon: ${section})` : ''} ---`,
    sectionPrefix: 'Seksjon',
    toolDescription: 'Foreslå kurs-temaer basert på manualinnholdet',
    schemaDescriptions: {
      title: 'Kort, beskrivende kurstittel på norsk',
      chapterReference: "Referanse til kapittel/seksjon i manualen, f.eks. 'Kap. 7.3' eller 'Seksjon 4.1–4.2'",
      description: '1-2 setninger som forklarer hva kurset dekker',
      focusQuery: 'Kort søkesetning som kan brukes for retrieval',
    },
    errors: {
      missingAuth: 'Mangler autentisering',
      invalidAuth: 'Ugyldig autentisering',
      apiKeyMissing: 'LOVABLE_API_KEY ikke konfigurert',
      manualIdRequired: 'manual_id mangler',
      manualNotFound: 'Manual ikke funnet',
      forbidden: 'Ingen tilgang',
      noContent: 'Ingen innhold funnet i manualen',
      aiOverloaded: 'AI er overbelastet. Prøv igjen om litt.',
      creditsExhausted: 'AI-kreditter brukt opp.',
      aiFailed: 'AI-kall feilet',
      noSuggestions: 'AI returnerte ikke forslag',
      unknown: 'Ukjent feil',
    },
  },
  en: {
    systemPrompt: `You are an expert on drone safety and training. Your task is to analyze an operations manual and suggest 5-8 specific course topics suitable for personnel training.

Rules:
- Each topic must be FOCUSED (not too broad)
- Use actual chapter/section references from the manual when possible
- Prioritize safety-critical and operationally important topics
- Avoid generic topics — be concrete about what the manual actually covers
- All fields must be in English
- Return ONLY valid output via the emit_topics tool`,
    userPrompt: (manualTitle, contextBlock) =>
      `Analyze this manual and suggest 5-8 course topics:\n\nManual title: ${manualTitle}\n\nContent (samples across the manual):\n${contextBlock}`,
    chunkLabel: (i, section) =>
      `--- CHUNK ${i + 1}${section ? ` (Section: ${section})` : ''} ---`,
    sectionPrefix: 'Section',
    toolDescription: 'Suggest course topics based on the manual content',
    schemaDescriptions: {
      title: 'Short, descriptive course title in English',
      chapterReference: "Reference to chapter/section in the manual, e.g. 'Ch. 7.3' or 'Section 4.1–4.2'",
      description: '1-2 sentences explaining what the course covers',
      focusQuery: 'Short search phrase that can be used for retrieval',
    },
    errors: {
      missingAuth: 'Missing authentication',
      invalidAuth: 'Invalid authentication',
      apiKeyMissing: 'LOVABLE_API_KEY not configured',
      manualIdRequired: 'manual_id is required',
      manualNotFound: 'Manual not found',
      forbidden: 'Forbidden',
      noContent: 'No content found in the manual',
      aiOverloaded: 'AI is overloaded. Please try again shortly.',
      creditsExhausted: 'AI credits exhausted.',
      aiFailed: 'AI request failed',
      noSuggestions: 'AI did not return any suggestions',
      unknown: 'Unknown error',
    },
  },
};

export const getPrompts = (language: unknown): Prompts => PROMPTS[normalize(language)];
