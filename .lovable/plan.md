Plan:

1. Endre scroll-logikken i `src/pages/Oppdrag.tsx` fra å sikte på selve kortets ytterkant til å sikte på kortets header/tittelområde.

2. Beregne posisjonen etter at kortet faktisk er rendret og layouten har stabilisert seg, med en liten ekstra nedjustering slik at vi ikke stopper på bunnen av kortet over.

3. Legge inn `scroll-margin-top`/stabil offset på oppdragskortet som fallback, basert på høyden til sticky header + litt luft.

4. Beholde eksisterende logikk for å vente på lasting, bytte til riktig fane og utvide listen — kun forbedre selve slutt-scrollen.

5. Validere at navigasjon fra `/kart` til `/oppdrag` fortsatt ikke trigger ekstra lang lasting, og at markert oppdrag blir synlig med tittelen øverst/rett under headeren.