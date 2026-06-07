## Fiks: Skjul Kommentar/Godkjenn-knappene mens kommentar-panelet er åpent

**Fil:** `src/components/ProfileDialog.tsx` (godkjenningskortet i Oppfølging-tabben)

I dag rendres knappe-raden ("Kommentar" + "Godkjenn") alltid når man ikke er i Godkjenn-modus, også når kommentar-panelet er åpent. Det fører til at panelet og knappene vises samtidig, og knappene kan havne utenfor skjermen.

**Endring:** Wrap knappe-raden (else-grenen til `approvingMissionId === mission.id`) i en betingelse slik at den kun vises når `commentingMissionId !== mission.id`. Når brukeren trykker "Tilbake" i kommentar-panelet nullstilles `commentingMissionId` og knappene kommer tilbake — som er ønsket oppførsel.

Ingen andre endringer.