
## Fix: bulk_email_users timer ut pga. per-bruker auth-kall

### Rotårsak
`bulk_email_users`-handleren henter bruker-IDs fra `profiles`, og kaller deretter `auth.admin.getUserById()` for hver bruker inne i loopen for å hente e-postadresse. Med mange brukere (f.eks. 20 brukere × 300ms = 6 sekunder bare på auth-kall) timer Edge-funksjonen ut.

### Løsning
Samme fix som ble gjort for `send_to_missed`: endre `select('id')` til `select('id, email')` og bruk `p.email` direkte. Dette eliminerer alle per-bruker auth-kall.

### Fil som endres
| Fil | Linje | Endring |
|-----|-------|---------|
| `supabase/functions/send-notification-email/index.ts` | 307 | `select('id')` → `select('id, email')` |
| `supabase/functions/send-notification-email/index.ts` | 321-336 | Erstatt `getUserById`-kall med direkte `p.email` |

### Konkret kodeendring

Før (linje 307):
```typescript
const { data: profiles } = await supabase.from('profiles').select('id').eq(...)
```

Etter:
```typescript
const { data: profiles } = await supabase.from('profiles').select('id, email').eq(...)
```

Og inne i loopen, erstatt:
```typescript
const { data: { user } } = await supabase.auth.admin.getUserById(p.id);
if (!user?.email) continue;
await client.send({ ...to: user.email... });
sentToEmails.push(user.email);
```

Med:
```typescript
if (!p.email) continue;
await client.send({ ...to: p.email... });
sentToEmails.push(p.email);
```

### Resultat
- Ingen per-bruker auth-kall = dramatisk raskere utsending
- Konsistent med den eksisterende fiksen i `send_to_missed`
- Edge-funksjonen vil ikke lenger time ut ved mange mottakere
- En ugyldig e-post stopper ikke resten av kjeden (fortsatt `try/catch` per bruker)
