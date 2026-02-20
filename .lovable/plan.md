
## Forbedre feilhåndtering i send_to_missed for users-type

### Problem
I `send_to_missed`-blokken hentes e-poster for `recipient_type === 'users'` via en loop som kaller `supabase.auth.admin.getUserById(p.id)` for hver bruker (linje 500-503). Denne loopen mangler:
1. `try/catch` rundt `getUserById` — én feil stopper hele hentingen
2. Henter e-post fra auth i stedet for `profiles.email` som allerede finnes

### Løsning

#### Fix 1 — Bruk `profiles.email` direkte (eliminerer per-bruker auth-kall)
I stedet for:
```typescript
const { data: profiles } = await supabase.from('profiles').select('id')...
for (const p of profiles) {
  const { data: { user } } = await supabase.auth.admin.getUserById(p.id);
  if (user?.email) eligibleEmails.push(user.email);
}
```

Gjøres det slik:
```typescript
const { data: profiles } = await supabase.from('profiles')
  .select('email')
  .eq('company_id', campaign.company_id)
  .eq('approved', true)
  .not('email', 'is', null);
eligibleEmails = (profiles || []).map(p => p.email).filter(Boolean);
```

Dette er raskere, enklere og feiler ikke per bruker.

### Filer som endres
| Fil | Endring |
|-----|---------|
| `supabase/functions/send-notification-email/index.ts` | Erstatt `getUserById`-loop med direkte `profiles.email`-spørring i `send_to_missed`-blokken |

### Resultat
- Ingen enkelt ugyldig e-post kan stoppe kjeden noe sted i koden
- `send_to_missed` for `users`-type blir like robust og rask som `bulk_email_users`
- Eliminerer unødvendige auth-API-kall
