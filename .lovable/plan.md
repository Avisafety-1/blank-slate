# Lås DJI-sync til Avisafe for superadmins

## Problem
Superadmins kan bytte selskap. Når de trykker "Synk" i et annet selskap (f.eks. Tensio), havner DJI-loggene der i stedet for i Avisafe.

## Løsning
I `supabase/functions/dji-sync-enqueue/index.ts`: hvis brukeren har rollen `superadmin` (sjekk `user_roles`), overstyr `resolvedCompanyId` til Avisafe sin `id` (`a6698b2d-8464-4f88-9bc4-ebcc072f629d`). Gjør dette før selskaps-/feature-flag-sjekken.

For alle andre brukere: ingen endring.

## Endring
Én funksjon, ett sted:
```ts
const { data: isSuper } = await serviceClient
  .from("user_roles")
  .select("role")
  .eq("user_id", cred.user_id)
  .eq("role", "superadmin")
  .maybeSingle();
if (isSuper) {
  resolvedCompanyId = "a6698b2d-8464-4f88-9bc4-ebcc072f629d"; // Avisafe
}
```

## Hva dette IKKE endrer
- Vanlige brukere / admins: uendret.
- Cron-logikk: uendret (pin fungerer videre).
- UI / credential-lagring: uendret.
