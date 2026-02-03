

# Plan: Fiks sending av kunde-velkomstepost med vedlegg

## Problemsammendrag
E-post med vedlegg sendes ikke til nye kunder. Dette skyldes sannsynligvis at store PDF-vedlegg forårsaker timeout eller minneproblemer i Edge Function.

## Rotårsak
1. Edge Functions har 10-sekunders timeout - store vedlegg kan føre til timeout under nedlasting og prosessering
2. Feil blir ignorert i frontend - brukeren får ikke vite at e-posten feilet
3. Manglende logging av vedleggsstørrelse gjør debugging vanskelig

---

## Implementeringsplan

### Steg 1: Forbedre feilhåndtering i frontend
**Fil:** `src/components/admin/CustomerManagementDialog.tsx`

- Vis en advarsel til brukeren hvis e-postsending feiler (i stedet for å ignorere feilen stille)
- Legg til mer detaljert logging

### Steg 2: Legg til størrelseslogging og validering i vedleggsfunksjonen
**Fil:** `supabase/functions/_shared/attachment-utils.ts`

- Logg størrelsen på hvert vedlegg som lastes ned
- Sett en maksgrense på f.eks. 5 MB per vedlegg
- Hopp over vedlegg som er for store og logg en advarsel

### Steg 3: Forbedre Edge Function med timeout-håndtering
**Fil:** `supabase/functions/send-customer-welcome-email/index.ts`

- Legg til try-catch rundt vedleggsnedlasting med timeout
- Hvis vedlegg tar for lang tid, send e-post uten vedlegg
- Returner informasjon om at vedlegg ble hoppet over

### Steg 4: Test funksjonen
- Verifiser at e-post sendes uten vedlegg
- Test med små vedlegg (under 1 MB)
- Test med store vedlegg for å sikre graceful degradation

---

## Tekniske detaljer

### Maksimal vedleggsstørrelse
Anbefalt grense: **5 MB per vedlegg, 10 MB totalt**

E-post med vedlegg over denne størrelsen vil:
1. Sende e-posten uten vedleggene
2. Logge en advarsel
3. Returnere suksess med info om at vedlegg ble hoppet over

### Kodeendringer

**attachment-utils.ts - Legg til størrelsessjekk:**
```typescript
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// I nedlastingsløkken:
const arrayBuffer = await fileData.arrayBuffer();
if (arrayBuffer.byteLength > MAX_ATTACHMENT_SIZE_BYTES) {
  console.warn(`Attachment ${doc.fil_navn} is ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB - skipping (max ${MAX_ATTACHMENT_SIZE_BYTES / 1024 / 1024} MB)`);
  continue;
}
```

**CustomerManagementDialog.tsx - Vis feilmelding:**
```typescript
} catch (emailError) {
  console.error("Failed to send welcome email:", emailError);
  toast.warning("Kunde opprettet, men velkomst-e-post kunne ikke sendes");
}
```

---

## Forventet resultat
- E-poster sendes pålitelig selv med vedlegg
- Store vedlegg hoppes over automatisk i stedet for å krasje
- Brukeren får beskjed hvis noe går galt
- Logging gjør debugging enklere i fremtiden

