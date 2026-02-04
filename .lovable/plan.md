
# Plan: Fikse "duplicate key value" feil ved SORA-lagring

## Problemanalyse

### Identifisert årsak
Tabellen `mission_sora` har en UNIQUE constraint på `mission_id`:
```sql
CONSTRAINT mission_sora_mission_id_key UNIQUE (mission_id)
```

Dette betyr at det kun kan eksistere én SORA-analyse per oppdrag.

### Hvorfor feilen oppstår
Koden i `SoraAnalysisDialog.tsx` bruker en to-stegs prosess:
1. Sjekker om SORA eksisterer (`fetchExistingSora`)
2. Kjører enten UPDATE eller INSERT basert på resultatet

**Race condition:** Mellom disse stegene kan en annen prosess (dobbeltklikk, annen bruker, tidsforskyvning) ha opprettet en SORA. Da prøver koden å kjøre INSERT på en `mission_id` som allerede finnes → "duplicate key value"-feil.

---

## Løsning

### Bruk UPSERT i stedet for INSERT/UPDATE

Supabase støtter `upsert()` med `onConflict`-parameter som håndterer dette atomisk:

**Fra (nåværende problematisk kode):**
```typescript
if (existingSora) {
  await supabase.from("mission_sora").update(soraData).eq("id", existingSora.id);
} else {
  await supabase.from("mission_sora").insert({...soraData, company_id, prepared_by, prepared_at});
}
```

**Til (robust løsning):**
```typescript
await supabase.from("mission_sora").upsert({
  ...soraData,
  company_id: companyId,
  prepared_by: existingSora?.prepared_by || user.id,
  prepared_at: existingSora?.prepared_at || new Date().toISOString(),
}, { 
  onConflict: 'mission_id',
  ignoreDuplicates: false  // Oppdater eksisterende rad
});
```

---

## Tekniske detaljer

### Fil som endres
`src/components/dashboard/SoraAnalysisDialog.tsx`

### Endringer i handleSave-funksjonen (linje 156-224)

Erstatt hele if/else INSERT/UPDATE-blokken med én upsert-operasjon:

```typescript
const handleSave = async () => {
  if (!selectedMissionId) {
    toast.error("Vennligst velg et oppdrag");
    return;
  }

  if (!companyId) {
    toast.error("Kunne ikke finne selskaps-ID");
    return;
  }
  
  if (!user?.id) {
    toast.error("Kunne ikke finne bruker-ID");
    return;
  }

  setLoading(true);

  const soraData = {
    mission_id: selectedMissionId,
    company_id: companyId,
    environment: formData.environment || null,
    conops_summary: formData.conops_summary || null,
    igrc: formData.igrc ? parseInt(formData.igrc) : null,
    ground_mitigations: formData.ground_mitigations || null,
    fgrc: formData.fgrc ? parseInt(formData.fgrc) : null,
    arc_initial: formData.arc_initial || null,
    airspace_mitigations: formData.airspace_mitigations || null,
    arc_residual: formData.arc_residual || null,
    sail: formData.sail || null,
    residual_risk_level: formData.residual_risk_level || null,
    residual_risk_comment: formData.residual_risk_comment || null,
    operational_limits: formData.operational_limits || null,
    sora_status: formData.sora_status,
    approved_by: formData.approved_by || null,
    approved_at: formData.sora_status === "Ferdig" && !existingSora?.approved_at 
      ? new Date().toISOString() 
      : existingSora?.approved_at || null,
    // Bevar original prepared_by og prepared_at ved oppdatering
    prepared_by: existingSora?.prepared_by || user.id,
    prepared_at: existingSora?.prepared_at || new Date().toISOString(),
  };

  try {
    const { error } = await supabase
      .from("mission_sora")
      .upsert(soraData, { 
        onConflict: 'mission_id',
        ignoreDuplicates: false
      });

    if (error) throw error;
    
    toast.success(existingSora ? "SORA-analyse oppdatert" : "SORA-analyse opprettet");
    onSaved?.();
    onOpenChange(false);
  } catch (error: any) {
    console.error("Error saving SORA:", error);
    toast.error("Kunne ikke lagre SORA-analyse: " + error.message);
  } finally {
    setLoading(false);
  }
};
```

---

## Forventet resultat

Etter implementering:
- Ingen "duplicate key value"-feil ved lagring av SORA
- Race conditions håndteres automatisk av databasen
- Atomisk operasjon garanterer dataintegritet
- Original `prepared_by` og `prepared_at` bevares ved oppdateringer
