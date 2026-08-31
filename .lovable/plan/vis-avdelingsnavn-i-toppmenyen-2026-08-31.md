# Vis avdelingsnavn i toppmenyen

Når et selskap har avdelingsstruktur, skal navnet på avdelingen du står i vises i headeren, rett til høyre for AviSafe-logoen (der du markerte i skjermbildet).

## Oppførsel

- Vises kun når brukerens aktive selskap er en avdeling under et morselskap (altså når det finnes et morselskap for det aktive selskapet).
- Teksten viser avdelingsnavnet, med morselskapets navn som mindre/dempet forklaring: `Morselskap › Avdeling`.
- Står du i selve morselskapet, vises ingenting (uendret utseende i dag).
- Klikk på navnet åpner ingenting nytt — det er ren informasjon. Selskapsbytte skjer fortsatt via bygningsikonet.
- Responsivt: på mobil vises kun avdelingsnavnet, forkortet med ellipse hvis det er for langt, slik at hamburgermenyen ikke presses ut.

## Teknisk

- Endring kun i `src/components/Header.tsx` (presentasjon).
- Bruker eksisterende felter fra `useAuth()`: `companyName`, `parentCompanyName`, `parentCompanyId`. Ingen nye spørringer mot databasen.
- Vilkår for visning: `parentCompanyId && parentCompanyName && parentCompanyName !== companyName`.
- Ny badge plasseres etter logoknappen i flex-raden, med `truncate` og `min-w-0` for å unngå layoutbrudd.
- i18n: ingen nye brukersynlige strenger utover navnene selv (skilletegn `›`); eventuell aria-label legges i både `no.json` og `en.json`.
