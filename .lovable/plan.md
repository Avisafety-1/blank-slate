

## Fix: 404 på Fly.io ArduPilot Parser

### Problem
Appen returnerer 404 fordi den mangler en rot-rute (`/`). Fly.io (og brukere) som besøker `https://ardupilot-parser.fly.dev/` treffer ingen definert rute. Appen har kun `/health` og `/parse`.

### Løsning
Legg til en `@app.route("/")` i `ardupilot-parser/app.py` som returnerer status OK. Etter denne endringen må du re-deploye med `fly deploy`.

### Endring

**`ardupilot-parser/app.py`** — legg til rot-rute:

```python
@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "ok", "service": "ardupilot-parser"})
```

### Viktig: Auth-mismatch
Koden du limte inn bruker `Authorization: Bearer ...` for auth, men edge function sender `X-Parser-Secret` header. **Filen i repoet bruker allerede riktig `X-Parser-Secret`-metode**, så den er korrekt. Ikke bytt til Bearer-metoden.

### Etter endring
```bash
cd ardupilot-parser
fly deploy
```

Deretter verifiser: `curl https://ardupilot-parser.fly.dev/` skal returnere `{"status": "ok", "service": "ardupilot-parser"}`.

