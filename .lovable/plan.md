

## Plan: Paginert lasting av oppdrag med bakgrunnslasting av fullførte

### Problem
Alle oppdrag (aktive + fullførte) lastes med alle relasjoner (personell, droner, utstyr, SORA, hendelser, risikovurderinger, dokumenter, flygningslogger) i én stor spørring. For selskaper med mange oppdrag tar dette lang tid.

### Løsning

#### 1. `src/hooks/useOppdragData.ts` — Paginering + bakgrunnslasting

**Aktive oppdrag:**
- Last med `.range(0, 9)` først (10 stk), vis umiddelbart
- Legg til `loadMoreActive()` funksjon som henter neste 10
- Legg til `hasMoreActive` boolean

**Fullførte oppdrag:**
- Lastes i bakgrunnen (allerede `await` på active, deretter fire-and-forget completed)
- Også paginert med `.range(0, 9)` og `loadMoreCompleted()`

**Ny state:**
```typescript
const [activeOffset, setActiveOffset] = useState(0);
const [completedOffset, setCompletedOffset] = useState(0);
const [hasMoreActive, setHasMoreActive] = useState(true);
const [hasMoreCompleted, setHasMoreCompleted] = useState(true);
```

**End