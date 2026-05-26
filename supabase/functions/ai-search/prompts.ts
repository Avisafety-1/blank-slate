// Lokale prompts for ai-search edge function.
// Bevisst lettvekt og uten import fra frontend i18n – Deno-runtime henter dette
// direkte. Når flere språk legges til, utvid `Lang` og hvert undertre.

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
  summarizeInstruction: string; // brukes med `${context}`
  contextHeader: (query: string) => string;
  labels: {
    missions: string;
    incidents: string;
    documents: string;
    equipment: string;
    drones: string;
    competencies: string;
    sora: string;
    personnel: string;
    customers: string;
    news: string;
    flightLogs: string;
    calendarEvents: string;
    none: string;
  };
}

const PROMPTS: Record<Lang, Prompts> = {
  no: {
    systemPrompt:
      'Du er en assistent som hjelper til med å oppsummere søkeresultater. Svar kort og konsist på norsk.',
    summarizeInstruction:
      'Lag en kort oppsummering (maks 2 setninger) av disse søkeresultatene:',
    contextHeader: (query) => `Søkeresultater for "${query}":`,
    labels: {
      missions: 'Oppdrag',
      incidents: 'Hendelser',
      documents: 'Dokumenter',
      equipment: 'Utstyr',
      drones: 'Droner',
      competencies: 'Kompetanse',
      sora: 'SORA-analyser',
      personnel: 'Personell',
      customers: 'Kunder',
      news: 'Nyheter',
      flightLogs: 'Flylogger',
      calendarEvents: 'Kalender',
      none: 'Ingen',
    },
  },
  en: {
    systemPrompt:
      'You are an assistant that helps summarize search results. Answer concisely in English.',
    summarizeInstruction:
      'Write a short summary (max 2 sentences) of these search results:',
    contextHeader: (query) => `Search results for "${query}":`,
    labels: {
      missions: 'Missions',
      incidents: 'Incidents',
      documents: 'Documents',
      equipment: 'Equipment',
      drones: 'Drones',
      competencies: 'Competencies',
      sora: 'SORA analyses',
      personnel: 'Personnel',
      customers: 'Customers',
      news: 'News',
      flightLogs: 'Flight logs',
      calendarEvents: 'Calendar',
      none: 'None',
    },
  },
};

export const getPrompts = (language: unknown): Prompts => PROMPTS[normalize(language)];
