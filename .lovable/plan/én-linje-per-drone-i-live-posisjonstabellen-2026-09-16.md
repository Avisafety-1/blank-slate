# Én linje per drone i live-posisjonstabellen

I dag lagres én ny rad for hver posisjon (2210 rader på under to døgn, alle fra samme drone). Endringen gjør at hver drone kun har én rad som oppdateres fortløpende.

## Svar på spørsmålet: påvirker det SafeSky-publisering?

Nei. SafeSky-jobben (`safesky-live-publish`) henter allerede kun den nyeste posisjonen per drone og publiserer den. Med én rad per drone blir spørringen enklere og raskere — samme data sendes videre hvert 5. sekund som i dag.

Ingen andre deler av appen bruker historikken:
- Live-dronelisten i «Start flyging» leser kun siste posisjon per serienummer.
- Kartet henter ikke sporlinjer fra denne tabellen (flyspor kommer fra flyloggene).

## Konsekvens å være klar over

Historikken i denne tabellen forsvinner — man kan ikke i ettertid tegne et spor av hvor dronen fløy fra disse dataene. Faktiske flyspor lagres uansett i flyloggene, så dette er kun sanntidsdata.

## Teknisk

1. Migrasjon:
   - Slett duplikater slik at kun nyeste rad per `sn` står igjen.
   - `CREATE UNIQUE INDEX ... ON public.flighthub2_positions (sn)`.
   - Behold eksisterende indekser (de blir bare mindre).
2. `mqtt-broker/bridge.py`: bytt POST til upsert — header `Prefer: resolution=merge-duplicates,return=minimal` og query `?on_conflict=sn`.
3. `supabase/functions/flighthub2-airspace-webhook/index.ts`: reduser `rows` til nyeste rad per `sn` før skriving, og bytt `.insert(rows)` til `.upsert(rows, { onConflict: 'sn' })`.
4. `src/hooks/useLiveDroneSources.ts` og `safesky-live-publish`: fungerer uendret, men kan forenkles senere (ikke nødvendig nå).

Ingen endringer i brukergrensesnittet.
