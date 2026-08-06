# Visuell oppgradering av evalueringsskjema

Retning: "Modern aviator refinement" — rolige kort, mørkt kategoribanner, tydelig adskilte underkategorier og en sammenslått synlighetsseksjon.

## Hva som endres

**Kategoribanner (forhåndsvisning, utfylling og visning)**
- Hver hovedkategori får et eget mørkt banner øverst i kortet: dyp blågrå flate, liten versalt "Hovedkategori N"-etikett over kategorinavnet, og snittkarakteren som en pille til høyre.
- Banneret ligger som topp på kategorikortet med litt løft (skygge), så kategoriene skiller seg klart fra hverandre i en lang liste.

**Underkategorier i forhåndsvisning/utfylling**
- Hver underkategori blir et eget hvitt kort med tittel, forklarende tekst og 1–6 som en samlet knapperad med tydelig valgt tilstand.
- Kommentarfeltet ligger under, i en dempet flate.

**Underkategorier i byggeren (redigering)**
- Underkategoriene samles under en tynn vertikal loddrett linje under hovedkategorien og får hvert sitt kort med ramme og lett skygge — det blir enkelt å se hvor én underkategori slutter og neste begynner.
- Slett-knappen flyttes til hjørnet av kortet og dukker opp ved hover.
- "Legg til underkategori" blir en stiplet full-bredde knapp nederst i gruppen.
- Hovedkategorien får en kompakt topplinje ("Hovedkategori N" + flytt/kollaps/slett).

**Synlighet blir en sammenleggbar seksjon**
- I utfyllingsdialogen vises synlighet som én sammenslått rad: ikon, "Synlighet" og en kort oppsummering ("Sees nå av: …").
- Klikk utvider raden med forklaringstekst, admin-bryteren og personlisten, med myk animasjon. Standard er lukket.

## Teknisk

- `src/components/evaluation/EvaluationFormPreview.tsx`: nytt bannerhode per kategori, kortifiserte underkategorirader, segmentert 1–6-kontroll.
- `src/components/documents/EvaluationFormDialog.tsx`: ny struktur for underkategori-kort med venstre rail, hover-slett og stiplet legg-til-knapp.
- `src/components/evaluation/EvaluationResponseDialog.tsx`: synlighetsblokken pakkes i en `Collapsible` (shadcn), lukket som standard, med oppsummeringstekst i toppen.
- Kun semantiske design tokens — ingen hardkodede `slate-900`/`bg-white`. Banneret bruker en ny token (f.eks. `--evaluation-banner`) definert i `src/index.css` og lagt inn i `tailwind.config.ts`, slik at det fungerer i både lys og mørk modus.
- Ingen nye brukervendte strenger uten i18n; eventuelle nye tekster (f.eks. "Vis/skjul synlighet") legges i både `no.json` og `en.json`.
- Ingen endringer i datamodell, lagring eller tilgangsregler.
