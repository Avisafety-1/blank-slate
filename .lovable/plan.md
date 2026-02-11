

## Fjern manuelle AIP-restriksjonsoner

### Bakgrunn
Etter synkronisering med OpenAIP finnes det 16 manuelt opprettede soner som skaper duplikater (f.eks. R-102 vises to ganger). Disse skal slettes fra databasen.

### Endring

**1. Slett manuelle soner fra databasen**
- Kjor en SQL-kommando som sletter alle rader i `aip_restriction_zones` der `source = 'manual'`
- Dette fjerner alle 16 manuelle soner og eliminerer duplikatene

```text
DELETE FROM aip_restriction_zones WHERE source = 'manual';
```

Ingen kodeendringer er nodvendige -- kartvisningen henter fra samme tabell og vil automatisk bare vise de offisielle OpenAIP-sonene etter slettingen.

### Pavirkning
- R-102, R-103, R-104, R-201, R-202, R-203, R-301, P-001, D-301 til D-320 vises bare en gang (fra OpenAIP)
- Kartlaget, luftromsadvarsler og popups fungerer som for
- Ingen endring i kode

