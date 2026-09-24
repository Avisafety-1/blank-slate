# Stoppe «blinkingen» 5–10 sekunder etter innlogging – uten risiko for utestenging

## Mål
Appen skal ikke hoppe eller lukke åpne menyer etter innlogging. Ingen skal bli låst ute eller få feil ved innlogging som følge av endringen.

## Sikkerhetsprinsipp (gjelder alle steg)
- Vi endrer bare **hvordan og når skjermen tegnes på nytt**, ikke **hvem som slipper inn**.
- Ingen endring i godkjenning, roller, MFA, abonnementsregler eller database.
- Er vi i tvil om en tilstand, skal appen alltid velge «vis innholdet» (slik den gjør i dag), aldri «lås ute».
- Siden ingen selskaper har Stripe-abonnement i dag, skal abonnementssjekken aldri kunne stenge noen ute som i dag slipper inn.

## Steg
1. **Bekrefte årsaken først.** Logge inn i forhåndsvisningen, åpne en meny og registrere nøyaktig hva som oppdateres i sekundene etter innlogging (ny profilhenting, abonnementssjekk, eller innlastingsvisning). Rettingen gjøres kun på det som faktisk forårsaker blinket.
2. **Ikke vise innlastingsvisning på nytt etter første visning.** Når siden først er vist, skal bakgrunnsoppdateringer (profil/abonnement) oppdatere tall og menyer stille, ikke bytte ut hele siden.
3. **Unngå unødvendige oppdateringer.** Hvis bakgrunnssjekken returnerer samme verdier som allerede vises (samme selskap, godkjent-status, rolle, abonnement), oppdateres ikke skjermen i det hele tatt.
4. **Abonnementssjekken bak skjermen.** Den skal ikke lenger sette appen i «laster»-modus når vi allerede har en kjent status fra samme økt.

## Kontroll før ferdig
- Innlogging med vanlig bruker, admin, bruker som venter på godkjenning og bruker med totrinnsbekreftelse – alle skal oppføre seg som før.
- Åpen meny skal forbli åpen 30 sekunder etter innlogging.
- Bytte av selskap, utlogging og tidsavbrudd ved inaktivitet fungerer som før.

## Teknisk
- `AuthContext.tsx`: i `refreshAuthState` bare kalle `setX` når verdien faktisk endres (sammenligne med gjeldende ref); ikke sette `authRefreshing=true`/`subscriptionLoading=true` på bakgrunnsoppdateringer etter første lasting; `fireSubscriptionCheck` beholder forrige verdi til svar foreligger.
- `App.tsx`/`SubscriptionGate.tsx`: behold dagens «vis innhold ved usikkerhet»-logikk; kun fjerne remount/spinner etter `everLoaded`.
- Ingen endringer i edge-funksjoner, RLS eller database.
- Verifisering: Playwright med minted økt, `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
