

## Fix: Batteritrend-tabben viser flylogg-innhold i stedet for batteridata

### Problem

`TabsContent` på linje 581 bruker `value={activeTab}` som dynamisk matcher *alle* tab-verdier — inkludert `"battery"`. Når brukeren klikker «Batteritrend», vises det generelle loggbok-innholdet (filteredLogs) i stedet for den dedikerte batteritrend-visningen på linje 659.

### Løsning

Endre den generelle `TabsContent` til å **ikke** rendere når `activeTab === "battery"`. Batteritrend-tabben har allerede sin egen separate `TabsContent value="battery"` som viser riktig innhold.

### Endring

**`src/components/resources/EquipmentLogbookDialog.tsx`**

Wrap den generelle TabsContent (linje 581) slik at den bare renderes for de vanlige tabbene:

```tsx
// Linje 581: Endre fra
<TabsContent value={activeTab} className="flex-1 min-h-0 mt-2">

// Til: Ikke render for battery-tab
{activeTab !== 'battery' && (
  <TabsContent value={activeTab} className="flex-1 min-h-0 mt-2">
    ...
  </TabsContent>
)}
```

En liten endring — kun denne ene wrappingen trengs.

