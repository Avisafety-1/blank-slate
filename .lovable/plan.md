

## Analyse

Når brukeren klikker `https://`-lenken i e-posten, åpner nettleseren den. Selv om serveren returnerer `Content-Type: text/calendar` med `Content-Disposition: attachment`, vil de fleste mobile e-postklienter først åpne en nettleser som så laster ned .ics-filen — ikke ideelt.

**`webcal://`-protokollen** er den eneste måten å trigge direkte kalender-abonnement. Problemet er at webmail (Gmail, Outlook web) blokkerer `webcal://`-lenker.

## Løsning

Bytt hovedknappen tilbake til `webcal://` — men **bare for den store CTA-knappen**. Behold `https://`-lenken som backup for kopier/lim-inn. Legg til en tydelig forklaring om at knappen fungerer best fra telefon eller desktop e-postklient (Outlook, Apple Mail), og at webmail-brukere bør kopiere lenken manuelt.

De fleste brukere leser e-post på telefon, der `webcal://` fungerer utmerket i standard e-postapper.

### Endringer i `supabase/functions/send-calendar-link/index.ts`

1. Hovedknappen: endre `href` fra `feedUrl` tilbake til `webcalUrl` med teksten "Åpne i kalenderappen"
2. Legg til en merknad under knappen: "Fungerer fra telefon og desktop e-postklient. Bruker du webmail? Kopier lenken under."
3. Behold `https://`-lenken i "Manuelt oppsett"-seksjonen som fallback for webmail-brukere
4. Fjern den separate sekundære webcal-lenken (duplikat nå)

