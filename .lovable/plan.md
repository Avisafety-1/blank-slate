

## Flytt "nytt selskap"-registrering til database-trigger

### Problem
Når en ny bruker registrerer seg med "Opprett nytt selskap", lagres registreringsdata i `localStorage`. Etter e-postbekreftelse lander brukeren på `login.avisafe.no` — en annen origin — og `localStorage`-dataene er utilgjengelige. Brukeren ender opp uten profil/selskap/rolle og ser "Avventer godkjenning".

### Løsning
Sende selskapsinformasjon via `user_metadata` i `signUp()`, og la `handle_new_user`-triggeren opprette selskap, profil og rolle server-side. Eksisterende flyt med registreringskode og innlogging for allerede registrerte brukere forblir helt uendret.

### Endringer

**1. Database-migrasjon: Oppdater `handle_new_user()`**

Legger til en ny branch for `new_company_name` i metadata, FORAN den eksisterende `company_id`-branchen. Eksisterende logikk er uendret.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Branch 1: New company registration (via user metadata)
  IF NEW.raw_user_meta_data->>'new_company_name' IS NOT NULL THEN
    INSERT INTO public.companies (navn, org_nummer)
    VALUES (
      NEW.raw_user_meta_data->>'new_company_name',
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'new_company_org_nr', '')), '')
    )
    RETURNING id INTO v_company_id;

    INSERT INTO public.profiles (id, full_name, company_id, email, approved)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), v_company_id, NEW.email, true);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrator');

  -- Branch 2: Existing company with registration code (unchanged)
  ELSIF NEW.raw_user_meta_data->>'company_id' IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, company_id, email, approved)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      (NEW.raw_user_meta_data->>'company_id')::uuid,
      NEW.email,
      false
    );
  END IF;
  RETURN NEW;
END;
$$;
```

**2. `src/pages/Auth.tsx` — "Nytt selskap"-branchen (linje ~377-419)**

- I `signUp()` options.data, legg til `new_company_name` og `new_company_org_nr`
- Fjern `localStorage`-lagring og `completeNewCompanyRegistration`-kall for denne flyten
- Vis bekreftelsesmelding og bytt til login-modus
- Stripe checkout trigges etter innlogging (via en useEffect som sjekker om brukeren er ny admin uten abonnement)

```typescript
// regMode === 'new' branch becomes:
const { data, error } = await supabase.auth.signUp({
  email, password,
  options: {
    emailRedirectTo: 'https://login.avisafe.no/auth',
    data: {
      full_name: fullName,
      new_company_name: newCompanyName.trim(),
      new_company_org_nr: newCompanyOrgNr.trim() || null,
    }
  }
});
if (error) throw error;
toast.success('Bekreft e-posten din for å aktivere kontoen.');
setIsLogin(true);
```

**3. Opprydding i Auth.tsx**

- Fjern `PENDING_NEW_COMPANY_KEY`, `PendingNewCompanyRegistration`-interface, `completeNewCompanyRegistration`-funksjonen
- Fjern useEffect som lytter på `PENDING_NEW_COMPANY_KEY` (linje 144-191)
- Fjern `completingPendingRegistration` state og guard i redirect-useEffect
- Behold all kode-registrerings-logikk og Google OAuth-logikk uendret

**4. Stripe checkout etter første innlogging**

Legg til en useEffect i Auth.tsx (eller i Index.tsx) som sjekker: bruker er administrator, selskap har ingen Stripe-kunde → trigger `create-checkout`. Alternativt kan dette håndteres av eksisterende `SubscriptionGate` som allerede viser betalingsside for brukere uten abonnement.

### Hva forblir UENDRET
- Registrering med selskapskode (`company_id` i metadata) — identisk flyt
- Innlogging for eksisterende brukere — ingen endring
- Google OAuth-flyt — ingen endring
- RLS-policyer — ingen endring
- `SubscriptionGate` og Stripe-integrasjon — fungerer som før

