
# Plan: Synkronisere kalenderoppføringsvalg mellom /kalender og widgeten

## Oversikt
Gjør "Legg til oppføring"-valgene i /kalender identiske med CalendarWidget, og legger til muligheten for å legge til oppføringer direkte fra dagsdialogen.

## Nåværende forskjeller

| Funksjon | CalendarWidget | /kalender side |
|----------|----------------|----------------|
| Hendelse | Ja | Ja |
| Dokument | Ja | Ja |
| Oppdrag | Ja | Ja |
| Nyhet | Ja | **Nei** |
| Annet (egendefinert) | Ja | **Nei** |
| Legg til fra dagsdialog | Ja | **Nei** |

## Endringer som skal gjøres

### 1. Legge til manglende valg i toppmeny-dropdown

Oppdaterer DropdownMenu i kalendersiden med:
- "Nyhet" - åpner AddNewsDialog
- "Annet" - åpner et skjema for egendefinert kalenderoppføring

### 2. Legge til "Legg til"-knapp i dagsdialogen

Når bruker klikker på en dag og åpner dialogen, legges det til en dropdown-meny nederst (som i widgeten) med samme valg:
- Hendelse
- Dokument
- Oppdrag
- Nyhet
- Annet

### 3. Implementere "Annet"-funksjonaliteten

Legger til et skjema for egendefinerte kalenderoppføringer med:
- Tittel (påkrevd)
- Type (valgfri: Oppdrag, Vedlikehold, Dokument, Møte, Annet)
- Beskrivelse (valgfri)
- Tidspunkt

---

## Teknisk implementering

### Nye imports og state i Kalender.tsx

```typescript
import { AddNewsDialog } from "@/components/dashboard/AddNewsDialog";

// Nye state-variabler
const [addNewsDialogOpen, setAddNewsDialogOpen] = useState(false);
const [showAddEventForm, setShowAddEventForm] = useState(false);
const [newEvent, setNewEvent] = useState({
  title: "",
  type: "Annet",
  description: "",
  time: "09:00",
});
```

### Oppdatert handleAddEntry-funksjon

```typescript
const handleAddEntry = (type: 'oppdrag' | 'hendelse' | 'dokument' | 'nyhet' | 'annet') => {
  switch (type) {
    case 'oppdrag':
      setAddMissionDialogOpen(true);
      break;
    case 'hendelse':
      setAddIncidentDialogOpen(true);
      break;
    case 'dokument':
      setDocumentModalState({ document: null, isCreating: true });
      setDocumentModalOpen(true);
      break;
    case 'nyhet':
      setAddNewsDialogOpen(true);
      break;
    case 'annet':
      setShowAddEventForm(true);
      setDialogOpen(true);
      break;
  }
};
```

### Oppdatert toppmeny-dropdown

```typescript
<DropdownMenuContent align="end">
  <DropdownMenuItem onClick={() => handleAddEntry('hendelse')}>
    Hendelse
  </DropdownMenuItem>
  <DropdownMenuItem onClick={() => handleAddEntry('dokument')}>
    Dokument
  </DropdownMenuItem>
  <DropdownMenuItem onClick={() => handleAddEntry('oppdrag')}>
    Oppdrag
  </DropdownMenuItem>
  <DropdownMenuItem onClick={() => handleAddEntry('nyhet')}>
    Nyhet
  </DropdownMenuItem>
  <DropdownMenuItem onClick={() => handleAddEntry('annet')}>
    Annet
  </DropdownMenuItem>
</DropdownMenuContent>
```

### Oppdatert dagsdialog med "Legg til"-knapp

Dialogen utvides med en dropdown-meny nederst:

```typescript
{/* Eksisterende hendelsesliste */}
<div className="space-y-3">
  {selectedEvents.length > 0 ? (...) : (...)}
</div>

{/* Ny: Legg til-knapp med dropdown */}
{!showAddEventForm ? (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button className="w-full gap-2 mt-4">
        <Plus className="w-4 h-4" />
        Legg til
        <ChevronDown className="w-4 h-4 ml-auto" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuItem onClick={() => {
        setAddIncidentDialogOpen(true);
        setDialogOpen(false);
      }}>
        Hendelse
      </DropdownMenuItem>
      {/* ... samme meny som toppmeny */}
    </DropdownMenuContent>
  </DropdownMenu>
) : (
  {/* Skjema for egendefinert oppføring */}
)}
```

### Skjema for "Annet" (egendefinert kalenderoppføring)

```typescript
<div className="space-y-4 mt-4">
  <div className="space-y-2">
    <Label>Tittel *</Label>
    <Input 
      value={newEvent.title}
      onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
    />
  </div>
  
  <div className="space-y-2">
    <Label>Type</Label>
    <Select value={newEvent.type} onValueChange={(v) => setNewEvent({...newEvent, type: v})}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="Oppdrag">Oppdrag</SelectItem>
        <SelectItem value="Vedlikehold">Vedlikehold</SelectItem>
        <SelectItem value="Møte">Møte</SelectItem>
        <SelectItem value="Annet">Annet</SelectItem>
      </SelectContent>
    </Select>
  </div>
  
  <div className="space-y-2">
    <Label>Tidspunkt</Label>
    <Input type="time" value={newEvent.time} onChange={...} />
  </div>
  
  <div className="flex gap-2">
    <Button onClick={handleAddCustomEvent}>Lagre</Button>
    <Button variant="outline" onClick={() => setShowAddEventForm(false)}>Avbryt</Button>
  </div>
</div>
```

---

## Filer som endres

| Fil | Endring |
|-----|---------|
| `src/pages/Kalender.tsx` | Legge til AddNewsDialog, "Annet"-skjema, og "Legg til"-knapp i dagsdialog |

---

## Forventet resultat

- Toppmenyen i /kalender har samme valg som widgeten (Hendelse, Dokument, Oppdrag, Nyhet, Annet)
- Når man klikker på en dag, vises en "Legg til"-knapp med samme valg
- Ved valg av "Annet" vises et enkelt skjema for egendefinert kalenderoppføring
- Full paritet mellom CalendarWidget og /kalender-siden
