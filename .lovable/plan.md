

## Plan: Mellomside for passord-reset + «Send ny link»-knapp

### Problem
E-postklienters sikkerhetsskannere (spesielt Microsoft 365/Outlook) klikker på lenken automatisk og forbruker Supabase sitt engångstoken før brukeren rekker å klikke selv.

### Løsning
Endre `ResetPassword.tsx` til en to-stegs flyt:

**Steg 1 — Mellomside (landing)**
Når brukeren lander på `/reset-password`, vis en side med:
- AviSafe-logo og forklaring: «Klikk knappen under for å sette nytt passord»
- En **«Verifiser og sett nytt passord»**-knapp som starter token-verifiseringen
- Under knappen: **«Fungerte ikke lenken? Send ny link»**-knapp/lenke

Token-verifiseringen (hash-parsing, `onAuthStateChange`) kjøres IKKE ved sidelasting — kun når brukeren klikker knappen. Dette hindrer e-postskannere fra å forbruke tokenet.

**Steg 2 — Passordskjema**
Etter vellykket verifisering vises passorskjemaet (eksisterende UI).

**«Send ny link»-flyt**
- Viser et e-postfelt der brukeren skriver inn sin e-post
- Kaller `send-password-reset` edge-funksjonen (allerede eksisterende)
- Viser bekreftelsesmelding

### Endringer

**`src/pages/ResetPassword.tsx`** — omskrives med tre states:
1. `idle` — mellomside med «Verifiser»-knapp og «Send ny link»
2. `verifying` — spinner (eksisterende loading-state)
3. `verified` — passorskjema (eksisterende form)
4. `resend` — e-postfelt for å sende ny link

Flytt all token-logikk (useEffect med onAuthStateChange og hash-parsing) inn i en `startVerification()`-funksjon som kalles ved klikk.

### Fil som endres
- `src/pages/ResetPassword.tsx`

