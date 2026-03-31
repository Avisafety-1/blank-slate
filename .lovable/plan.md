

## Erstatt canvas-editor med PowerPoint-opplasting i opplæringsmodulen

### Oversikt
Fjerne den egenbygde PowerPoint-lignende canvas-editoren og erstatte den med en enkel flyt:
1. Admin laster opp en PPTX-fil
2. Filen konverteres til slide-bilder (én per side) via en edge function
3. Admin kan knytte spørsmål til bestemte slides
4. Brukere blar gjennom slides én og én, med fremdriftssporing

### Arkitektur

```text
Admin: Last opp .pptx → Edge function konverterer → Slide-bilder i Storage
       ↓
       Legg til spørsmål mellom/etter slides
       ↓
Bruker: Viser slide-bilde → Neste → Spørsmål → Neste slide → ...
        Fremdrift lagres i saved_answers (current_slide + svar)
```

### Database-endringer

**`training_courses`** — ny kolonne:
- `pptx_file_url TEXT` — sti til opplastet PPTX i storage

**`training_questions`** — endring av bruk:
- `slide_type` brukes allerede (`content` / `question`)
- For PPTX-slides: `slide_type = 'content'`, `image_url` = URL til slide-bildet, `content_json = null`
- Spørsmål legges inn som `slide_type = 'question'` mellom slide-bildene som før
- Ingen strukturelle endringer trengs

**`training_assignments`** — `saved_answers` brukes allerede for lagring av fremdrift. Utvide til også lagre `current_slide` (slide-indeks).

**Storage bucket**: `training-slides` (privat) for slide-bilder

### Edge function: `convert-pptx`

Ny Deno edge function som:
1. Mottar PPTX-fil fra storage-path
2. Bruker LibreOffice (ikke tilgjengelig i Deno) — **alternativ**: bruk en enklere tilnærming der vi **ikke konverterer server-side**, men i stedet lar admin laste opp PPTX og vi bruker en JS-basert PPTX-parser (`pptx2json` e.l.) **client-side** for å ekstrahere slide-bilder

**Bedre tilnærming**: Siden LibreOffice ikke er tilgjengelig i Deno edge functions, gjør konverteringen **client-side**:
- Bruk `pptxgenjs` for å lese PPTX → rendere slides til canvas → eksportere som PNG
- Eller enklere: la admin laste opp **PDF** (eksportert fra PowerPoint) og bruk `pdf.js` for å rendere hver side som bilde
- **Enkleste og mest robuste**: La admin laste opp **individuelle slide-bilder** (JPG/PNG) eller en **PDF**, og bruk `pdf.js` til å rendere sider

**Anbefalt løsning**: Støtt opplasting av **PDF** (som enkelt eksporteres fra PowerPoint). Bruk `pdfjs-dist` client-side til å rendere hver side som canvas/bilde. Ingen edge function trengs for konvertering.

### Endringer

#### 1. Database-migrasjon
- Legg til `pptx_file_url TEXT` på `training_courses`
- Opprett storage bucket `training-slides` med RLS

#### 2. `TrainingCourseEditor.tsx` — total omskriving
Fjern all SlideCanvasEditor/SlideEditor-bruk. Ny flyt:
- **Steg 1**: Kursdetaljer (tittel, beskrivelse, bestått-grense, gyldighet) — som nå
- **Steg 2**: Last opp PDF-fil → vis forhåndsvisning av alle slides med `pdfjs-dist`
- **Steg 3**: For hver slide kan admin velge «Legg til spørsmål etter denne sliden» → viser spørsmålsskjema med alternativer
- Lagring: Konverter PDF-sider til PNG-bilder, last opp til `training-slides` bucket, opprett `training_questions`-rader med `slide_type='content'` + `image_url` for hver slide, og `slide_type='question'` for spørsmål

#### 3. `TakeCourseDialog.tsx` — oppdater visning
- Content-slides med `image_url`: vis bildet i fullskjerm-størrelse (responsivt)
- Fremdrift: lagre `current_slide`-indeks i `saved_answers` ved «Lagre og lukk»
- Gjenoppta fra lagret posisjon
- Progresjonsbar viser totalt antall slides (ikke bare spørsmål)

#### 4. Fjern ubrukte filer
- `SlideCanvasEditor.tsx` — kan fjernes (ingen annen bruk)
- `SlideEditor.tsx` — kan fjernes
- `SlideCanvasReadonly.tsx` — kan fjernes (content-slides viser nå bare bilder)
- `SlideReadonlyView.tsx` — kan fjernes

### Installere avhengighet
- `pdfjs-dist` — for client-side PDF-rendering

### Filer som endres/opprettes

| Fil | Endring |
|-----|--------|
| DB-migrasjon | `pptx_file_url` kolonne, `training-slides` bucket |
| `TrainingCourseEditor.tsx` | Omskrives: PDF-opplasting + slide-forhåndsvisning + spørsmål |
| `TakeCourseDialog.tsx` | Oppdater: vis slide-bilder, lagre slide-posisjon |
| `SlideCanvasEditor.tsx` | Fjernes |
| `SlideEditor.tsx` | Fjernes |
| `SlideCanvasReadonly.tsx` | Fjernes |
| `SlideReadonlyView.tsx` | Fjernes |
| `package.json` | Legg til `pdfjs-dist` |

### Brukeropplevelse (kursgjennomføring)

1. Bruker åpner kurs → ser slide 1 (fullt bilde)
2. Trykker «Neste» → slide 2
3. Etter slide 3 kommer et spørsmål → må svare for å gå videre
4. Progresjonsbar: «Slide 4 av 12 · 2/5 spørsmål besvart»
5. «Lagre og lukk» → neste gang starter fra slide 4
6. Etter siste slide + alle spørsmål besvart → «Fullfør»

