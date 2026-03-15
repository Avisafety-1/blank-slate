

## Plan: Legg til «Nytt selskap»-alternativ i Google-registreringsdialogen

### Problem
Google-registreringsdialogen (linje 718-787 i Auth.tsx) støtter kun selskapskode. E-post-registrering har allerede tabs for «Selskapskode» og «Nytt selskap».

### Endringer i `src/pages/Auth.tsx`

1. **Ny state**: `googleRegMode: 'code' | 'new'`, `googleNewCompanyName`, `googleNewCompanyOrgNr`

2. **Google-registreringsdialogen** får samme Tabs-komponent som e-post-registrering:
   - «Selskapskode» (eksisterende kode-felt)
   - «Nytt selskap» (selskapsnavn + org.nr)

3. **Ny submit-handler for «Nytt selskap»-modus**: `handleGoogleRegistrationSubmit` utvides med en gren for `googleRegMode === 'new'` som:
   - Oppretter selskap via `supabase.from('companies').insert(...)` 
   - Oppretter profil med `company_id` og `approved: true` (grunnlegger = auto-godkjent)
   - Tildeler admin-rolle
   - Alternativt: setter `user_metadata` med `new_company_name` og lar database-triggeren `handle_new_user` håndtere det (samme som e-post-flyten)

4. **Knapp-tekst** tilpasses modus: «Opprett selskap og konto» vs «Registrer»

### Viktig
Bruker samme mønster som e-post-registreringen (`regMode === 'new'`) for konsistens. Database-triggeren `handle_new_user` bør allerede håndtere `new_company_name` i metadata, men må verifiseres — Google-brukere kan allerede ha en auth-bruker uten profil, så vi kan trenge direkte insert i stedet for å stole på triggeren.

