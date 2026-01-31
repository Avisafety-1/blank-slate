

# Plan: Fikse Push-varsler

## Problemanalyse

1. **Hovedproblem**: Telefonen har et gammelt push-abonnement opprettet med de forrige VAPID-nøklene
2. **Sekundært problem**: Edge-funksjonen sender push uten payload-kryptering, noe som kan gi tomme notifikasjoner

## Løsning

### Del 1: Brukerhandling (Kreves umiddelbart)

Du må re-abonnere på push-varsler:
1. Gå til profil-innstillinger
2. Deaktiver push-varsler
3. Aktiver push-varsler igjen
4. Test med "Send testvarsling"

### Del 2: Forbedre edge-funksjonen (Teknisk)

Jeg vil oppdatere `send-push-notification`-funksjonen til å bruke `web-push`-biblioteket som håndterer:
- Korrekt VAPID-signering
- Payload-kryptering med mottakerens p256dh og auth-nøkler
- Standard Web Push-protokoll

#### Tekniske endringer

**Fil: `supabase/functions/send-push-notification/index.ts`**

1. Legge til web-push håndtering med npm-pakke eller implementere riktig ECDH/HKDF kryptering
2. Bruke mottakerens `p256dh` og `auth` nøkler fra databasen for å kryptere payloaden
3. Sende kryptert melding så notifikasjonen inneholder tittel og tekst

#### Krypteringsflyt

```text
+------------------+     +------------------+     +------------------+
|  Edge Function   | --> |  Push Service    | --> |  Service Worker  |
|                  |     |  (FCM/Mozilla)   |     |  på telefonen    |
+------------------+     +------------------+     +------------------+
        |                                                  |
        | 1. Krypter payload med                          | 4. Dekrypter og
        |    mottakers p256dh/auth                        |    vis notifikasjon
        |                                                  |
        | 2. Sign med VAPID private key                   |
        |                                                  |
        | 3. Send til push endpoint                       |
        +--------------------------------------------------+
```

### Del 3: Slette gamle abonnementer

Legge til en database-funksjon som sletter alle eksisterende push-abonnementer slik at alle brukere må re-abonnere med de nye nøklene.

#### SQL-migrasjon

```sql
-- Slett alle gamle push-abonnementer for å tvinge re-abonnering
DELETE FROM push_subscriptions;
```

Dette sikrer at ingen har utdaterte abonnementer.

## Oppsummering

| Steg | Handling | Ansvarlig |
|------|----------|-----------|
| 1 | Re-abonner på telefonen | Deg |
| 2 | Oppdater edge-funksjon med korrekt kryptering | Lovable |
| 3 | Slett gamle abonnementer (valgfritt) | Lovable |

Vil du at jeg implementerer forbedringene i edge-funksjonen?

