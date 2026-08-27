# Tydeligere latency-varsler fra systemovervåkingen

## Hva varslene faktisk gjaldt

Begge e-postene i dag kom fra `system-health-monitor` og gjaldt samme edge-funksjon:
`process-dronelog` (DJI-loggparsing ved opplasting/import).

- 12:10 — p95 11 484 ms, 2 kall siste 10 min
- 13:50 — p95 14 796 ms, 10 kall siste 10 min

Terskelen er p95 ≥ 10 000 ms. Parsing av en DJI-logg tar normalt 10–15 sekunder,
så funksjonen bryter terskelen hver gang noen laster opp logger — også ved helt
normal bruk. Samme funksjon står bak alle latency-varslene siden 4. august.

## Er det fare for databasen?

Nei. Totalt requestvolum var 9 og 2 kall per 10 minutter da varslene gikk. Køen
`dji_sync_jobs` har 2 431 ferdige, 45 i kø, 7 feilet — normal drift, ingen
opphopning. Latency her er ventetid mot ekstern parser, ikke databaselast.

## Hva vi endrer

1. **Funksjonsnavn i e-posten** i stedet for rå UUID. Vi legger inn en
   id → navn-oppslagstabell i monitorfunksjonen, med UUID som fallback.
2. **Mer kontekst i emnefeltet**: navn på funksjonen(e) og p95, f.eks.
   «Høy latency: process-dronelog p95 14,8 s (10 kall)» — så ser du på emnet
   om det er noe å reagere på.
3. **Antall kall og lenke** til Edge Function-loggene for hver funksjon i listen.
4. **Redusere støy fra normal DJI-parsing**: `process-dronelog` legges i
   `monitoring_config.latency_excluded_function_ids`, eller får en egen høyere
   terskel, slik at du bare varsles når parsingen er unormalt treg.

## Teknisk

- Fil: `supabase/functions/system-health-monitor/index.ts` — bygg
  `FUNCTION_NAMES: Record<string, string>` for kjente function_id-er, bruk den i
  både `subject` og `html` for `high_latency`, `edge_5xx` og `rate_limits`.
- Ingen endring i terskellogikk utover valgfri per-funksjon-unntak, som allerede
  støttes via `latency_excluded_function_ids` (dataendring, ikke kodeendring).
- Ingen endringer i DJI-pipelinen eller databasen.

## Spørsmål før bygging

Vil du at `process-dronelog` skal ekskluderes helt fra latency-varsler, eller
heves til f.eks. 25 sekunder så du fortsatt varsles ved unormalt treg parsing?
