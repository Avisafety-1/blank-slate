

## Fix: Auto-scroll og lukkeknapp for regelverkssøk

### Problem
1. `chatEndRef.current?.scrollIntoView({ behavior: "smooth" })` scroller hele siden ned når nye meldinger kommer, fordi `scrollIntoView` påvirker hele viewport — ikke bare chat-containeren.
2. Det mangler en tydelig lukkeknapp på regelverks-chatten.

### Løsning

**Fil: `src/components/dashboard/AISearchBar.tsx`**

1. **Fjern auto-scroll via `scrollIntoView`**: Erstatt `useEffect` som kaller `chatEndRef.current?.scrollIntoView()` med en som scroller selve chat-containeren internt. Legg til en `ref` på GlassCard-containeren og bruk `containerRef.current.scrollTop = containerRef.current.scrollHeight`.

2. **Legg til lukkeknapp (X)**: Legg til en `X`-ikon-knapp øverst til høyre i regelverks-chatten som tømmer `chatMessages` og lukker panelet. Importer `X` fra `lucide-react`.

