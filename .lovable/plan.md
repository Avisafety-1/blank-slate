

## Endre utstyrsvelger til dropdown + vise auto-match-indikasjon for batteri

### Problem
I loggbok-seksjonen vises utstyr som en checkbox-liste, mens pilot og drone bruker Select-dropdown. Brukeren ønsker konsistent UI. I tillegg mangler «Auto-matchet via SN»-indikasjonen for batteri (den finnes allerede for drone).

### Endringer

**`src/components/UploadDroneLogDialog.tsx`** — `renderLogbookSection()`

1. **Erstatt checkbox-listen** (linje 1108-1129) med en `<Select>`-dropdown for å legge til utstyr. Valgt utstyr vises som små fjernbare chips/tags under dropdown-en. Dropdown-en filtrerer bort allerede valgte items.

2. **Legg til auto-match-indikasjon for batteri** rett under utstyrs-selectoren — identisk med drone-mønsteret (linje 1101-1105):
   ```
   {selectedEquipment.some(eqId => {
     const eq = equipmentList.find(e => e.id === eqId);
     return eq && result?.batterySN && eq.serienummer?.trim() === result.batterySN.trim();
   }) && (
     <p className="text-xs text-green-600 ...">
       <CheckCircle /> Batteri auto-matchet via SN
     </p>
   )}
   ```

### UI-layout (equipment-seksjon)
```text
┌─ Utstyr ──────────────────────────┐
│ [▾ Velg utstyr                   ]│  ← Select dropdown
│                                    │
│ [Batteri ABC ✕] [Kamera XYZ ✕]   │  ← Chips for valgte
│ ✅ Batteri auto-matchet via SN    │  ← Grønn indikasjon
└────────────────────────────────────┘
```

Ingen andre filer endres.

