

## Fix: Dokumentåpning fungerer ikke (popup blokkeres på mobil)

**Problem**: `window.open()` kalles etter en asynkron `createSignedUrl`-forespørsel. På mobil (og mange nettlesere) blokkeres popup-vinduer som ikke åpnes direkte i en brukergest. Når den signerte URL-en er klar, er brukergest-konteksten allerede "brukt opp", og nettleseren blokkerer åpningen stille.

**Løsning**: Åpne et blankt vindu **før** den asynkrone forespørselen, og sett `location` etterpå. Dette beholder brukergest-konteksten.

**Endring i `DroneDetailDialog.tsx`** (linje 393-403):

```typescript
const handleOpenDocument = async (filUrl: string) => {
  if (!filUrl) return;
  // Open window immediately to preserve user gesture context (mobile popup blocker)
  const newWindow = window.open("about:blank", "_blank");
  const { data } = await supabase.storage
    .from("documents")
    .createSignedUrl(filUrl, 300);
  if (data?.signedUrl && newWindow) {
    newWindow.location.href = data.signedUrl;
  } else {
    newWindow?.close();
    toast.error("Kunne ikke åpne dokument");
  }
};
```

Én fil endres: `src/components/resources/DroneDetailDialog.tsx`

