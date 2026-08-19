# Dokumenter på Tensio-oppdrag: funn og forslag

## Hva dataene viser

Jeg sjekket oppdraget "Treningsflyving" (Tensio Sør, opprettet 19.08.2026 av Magnus A. Aspås, 10 dokumenter):

- Alle 10 dokumentene ligger som faktiske koblinger i oppdragets dokumentliste. Kortet viser altså kun det som er lagret på oppdraget — ingenting hentes "live" fra drona.
- Drona på oppdraget (MATRICE 4E, SN 1581F7FVC251600CT1K5) har **null** dokumenter knyttet til seg. Din antakelse stemmer: dokumentene kommer ikke fra drona.
- Av de 10: 7 eies av Tensio (OM, SORA-rapporter, PDRA-G03, sjekkliste Matrice) og 3 eies av Avisafe ("Before takeoff", "Droneregler", "Brosjyre.pdf") fordi de er satt til global synlighet.
- I hele Tensio-hierarkiet er de vanligste vedleggene Avisafe sine globale dokumenter: "Before takeoff" (29 oppdrag), "Preflight drone" (27), samt "Brosjyre.pdf" og AviSafe-dokumentasjons-PDF-er.

## Hvor dokumentene faktisk kommer fra

Det finnes tre veier i dagens kode, og ingen av dem er drone-basert i dette tilfellet:

1. Manuelt valg i "Nytt/Rediger oppdrag" — velgeren lister **alle** dokumenter brukeren har tilgang til, inkludert Avisafe sine globale (brosjyre, dokumentasjons-PDF-er) og alle morselskapets dokumenter. Det er lett å hake av for mange.
2. Autoutfylling ved nytt oppdrag: dokumenter knyttet til dronene brukeren er tilknyttet. (Her tomt, så ikke årsaken denne gangen — men det er denne mekanismen du tenkte på.)
3. Standarddokument per oppdragstype. Tensio har ingen slike satt.

## Forslag til opprydding (velg omfang)

1. **Rydd i dokumentvelgeren i oppdragsdialogen**
   - Grupper listen: "Egen avdeling" / "Morselskap" / "Delt fra Avisafe", med eier-badge på hvert dokument.
   - Skjul Avisafe-globale markedsførings-/dokumentasjonsfiler (kategori `annet` og `dokumentstyring`) fra standardlisten; de kan hentes fram med en "Vis delte fra Avisafe"-bryter.

2. **Tydeligere visning på oppdragskortet**
   - Vis eier-badge på dokumentene, og gjør lange lister kollapsbare ("Vis alle 10 dokumenter") slik at kortet ikke drukner.

3. **Valgfritt: rydde eksisterende data**
   - Fjerne Avisafe-eide markedsføringsdokumenter (f.eks. "Brosjyre.pdf", "AviSafe - Sikkerhetsdokumentasjon.pdf") fra kundeoppdrag i én engangsopprydding.

## Teknisk

- Berørte filer: `src/components/dashboard/AddMissionDialog.tsx` (dokumenthenting/-velger), `src/components/oppdrag/MissionCard.tsx` og `src/components/dashboard/MissionDetailDialog.tsx` (visning).
- Ingen databaseendring nødvendig for punkt 1 og 2; punkt 3 er en ren datarydding.
- All ny tekst legges i både `no.json` og `en.json`.
