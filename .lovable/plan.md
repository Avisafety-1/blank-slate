

## Svar: Ja, brukeren beholder full kontroll

Planen bruker en `localStorage`-nøkkel (`pwa-push-auto-prompted`) som settes **én gang** ved første forsøk. Deretter vil auto-subscribe aldri kjøre igjen — uansett om brukeren skrur av varsler etterpå.

Flyten:
1. Bruker åpner appen i PWA-modus for første gang → `subscribe()` kalles automatisk → nettleseren viser permission-dialog
2. `localStorage.setItem('pwa-push-auto-prompted', 'true')` settes
3. Bruker kan når som helst skru av varsler i profil-innstillingene
4. Neste gang appen åpnes: `localStorage`-nøkkelen finnes allerede → auto-subscribe kjører **ikke**

Varsler blir altså **ikke** skrudd på igjen automatisk. Det er kun et engangs-forsøk ved første PWA-bruk. Skal jeg implementere dette?

