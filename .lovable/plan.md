Feilen er fortsatt Rust/Cargo-versjon, men loggen viser nå tydelig at `rust:1.84-slim` ikke er nok:

- `idna_adapter v1.2.2` krever `edition2024`
- flere `icu_* v2.2.0`-pakker krever Rust `1.86`
- fordi `Cargo.lock` mangler, henter Docker-builden nyeste transitive dependencies hver gang

Plan:

1. Oppdater Dockerfile
   - Endre build-image fra:
     ```Dockerfile
     FROM rust:1.84-slim AS build
     ```
     til:
     ```Dockerfile
     FROM rust:1.86-slim AS build
     ```
   - Dette matcher dependency-kravet som Fly.io-loggen viser.

2. Legg til og bruk `Cargo.lock`
   - Generer/legg inn `dji-parser/Cargo.lock` for parser-appen.
   - Oppdater Dockerfile slik at dependency cache kopierer både `Cargo.toml` og `Cargo.lock`:
     ```Dockerfile
     COPY Cargo.toml Cargo.lock ./
     ```
   - Dette gjør builden stabil, så Fly.io ikke plutselig plukker nyere crates som krever enda nyere Rust senere.

3. Sjekk Fly-app-navn
   - `dji-parser/fly.toml` har:
     ```toml
     app = "avisafe-djilog-parser"
     ```
   - Men kommandoen din bruker:
     ```bash
     -a djilogparser
     ```
   - Build-feilen skyldes ikke dette, men etter build-fix bør vi sikre at du deployer til riktig app-navn. Enten bruker du `avisafe-djilog-parser`, eller så oppdaterer vi `fly.toml` hvis den faktiske appen heter `djilogparser`.

4. Etter endring
   - Deploy på nytt fra `dji-parser/`:
     ```bash
     fly deploy --app avisafe-djilog-parser
     ```
   - Test:
     ```bash
     curl https://avisafe-djilog-parser.fly.dev/health
     ```
     Forventet svar: `ok`

Hvis du godkjenner, gjør jeg endringene i `dji-parser/Dockerfile` og legger inn dependency-locking slik at Fly.io-builden blir mer robust.

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>