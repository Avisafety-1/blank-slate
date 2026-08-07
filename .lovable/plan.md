# Redesign: Rediger drone / Rediger utstyr

Retning: **Delt panel med statuskolonne**. Dialogen deles i to: en scrollbar hovedkolonne for stamdata, og en fast høyrekolonne der drift, vedlikehold og sjekklister alltid er synlig — ingen bortgjemt sammenleggbar seksjon.

## Ny struktur

```text
┌─────────────────────────────────────────────────────────┐
│ [ikon] Rediger drone                                [X] │
├───────────────────────────────┬─────────────────────────┤
│ GENERELL INFORMASJON          │ OPERATIV STATUS  [Grønn]│
│  Katalog                      │  Flytimer 4,98 h  ▓▓▓░  │
│  Modell | Serienummer         │  Intervall: dager/timer/│
│  Internt SN | Reg.nr          │  oppdrag  (redigerbart) │
│  Klasse | Kjøpsdato           │  Neste inspeksjon: dato │
│                               │  + årsakstekst (status) │
│ TEKNISKE SPESIFIKASJONER      ├─────────────────────────┤
│  MTOM | Payload | Flytimer    │ SJEKKLISTER             │
│                               │  Inspeksjon / Operasjon │
│ MERKNADER                     │  / Post-flight          │
│                               ├─────────────────────────┤
│ (øvrige seksjoner: tilknyttet │ TEKNISK ANSVARLIG       │
│  utstyr, personell, dok.,     │  avatar + navn          │
│  tilbehør, DroneTag)          ├─────────────────────────┤
│                               │ Synlig for avdelinger   │
│                               │ [Flytt til avdeling]    │
├───────────────────────────────┴─────────────────────────┤
│                                    [Avbryt]  [Lagre]    │
└─────────────────────────────────────────────────────────┘
```

## Hva endres

- **Vedlikeholdsparametre løftes ut** av den kollapsede raden og blir et alltid synlig kort øverst i høyrekolonnen: statusbadge, flytimer med fremdriftsindikator, og intervallene (dager / timer / oppdrag) som tydelige tallfelt.
- **Statusårsak vises i samme kort** (eksisterende StatusReasonList), så man ser umiddelbart hva som driver grønn/gul/rød.
- **Sjekklister samles** i én blokk i høyrekolonnen i stedet for tre spredte felt.
- **Teknisk ansvarlig** får et kompakt personkort med initialer.
- **Synlighet og «Flytt til avdeling»** legges nederst i høyrekolonnen som administrative handlinger, ikke midt i skjemaet.
- **Sticky topplinje og bunnlinje**; kun midtpartiet scroller, så Lagre alltid er tilgjengelig.
- **Mobil**: kolonnene stables — statuskortet legges først, deretter stamdata.

## Teknisk

- `src/components/resources/DroneDetailDialog.tsx`: bytt fra ett `space-y`-scrollområde til `flex`-layout med `flex-1` venstrekolonne og fast høyrekolonne (`w-[360px]`, `lg:` — full bredde under `lg`). Fjern `Collapsible` rundt «Inspeksjon og vedlikeholdsintervall»; feltene flyttes inn i høyrekolonnens kort. Ingen endring i felt, state, validering eller lagringslogikk.
- `src/components/resources/EquipmentDetailDialog.tsx`: samme struktur, tilpasset utstyrets felt.
- Ny liten presentasjonskomponent `src/components/resources/ResourceStatusPanel.tsx` for statuskortet (badge, timer, intervaller, årsakliste), gjenbrukt i begge dialogene.
- Alle farger via eksisterende semantiske tokens (ingen `bg-white`/`text-slate-*`); prototypens slate/blå oversettes til `card`, `muted`, `border`, `primary`, og status til eksisterende grønn/gul/rød-tokens. Fungerer i både lys og mørk modus.
- All ny tekst via `t()` med nøkler i både `no.json` og `en.json`.
