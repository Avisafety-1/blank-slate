

## Fix: Legg til `user_id` i bulk-insert til `pending_dji_logs`

### Problem
Insertet til `pending_dji_logs` mangler `user_id`-feltet. Databasen krever dette feltet (NOT NULL constraint), og alle bulk-opplastinger feiler med: `"null value in column \"user_id\" of relation \"pending_dji_logs\" violates not-null constraint"`.

### Løsning
Legg til `user_id: session.user.id` i insert-objektet på linje 676-689. Brukerens ID er allerede tilgjengelig via `useAuth()` (eller session).

### Endring i `src/components/UploadDroneLogDialog.tsx`

Linje 676-689 — legg til `user_id`:
```typescript
.insert({
  company_id: localCompanyId,
  user_id: userId,  // <-- legg til denne
  dji_log_id: data.sha256Hash || crypto.randomUUID(),
  // ... resten uendret
})
```

`userId` hentes fra `useAuth()` eller `supabase.auth.getUser()` som allerede er tilgjengelig i komponenten.

En enkelt linje fikser hele problemet.

