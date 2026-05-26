// Foundation prompts for ai-risk-assessment edge function.
//
// This is PR A of a planned 3-PR split (see plan):
//   - PR A (this file): language normalization, error/UI strings, request shape.
//   - PR B: migrate the large system prompt(s).
//   - PR C: migrate rule/scenario text fragments.
//
// Frittstående, ingen frontend-imports.

export type Lang = 'no' | 'en';

const FALLBACK: Lang = 'no';

export const normalizeLang = (input: unknown): Lang => {
  const s = typeof input === 'string' ? input.toLowerCase() : '';
  if (s.startsWith('en')) return 'en';
  if (s.startsWith('no') || s.startsWith('nb') || s.startsWith('nn')) return 'no';
  return FALLBACK;
};

interface Prompts {
  errors: {
    apiKeyMissing: string;
    missingAuthHeader: string;
    unauthorized: string;
    missionIdRequired: string;
    missionNotFound: string;
    rateLimited: string;
    creditsExhausted: string;
    aiUnavailable: string;
  };
}

const PROMPTS: Record<Lang, Prompts> = {
  no: {
    errors: {
      apiKeyMissing: 'LOVABLE_API_KEY er ikke konfigurert',
      missingAuthHeader: 'Mangler autorisasjonsheader',
      unauthorized: 'Ikke autorisert',
      missionIdRequired: 'Mission ID er påkrevd',
      missionNotFound: 'Oppdrag ikke funnet',
      rateLimited: 'For mange forespørsler, prøv igjen om litt',
      creditsExhausted: 'AI-kreditter oppbrukt, legg til midler',
      aiUnavailable: 'AI-tjenesten er midlertidig utilgjengelig. Prøv igjen om et øyeblikk.',
    },
  },
  en: {
    errors: {
      apiKeyMissing: 'LOVABLE_API_KEY is not configured',
      missingAuthHeader: 'No authorization header',
      unauthorized: 'Unauthorized',
      missionIdRequired: 'Mission ID is required',
      missionNotFound: 'Mission not found',
      rateLimited: 'Rate limit exceeded, please try again later',
      creditsExhausted: 'AI credits exhausted, please add funds',
      aiUnavailable: 'The AI service is temporarily unavailable. Please try again in a moment.',
    },
  },
};

export const getPrompts = (language: unknown): Prompts => PROMPTS[normalizeLang(language)];
