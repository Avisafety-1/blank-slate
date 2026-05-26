// Lokale prompts for generate-narration edge function.
// Frittstående, ingen frontend-imports. Brukes for TTS-instruksjoner og
// brukervendte feilmeldinger.

export type Lang = 'no' | 'en';

const FALLBACK: Lang = 'no';

const normalize = (input: unknown): Lang => {
  const s = typeof input === 'string' ? input.toLowerCase() : '';
  if (s.startsWith('en')) return 'en';
  if (s.startsWith('no') || s.startsWith('nb') || s.startsWith('nn')) return 'no';
  return FALLBACK;
};

interface Prompts {
  ttsInstructions: string;
  errors: {
    missingAuth: string;
    invalidAuth: string;
    openAiNotConfigured: string;
    textMissing: string;
    courseIdMissing: string;
    courseNotFound: string;
    forbidden: string;
    ttsFailed: (status: number) => string;
    uploadFailed: (msg: string) => string;
    unknown: string;
  };
}

const PROMPTS: Record<Lang, Prompts> = {
  no: {
    ttsInstructions:
      'Snakk i en rolig, profesjonell og lærerik tone på norsk. Tydelig artikulasjon, moderat tempo, vennlig og inkluderende — som en erfaren instruktør som forklarer for en kollega.',
    errors: {
      missingAuth: 'Mangler autentisering',
      invalidAuth: 'Ugyldig autentisering',
      openAiNotConfigured: 'OPENAI_API_KEY ikke konfigurert',
      textMissing: 'Tekst mangler',
      courseIdMissing: 'course_id mangler',
      courseNotFound: 'Kurs ikke funnet',
      forbidden: 'Ingen tilgang',
      ttsFailed: (status) => `OpenAI TTS feilet (${status})`,
      uploadFailed: (msg) => `Opplasting feilet: ${msg}`,
      unknown: 'Ukjent feil',
    },
  },
  en: {
    ttsInstructions:
      'Speak in a calm, professional and instructive tone in English. Clear articulation, moderate pace, friendly and inclusive — like an experienced instructor explaining to a colleague.',
    errors: {
      missingAuth: 'Missing authentication',
      invalidAuth: 'Invalid authentication',
      openAiNotConfigured: 'OPENAI_API_KEY not configured',
      textMissing: 'Text is missing',
      courseIdMissing: 'course_id is missing',
      courseNotFound: 'Course not found',
      forbidden: 'Forbidden',
      ttsFailed: (status) => `OpenAI TTS failed (${status})`,
      uploadFailed: (msg) => `Upload failed: ${msg}`,
      unknown: 'Unknown error',
    },
  },
};

export const getPrompts = (language: unknown): Prompts => PROMPTS[normalize(language)];
