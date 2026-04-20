## Plan: Avdelings-tilgang til «Mitt selskap» med arv + valgfri overstyring (Alternativ B)

### Mål
Gi avdelings-administratorer tilgang til «Mitt selskap»-fanen. Innstillinger som morselskapet har propagert vises som «Arvet fra morselskap» (låst). Innstillinger som ikke er propagert kan overstyres av avdelingen.

### DB-endring
Legg til boolean-flagg per propagerbar innstilling på `companies` for å huske om morselskapet har «Gjelder for alle underavdelinger» PÅ:
- `propagate_airspace_warnings boolean default false`
- `propagate_hide_reporter boolean default false`
- `propagate_mission_approval boolean default false`
- `propagate_sora_required boolean default false`
- `propagate_deviation_report boolean default false`

Disse erstatter ikke eksisterende verdier — de markerer «mor styrer dette feltet». Avdelingen leser sin egen verdi som vanlig, men UI-et henter parent-flagget for å avgjøre om feltet skal vises som låst.

### Endringer i `src/pages/Admin.tsx`
- Fjern `!isChildCompany` fra fanevilkåret slik at avdelings-admin også ser «Mitt selskap».

### Endringer i `src/components/admin/ChildCompaniesSection.tsx`
- Hent parent-selskapets `propagate_*`-flagg + verdier når `isChildCompany`.
- Vis banner øverst: «Du ser innstillinger for {avdeling}. Felt merket med 🔒 styres av morselskapet ({parent.navn}).»
- For hver innstilling:
  - Hvis `isChildCompany && parent.propagate_<felt>`: vis bryteren som **disabled** med badge «Arvet fra {parent.navn}» og verdien fra parent.
  - Ellers: bryteren er redigerbar.
- Skjul «Avdelinger»-tabellen og «Gjelder for alle underavdelinger»-toggles for avdelinger.
- For morselskap: Når toggle «Gjelder for alle underavdelinger» slås PÅ → sett `propagate_<felt> = true` på mor OG push verdien til alle barn (som i dag). Når den slås AV → sett `propagate_<felt> = false` (avdelinger får tilbake muligheten til å overstyre).

### Innstillinger som omfattes (denne runden)
1. Vis alle luftromsadvarsler
2. Skjul rapportør-identitet
3. Krev godkjenning av oppdrag
4. Krev SORA på oppdrag (+ antall steg)
5. Avviksrapport (utvid samme mønster)

SORA-config (`company_sora_config`), mission roles og flight alerts holdes utenfor denne runden.

### Filer som endres
- DB-migrasjon (nye kolonner på `companies`)
- `src/pages/Admin.tsx`
- `src/components/admin/ChildCompaniesSection.tsx`

### UI-detaljer
- Badge: `secondary` med `Lock`-ikon fra lucide-react.
- Tooltip på låst bryter: «Denne innstillingen er styrt av morselskapet. Kontakt morselskapets administrator for å endre.»

<lov-actions>
<lov-suggestion message="Inkluder også SORA-config (buffermodus, geography, altitude), mission roles og flight alerts i samme arv-mønster">Utvid til SORA + roller + varsler</lov-suggestion>
<lov-suggestion message="Test arvelogikken: aktiver propagering på mor, sjekk at avdelings-admin ser låst bryter, deaktiver og verifiser at avdelingen kan overstyre">Verifiser arv ende-til-ende</lov-suggestion>
</lov-actions>
