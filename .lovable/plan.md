

## Plan: Legg til logg ut-knapp på "Avventer godkjenning"-skjermen

### Problem
Når en ikke-godkjent bruker ser "Avventer godkjenning"-skjermen, kan de ikke logge ut. Knappen "Tilbake til innlogging" navigerer til `/auth`, men Auth.tsx oppdager at brukeren allerede er innlogget og sender dem tilbake til `/` — som viser approval-skjermen igjen. En evig loop.

### Løsning
Endre "Tilbake til innlogging"-knappen til å kalle `supabase.auth.signOut()` før navigering. Slik logges brukeren faktisk ut og kan deretter nå innloggingssiden.

### Endring — `src/pages/Index.tsx`

Erstatt `navigate("/auth")`-knappen med en som kaller `signOut` fra AuthContext (eller direkte `supabase.auth.signOut()`), og deretter navigerer til `/auth`:

```tsx
<Button onClick={async () => {
  await supabase.auth.signOut();
  navigate("/auth");
}}>
  {t('auth.backToLogin')}
</Button>
```

### Filer
- `src/pages/Index.tsx` — endre knappen til å logge ut først

