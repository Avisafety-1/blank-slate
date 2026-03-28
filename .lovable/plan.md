

## Fly.io ArduPilot Parser — Status og Plan

### Hva som finnes i dag
- **Edge function** `supabase/functions/process-ardupilot/index.ts` er ferdig — den sender `.bin` til en Fly.io-parser og normaliserer resultatet
- **Python-parseren som skal kjøre på Fly.io finnes IKKE i prosjektet ennå** — ingen Dockerfile, ingen Python-kode, ingen fly.toml

### Hva som må lages
En minimal Python-tjeneste med 3 filer:

#### 1. `ardupilot-parser/app.py`
- Flask/FastAPI app med én endpoint: `POST /parse`
- Tar imot `.bin`-fil via multipart
- Bruker `pymavlink` til å lese GPS, BAT/BATT, ATT, MODE, MSG
- Returnerer rå JSON (GPS-array, battery-array, attitude-array, modes, messages, vehicle_type)
- Validerer shared secret via `X-Parser-Secret` header

#### 2. `ardupilot-parser/Dockerfile`
```text
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
EXPOSE 8080
CMD ["gunicorn", "-b", "0.0.0.0:8080", "app:app"]
```

#### 3. `ardupilot-parser/requirements.txt`
```
flask
gunicorn
pymavlink
```

#### 4. `ardupilot-parser/fly.toml`
```
app = "ardupilot-parser"
[http_service]
  internal_port = 8080
  force_https = true
```

### Deployment til Fly.io

Lovable kan **ikke** deploye til Fly.io direkte — selv med en API-token. Fly.io-deployment krever `flyctl` CLI som kjører lokalt mot Docker for å bygge og pushe imaget.

**Enkleste fremgangsmåte (3 kommandoer):**

1. Jeg lager alle filene i en mappe `ardupilot-parser/` i prosjektet
2. Du installerer `flyctl` ([fly.io/docs/flyctl/install](https://fly.io/docs/flyctl/install/))
3. Kjør:
```bash
cd ardupilot-parser
fly launch --name ardupilot-parser
fly secrets set PARSER_SECRET="din-hemmelige-nøkkel"
fly deploy
```

4. Legg til secrets i Supabase edge functions:
   - `ARDUPILOT_PARSER_URL` = `https://ardupilot-parser.fly.dev`
   - `ARDUPILOT_PARSER_SECRET` = samme nøkkel som over

### Filer som opprettes

| Fil | Innhold |
|-----|---------|
| `ardupilot-parser/app.py` | Flask + pymavlink parser |
| `ardupilot-parser/Dockerfile` | Python 3.11 container |
| `ardupilot-parser/requirements.txt` | Dependencies |
| `ardupilot-parser/fly.toml` | Fly.io config |

### Alternativ: Forenklet lokal test
Før deploy kan du teste lokalt med `docker build -t parser . && docker run -p 8080:8080 parser` og sende en `.bin`-fil til `localhost:8080/parse`.

