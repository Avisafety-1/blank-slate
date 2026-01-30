
# Plan: Løs iOS-tastatur som dekker innhold på iPhone

## Problemet
Når brukere på iPhone trykker i tekstfelt eller input-felt i PWA eller nettleser:
1. Tastaturet dukker opp og dekker deler av innholdet
2. Man kan ikke scrolle ned til innhold som er skjult bak tastaturet
3. iPhone-tastaturet har ingen innebygd knapp for å lukke/minimere tastaturet (i motsetning til Samsung)

## Løsning
Vi implementerer en todelt løsning:

### Del 1: Global "Ferdig"-knapp som vises når tastaturet er åpent
En flytende knapp som vises nederst til høyre når et tekstfelt har fokus. Dette gir brukerne en måte å lukke tastaturet på - noe som mangler på iOS.

### Del 2: Automatisk scroll til fokusert felt
Når et input-felt får fokus, sørger vi for at det scrolles synlig over tastaturet ved hjelp av Visual Viewport API.

---

## Tekniske detaljer

### Ny hook: `useIOSKeyboard.ts`
Oppretter en ny React-hook som:
- Lytter på `focusin` og `focusout` events
- Sjekker om fokusert element er et tastatur-input (input, textarea, contenteditable)
- Bruker Visual Viewport API for å beregne tastaturhøyde
- Eksporterer:
  - `isKeyboardOpen`: boolean
  - `keyboardHeight`: number (for justering av innhold)

### Ny komponent: `KeyboardDismissButton.tsx`
- Vises kun på iOS-enheter når et input-felt har fokus
- Plasseres øverst til høyre på skjermen med `position: fixed`
- Lukker tastaturet ved å kalle `document.activeElement.blur()`
- Liten, diskret "Ferdig"-knapp som ikke tar for mye plass

### CSS-justeringer i `index.css`
- Legger til CSS for å håndtere Visual Viewport på iOS:
  ```css
  @supports (height: 100dvh) {
    html, body {
      height: 100dvh;
    }
  }
  ```

### Integrasjon i `App.tsx`
- Legger til `KeyboardDismissButton`-komponenten globalt i app-wrapperen
- Komponenten er aktiv på alle sider og vises automatisk ved behov

---

## Filer som opprettes/endres

| Fil | Endring |
|-----|---------|
| `src/hooks/useIOSKeyboard.ts` | **NY** - Hook for å detektere iOS-tastatur |
| `src/components/KeyboardDismissButton.tsx` | **NY** - Ferdig-knapp komponent |
| `src/index.css` | Legge til dynamic viewport height støtte |
| `src/App.tsx` | Importere og bruke KeyboardDismissButton |

---

## Forventet resultat
- Brukere på iPhone ser en "Ferdig"-knapp når de skriver i et felt
- Klikk på knappen lukker tastaturet
- Input-feltene forblir synlige når tastaturet er åpent
- Løsningen påvirker ikke Android eller desktop-brukere
