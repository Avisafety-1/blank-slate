Dette bør ikke ta stor plass hvis vi gjør det som en kompakt PDF/JSON-basert dokumentasjon ved lagring. Typisk størrelse blir sannsynligvis ca. 50–300 KB per dokument, avhengig av om vi inkluderer kartbilde. Uten kartbilde er det ofte svært lite. Selv ved 1 000 oppdrag er dette normalt bare titalls til noen hundre MB. Det som virkelig kan ta plass er skjermbilder/kartbilder i høy oppløsning; derfor bør dokumentasjonen starte som en tekstlig/tablåbasert PDF og eventuelt ett komprimert kartbilde senere.

Plan:

1. Utvid rutens lagrede SORA-data
- Når brukeren har aktivert «SORA volum» og/eller «Tilstøtende», lagres ikke bare selve SORA-innstillingene, men også et lite dokumentasjonsgrunnlag sammen med ruten.
- For tilstøtende områder lagres resultatet som allerede beregnes i UI: radius, areal, total befolkning, gjennomsnittlig tetthet, SORA-kategori, UA size, SAIL, outdoor assemblies, containment-krav og datakilde.
- Dette unngår at dokumentet må gjenskape beregningen senere med andre data.

2. Lag en egen PDF-generator for SORA-grunnlag
- Opprett en funksjon som lager en kompakt PDF med:
  - Oppdragstittel, dato, rute-/operasjonsinformasjon
  - SORA volum: Flight Geography, Contingency, Ground Risk Buffer, høyde, buffer-modus
  - Dronegrunnlag: valgt drone, CD, V0/ground speed, UA size
  - Tilstøtende områder: beregningsradius, areal, innbyggere, tetthet, SORA-kategori, SAIL, outdoor assemblies og required containment
  - Kilder/metode: JARUS SORA 2.5, CAA Norway SORA 2.5 calculator-logikk, SSB 250m befolkningsrutenett, samt tidspunkt for generering
- Dokumentet lagres som PDF i eksisterende `documents` storage-bøtte.

3. Koble PDF-en automatisk til oppdraget ved lagring
- Når man trykker «Lagre» i ruteplanleggeren og ruten returneres til/opprettes på oppdraget, opprettes dokumentet bare dersom:
  - SORA volum er huket av, og/eller
  - Tilstøtende områder er huket av og har beregningsresultat
- Etter opprettelse legges dokumentet inn i `documents` og kobles til oppdraget via `mission_documents`.
- Tittel kan f.eks. være: `SORA beregningsgrunnlag - [oppdragstittel]`.

4. Unngå unødvendig lagringsvekst og duplikater
- Ved nyopprettelse: lag ett dokument per lagret oppdrag dersom SORA/tilstøtende er aktivert.
- Ved senere ruteendring på eksisterende oppdrag: enten erstatte/arkivere forrige SORA-grunnlag eller lage ny versjon. Anbefalt start: lage ny versjon bare når ruten faktisk lagres på nytt, slik at historikken bevares.
- Dokumentet bør ikke genereres bare fordi man skrur brytere av/på eller beregner i panelet; kun ved faktisk «Lagre».

5. UI-feedback
- Etter lagring vises en toast, f.eks. «SORA beregningsgrunnlag lagret som dokument på oppdraget».
- Hvis PDF-oppretting feiler etter at oppdraget er lagret, skal oppdraget fortsatt lagres, men brukeren får beskjed om at dokumentasjonen ikke kunne opprettes.

Tekniske detaljer:
- Berørte filer sannsynligvis:
  - `src/pages/Kart.tsx` for å ta med `showAdjacentArea` og `adjacentResult` i rutedata ved lagring.
  - `src/types/map.ts` for å utvide `RouteData` med valgfri `adjacentAreaResult`/dokumentasjonsmetadata.
  - `src/components/dashboard/AddMissionDialog.tsx` for å opprette PDF og koble den til nyopprettet/oppdatert oppdrag etter at `missions`-raden finnes.
  - Ny fil, f.eks. `src/lib/soraDocumentationPdf.ts`, for selve PDF-genereringen og opplasting til `documents`.
- Ingen databaseskjemaendring ser nødvendig ut, fordi eksisterende `documents` og `mission_documents` allerede dekker lagring og kobling.
- For lagringsplass velges PDF uten tungt kartbilde i første versjon. Det gir liten filstørrelse og god revisjonssporing.