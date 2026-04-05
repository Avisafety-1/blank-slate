

## Fix: "Fullfør registrering"-dialog vises feilaktig ved retur til PWA

### Problem
Når en eksisterende Google-bruker returnerer til PWA-en, kan sesjonstokenet være utløpt. Profil-spørringen mot `profiles`-tabellen returnerer da 0 rader (RLS blokkerer med ugyldig token) uten å gi en feil. `maybeSingle()` returnerer `null`, og koden tolker dette som "ny bruker uten profil" → viser registreringsdialogen.

Flyten som feiler (Auth.tsx linje 119–181):
1. `user` finnes (fra localStorage-cache), men access token er utløpt
2. `profiles`-query returnerer `null` (ikke error, bare ingen rader pga RLS)
3. Koden treffer `else`-grenen (linje 175): "New Google user" → viser registreringsdialog

### Løsning

**`src/pages/Auth.tsx`** — 1 endring i `checkGoogleUserProfile`:

Før profil-spørringen kjøres, kall `ensureFreshSession()` for å sikre at tokenet er gyldig. Dette forhindrer at RLS blokkerer spørringen og gir falsk "ny bruker"-resultat.

```typescript
// Før profile-query (linje ~117)
try {
  await ensureFreshSession();
} catch {
  // Refresh failed — don't show registration dialog on stale session
  console.warn('checkGoogleUserProfile: could not refresh session, skipping');
  googleProfileCheckedRef.current = false;
  setCheckingGoogleUser(false);
  return;
}
```

I tillegg: etter retry-feilen (linje 135–141), ikke redirect til app — vis en toast og la brukeren prøve igjen i stedet for å risikere å vise feil dialog.

### Fil som endres
- `src/pages/Auth.tsx`

