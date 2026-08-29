# Mobildekningskart – beholdes som i dag

## Konklusjon fra gjennomgangen

- Nkoms karttjeneste (WMS) har kun **2023-utgaven** av 4G/5G-arealdekning. Nyere tall (2024/2025) finnes kun som kommune-/fylkesstatistikk (XLSX), ikke som geografisk kartlag.
- Nkom publiserer **ikke operatørdelte geografiske data** (Telenor/Telia/Ice). Operatørene har egne dekningskart på sine nettsider, men ingen offisielle tredjeparts-APIer.

## Beslutning

Ingen kodeendring. De eksisterende kartlagene «Mobildekning 4G» og «Mobildekning 5G» (Nkom 2023, arealdekning) beholdes uendret, med dagens fargekoding og popup med prosentfordeling og forbehold.

## Konsekvens

- Ingen endringer i kode, database eller edge functions.
- Popup-forbeholdet i kartet viser fortsatt at dataene er arealdekning fra 2023 og ikke sanntid eller operatørspesifikt.
