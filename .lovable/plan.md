

## Legg til tegnforklaring (legend) for SSB Arealbruk-laget

### Hva dette gjor
Nar kartlaget "Befolkning / Arealbruk (SSB)" er aktivt, vises en kompakt tegnforklaring (legend) i bunnen av kartet som forklarer hva de ulike fargekodene betyr.

Legenden skjules automatisk nar laget slas av.

### Endringer

#### 1. Ny komponent: `src/components/ArealbrukLegend.tsx`

En liten komponent som viser fargekodene:

| Farge | Kategori |
|-------|----------|
| Rod/Rosa | Bolig |
| Bla/Lilla | Naering/Kontor |
| Gra/Mork | Industri/Lager |
| Gronn | Fritid/Sport/Park |
| Gul/Oransje | Offentlig tjeneste |
| Brun | Transport |

Komponenten er en absolutt-posisjonert boks i bunnen av kartet med `z-[1000]`, halvgjennomsiktig bakgrunn og backdrop-blur -- samme stil som vaerhint og ruteinstruksjoner som allerede finnes i kartet.

#### 2. `src/components/OpenAIPMap.tsx`

Legg til legenden i JSX-returen (ca. linje 2387), betinget pa at arealbruk-laget er aktivt:

```typescript
{layers.find(l => l.id === "arealbruk")?.enabled && (
  <ArealbrukLegend />
)}
```

### Tekniske detaljer

- Legenden plasseres `absolute bottom-4 left-1/2 -translate-x-1/2` for a ligge sentrert i bunnen
- Bruker Tailwind-klasser med `bg-background/95 backdrop-blur-sm` for konsistens med andre kart-overlays
- Fargeprovene vises som sma fargede rundinger med tekst ved siden av, i en kompakt horisontal rad
- Ingen nye avhengigheter

**Filer som opprettes:**
- `src/components/ArealbrukLegend.tsx`

**Filer som endres:**
- `src/components/OpenAIPMap.tsx` (import + 3 linjer JSX)

