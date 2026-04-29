Plan:

1. Flytt den generelle «Gjelder for alle underavdelinger»-toggle for selskapsinnstillinger opp i samme kort/gruppe som de øvrige generelle selskapsinnstillingene.
   - Den plasseres nederst i denne gruppen, etter «Avviksrapport ved flytur» og før «Standard SORA-buffersone».
   - Den skal fortsatt bare vises for morselskap, ikke for underavdelinger.

2. Behold «Standard SORA-buffersone» som egen seksjon med sin egen separate underavdelings-toggle.
   - Teksten for SORA-toggle beholdes/spisses som «SORA-standardverdier» slik det er tydelig at den kun gjelder buffer/flight geography/flyhøyde.
   - Den generelle togglen skal ikke visuelt oppleves som en del av SORA-seksjonen.

3. Ingen databaseendring.
   - Eksisterende felter og handlers brukes videre:
     - `applySettingsToChildren` / `handleToggleApplySettingsToChildren`
     - `applySoraDefaultsToChildren` / `handleToggleApplySoraDefaultsToChildren`
   - Endringen er kun layout/tekst i `ChildCompaniesSection.tsx`.

Teknisk detalj:
- Jeg endrer rekkefølgen i JSX slik at den generelle propagation-togglen ligger før SORA-defaults-blokken, og fjerner/unngår den nåværende plasseringen som får den til å se koblet til SORA-buffersone ut.