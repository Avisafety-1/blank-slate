## Mål
Redusere overflødige marginer/padding i `ProfileDialog` (spesielt "Follow-up"-tabben) og optimalisere `InboxTab` for mobil, uten å endre desktop-layoutet nevneverdig.

## Rotårsaker (observert i koden)

1. **Dobbel horisontal padding på mobil:** `DialogContent` har shadcn-default `p-6`, i tillegg legger `<ScrollArea className="... pr-4">` på ekstra høyre-padding, og hver `Card` + `CardContent` har sin egen `p-6`. På mobil (bilder viser 360-390px bredde) etterlater dette knapt plass til tekst inne i badges og titler.
2. **Stor topp-margin på tab-innhold:** `TabsContent` for `incidents` og `inbox` bruker `mt-20 md:mt-14 lg:mt-4`. `mt-20` (80px) er langt mer enn TabsList tar på mobil når den wrapper — den ble satt for et gammelt oppsett med 3 rader triggers.
3. **Follow-up-kort padding:** Missions-kortet bruker `p-4` + er inne i `CardContent` (p-6) + inne i `TabsContent` som allerede har intern padding fra dialog. Tre lag padding = "doble marginer".
4. **InboxTab** bruker `Card` + `CardHeader` + `CardContent` med default shadcn padding — for tett på mobil, og TabsList med tre triggere (`all/unread/done`) trenger justering for smal skjerm.

## Endringer

### `src/components/ProfileDialog.tsx`
- `DialogContent`: legg til responsive padding-overstyring `p-3 sm:p-6` og `w-[calc(100vw-1rem)] sm:w-[95vw]` slik at dialogen selv får smalere ytre margin på mobil.
- `ScrollArea`: fjern `pr-4` på mobil (`pr-0 sm:pr-4`) siden dialogens padding allerede sørger for luft.
- Alle relevante `TabsContent` (incidents, inbox, subscription, evt. andre som bruker `mt-20 md:mt-14 lg:mt-4`): endre til `mt-4 lg:mt-4` — TabsList wrapping trenger ikke lenger 80px reservert plass etter oppryddingen tidligere denne uken. Verifiser visuelt at TabsList ikke overlapper etter endringen; hvis den fortsatt gjør det på smalest bredde, bruk `mt-8 sm:mt-4`.
- Follow-up incidents `Card`: endre `CardContent` til `p-3 sm:p-6`, og den indre missions-kort-diven `p-4` til `p-3 sm:p-4`. Badges: legg til `whitespace-nowrap` slik at små badges (SORA:, status) ikke wrapper stygt.
- Follow-up incident-radene (linje 2431): `px-2 py-2` → `px-2 py-2 gap-2` og la `.flex-1` få `min-w-0` slik at lang tittel truncateres istedenfor å presse badge ut.

### `src/components/profile/InboxTab.tsx`
- Ytre `Card`: legg til `border-0 sm:border shadow-none sm:shadow` slik at kortet blir "flat" på mobil (fjerner dobbelt-ramme-følelse mot dialog).
- `CardHeader`: `p-3 sm:p-6` + endre header-layoutet til `flex-col sm:flex-row` slik at TabsList (all/unread/done) legger seg under tittelen på mobil istedenfor å presse den.
- `CardContent`: `p-3 sm:p-6 pt-0`.
- Meldingslisten `<li>`: `py-3 px-1` → `py-2.5 px-1`, og legg til `min-w-0` på tekst-diven (er allerede der) — sørg for at både subject-linje og meta-linje har `truncate` (subject har det, meta har det).
- `Sheet` for detaljvisning: legg til `p-4 sm:p-6` på `SheetContent` og la body-teksten få `text-sm leading-relaxed`.

## Ikke i scope
- Vi endrer ikke selve tab-strukturen (antall tabs, ikoner) eller innhold-logikken.
- Vi rører ikke i18n-nøkler — kun layout/spacing.
- Ingen backend-/data-endringer.

## Verifisering
- Sjekk med `preview_ui--set_preview_device_viewport mobile` at Follow-up-kortene ikke lenger har dobbelt "innramming" og at tittel + badges får plass.
- Sjekk desktop (1280px) at kortene fortsatt ser like romslige ut som før (padding gjenopprettes ved `sm:`).
