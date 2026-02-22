

# Drone-regelverk AI-assistent i sokebaren

## Oversikt

Legge til en switch/toggle i sokebaren som lar brukeren veksle mellom:
- **Internt sok** (dagens funksjonalitet) - soker i AviSafe-systemets data
- **Droneregelverk AI** - en AI-assistent som svarer pa sporsmal om droneregelverk, droneteori, flyging og regler (EASA, Luftfartstilsynet, etc.)

AI-assistenten bruker Lovable AI (gratis inkludert) og er strengt begrenset til drone-relaterte emner.

## Endringer

### 1. Frontend: AISearchBar.tsx

- Legge til en `searchMode` state: `"internal"` | `"regulations"`
- Vise en Switch-komponent med label "Internt sok" / "Droneregelverk AI"
- Nar modus er "regulations":
  - Kalle en ny edge function `drone-regulations-ai` i stedet for `ai-search`
  - Vise AI-svaret som ren tekst (markdown-formatert) i stedet for resultat-griddet
  - Endre placeholder-teksten til "Spor om droneregelverk, teori, regler..."
- Nar modus er "internal": beholde alt som i dag

### 2. Ny Edge Function: `drone-regulations-ai`

Opprette `supabase/functions/drone-regulations-ai/index.ts` som:
- Mottar `query` fra brukeren
- Kaller Lovable AI Gateway med en streng system-prompt som begrenser svar til:
  - EASA-regelverk (EU-forordninger for droner)
  - Luftfartstilsynets regler og veiledninger
  - Droneteori (A1/A2/A3, STS, SORA)
  - Flyregler, luftrom, restriksjoner
  - Praktiske tips for droneoperatorer
- Avviser sporsmal utenfor disse rammene med en hoflig melding
- Returnerer AI-svaret som tekst

### 3. Visning av AI-svar

Nar i "Droneregelverk AI"-modus:
- Vises svaret i et GlassCard med markdown-formatering
- Enkel chat-lignende visning (sporsmal + svar)
- Mulighet for a stille oppfolgingssporsmal (beholder historikk i session)

## Tekniske detaljer

### Filer som endres/opprettes

| Fil | Endring |
|---|---|
| `src/components/dashboard/AISearchBar.tsx` | Legge til switch, searchMode state, ny handleRegulationsSearch funksjon, betinget rendering av resultater |
| `supabase/functions/drone-regulations-ai/index.ts` | Ny edge function med Lovable AI og streng system-prompt |

### System-prompt for AI (edge function)

AI-en far en detaljert system-prompt pa norsk som:
- Definerer rollen som droneregelverk-ekspert
- Lister opp tillatte emner (EASA, Luftfartstilsynet, dronekategorier, STS, SORA, luftrom, etc.)
- Eksplisitt instruerer om a avvise sporsmal utenfor dronerelaterte emner
- Ber om svar pa norsk med referanser til relevant regelverk

### Frontend-logikk

Sokebaren far to moduser via en Switch-komponent plassert til hoyre for input-feltet. Nar "Droneregelverk AI" er aktiv, sendes sporsmalet til den nye edge function i stedet for den eksisterende ai-search. Svaret vises som formatert tekst med en enkel samtalehistorikk som nullstilles nar brukeren bytter modus.

