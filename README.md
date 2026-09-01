# ZnakovniAI – Prepoznavanje znakovnog jezika u stvarnom vremenu

Mrežna aplikacija za prepoznavanje znakovnog jezika u stvarnom vremenu korištenjem kamere, MediaPipe detekcije ruke i Dynamic Time Warping (DTW) usporedbe vremenskih sekvenci. Prepoznate riječi prikazuju se kao tekst uz mogućnost glasovnog reproduciranja (TTS). TensorFlow ostaje podržan kao fallback za stare statične modele.

---

## Arhitektura

```
┌─────────────┐    WebSocket     ┌──────────────────────────────┐
│  React/Vite │ ──────────────▶  │  FastAPI backend              │
│  (frontend) │ ◀──────────────  │  ├─ MediaPipe hand detection  │
└─────────────┘  JSON rezultati  │  ├─ DTW sekvencijski model    │
                                 │  └─ PostgreSQL (uzorci/znakovi)│
                                 └──────────────────────────────┘
```

---

## Preduvjeti

- [Docker](https://docs.docker.com/get-docker/) i [Docker Compose](https://docs.docker.com/compose/install/) (v2+)
- Web kamera
- Preglednik s podrškom za WebRTC (Chrome, Firefox, Edge)

---

## Pokretanje s Dockerom (preporučeno)

### 1. Kloniraj / postavi projekt

```bash
cd /home/borna/sign-language
```

### 2. Pokreni sve servise

```bash
docker compose up --build
```

Prvo pokretanje traje dulje (~5–10 min) jer se preuzimaju i instaliraju TensorFlow, MediaPipe i ostale ovisnosti.

### 3. Otvori aplikaciju

| Servis        | URL                        |
|---------------|---------------------------|
| Aplikacija    | http://localhost           |
| Frontend izravno | http://localhost:3000  |
| Backend API   | http://localhost:8000      |
| API docs      | http://localhost:8000/docs |

---

## Lokalni razvoj (bez Dockera)

### Backend

**Preduvjeti:** Python 3.11+, PostgreSQL

```bash
cd backend

# Kreiraj virtualnu okolinu
python -m venv venv
source venv/bin/activate        # Linux/Mac
# ili: venv\Scripts\activate   # Windows

# Instaliraj ovisnosti
pip install -r requirements.txt

# Postavi varijable okoline
export DATABASE_URL="postgresql+asyncpg://signlang:signlang123@localhost:5432/signlang"
export MODEL_PATH="./app/ml/saved_models"

# (Opcionalno) Pokreni PostgreSQL lokalno s Dockerom
docker run -d --name signlang-db \
  -e POSTGRES_USER=signlang \
  -e POSTGRES_PASSWORD=signlang123 \
  -e POSTGRES_DB=signlang \
  -p 5432:5432 \
  postgres:16-alpine

# Pokreni backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

**Preduvjeti:** Node.js 20+

```bash
cd frontend

# Instaliraj ovisnosti
npm install

# Pokreni dev server
npm run dev
```

Frontend je dostupan na http://localhost:5173

---

## Korištenje aplikacije

### Prepoznavanje (stranica "Prepoznavanje")

1. Kliknite **▶ Pokreni prepoznavanje**
2. Postavite ruku ispred kamere
3. Sustav detektira ruku i prikazuje prepoznati znak s postotkom sigurnosti
4. Backend nakon 2 stabilna obrađena okvira šalje akciju za dodavanje, korekciju ili brisanje teksta
5. Kliknite **🔊 Govori** za glasovno reproduciranje prepoznatog teksta (Web Speech API)

> **Napomena:** Prepoznavanje radi tek nakon što je model treniran (vidi dolje).

### Treniranje modela (stranica "Treniranje")

Aplikacija podržava treniranje vlastitih znakova bez izmjene koda.

#### Korak 1 – Prikupljanje uzoraka

1. Unesite naziv riječi ili znaka (npr. `BOK`, `HVALA`)
2. Postavite ruke u početni položaj
3. Kliknite **⏺ Snimi** i izvedite cijeli znak; 30 kadrova sprema se kao jedna vremenska sekvenca
4. Ponovite snimanje 10–20 puta za istu riječ, različitim prirodnim brzinama
5. Snimite najmanje 2 različite riječi

#### Korak 2 – Treniranje

1. Kliknite **🧠 Izgradi DTW bazu**
2. Referentne sekvence automatski se učitavaju i prepoznavanje je odmah aktivno

Pri prepoznavanju izvedite znak i kratko maknite ruke iz kadra prije sljedeće riječi. Nestanak ruku označava granicu između dviju sekvenci.

#### Dodavanje novih znakova

Nema potrebe za ponovnim treniranjem od nule. Dodajte uzorke za novi znak i pokrenite treniranje još jednom.

---

## Struktura projekta
sign-language/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py              # FastAPI aplikacija
│       ├── config.py            # Konfiguracija
│       ├── database.py          # PostgreSQL (SQLAlchemy async)
│       ├── models/
│       │   └── sign.py          # DB modeli: Sign, TrainingSample
│       ├── schemas/
│       │   ├── sign.py          # Pydantic sheme
│       │   └── recognition.py
│       ├── routers/
│       │   ├── recognition.py   # WebSocket endpoint
│       │   ├── signs.py         # CRUD za znakove
│       │   └── training.py      # Prikupljanje uzoraka + treniranje
│       └── ml/
│           ├── hand_detector.py   # MediaPipe detekcija ruke
│           ├── preprocessor.py    # Normalizacija landmarks
│           ├── sign_recognizer.py # TF inferencija (full pipeline)
│           └── trainer.py         # Izgradnja i treniranje modela
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── components/
│       │   ├── Camera.jsx           # Kamera + landmarks overlay
│       │   ├── RecognitionDisplay.jsx # Prikaz znaka i sigurnosti
│       │   └── TextBuilder.jsx       # Izgrađivač teksta + TTS
│       ├── hooks/
│       │   ├── useWebSocket.js      # WS konekcija s auto-reconnect
│       │   └── useCamera.js         # Pristup kameri
│       ├── pages/
│       │   ├── Home.jsx             # Stranica prepoznavanja
│       │   └── TrainingPage.jsx     # Stranica treniranja
│       ├── services/api.js          # REST API klijent
│       └── utils/normalize.js       # Normalizacija landmarks (JS)
├── nginx/
│   └── nginx.conf                   # Reverse proxy konfiguracija
└── docker-compose.yml
```

---

## API referenca

| Metoda | Putanja | Opis |
|--------|---------|------|
| `WS` | `/api/ws/recognition` | Real-time prepoznavanje |
| `GET` | `/api/recognition/status` | Status modela |
| `GET` | `/api/signs/` | Lista svih znakova |
| `POST` | `/api/signs/` | Dodaj znak |
| `DELETE` | `/api/signs/{id}` | Obriši znak |
| `POST` | `/api/training/samples` | Dodaj uzorak |
| `GET` | `/api/training/samples/count` | Broj uzoraka po znaku |
| `DELETE` | `/api/training/samples/{sign}` | Obriši uzorke znaka |
| `POST` | `/api/training/train` | Pokreni treniranje |
| `GET` | `/api/training/train/status` | Status treniranja |
| `GET` | `/health` | Health check |

Interaktivna dokumentacija: http://localhost:8000/docs

---

## WebSocket protokol

**Klijent → Server:**
```json
{ "frame": "<base64 JPEG>" }
```

**Server → Klijent:**
```json
{
  "hand_detected": true,
  "sign": "A",
  "confidence": 0.94,
  "landmarks": [[x, y, z], ...]
}
```

---

## Tehnički stack

| Sloj | Tehnologije |
|------|------------|
| Backend | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| Detekcija ruke | MediaPipe 0.10 |
| Model prepoznavanja | DTW nad sekvencama od 126 MediaPipe značajki; TensorFlow fallback |
| Baza podataka | PostgreSQL 16 |
| Frontend | React 18, Vite 5 |
| TTS | Web Speech API (browser) |
| Proxy | Nginx |
| Kontejnerizacija | Docker, Docker Compose |

---

## Rješavanje problema

**Kamera ne radi:**
- Provjerite da preglednik ima dopuštenje za kameru (ikona kamere u URL baru)
- Koristite HTTPS ili localhost (getUserMedia zahtijeva sigurni kontekst)

**Backend se ne spaja na bazu:**
- Pričekajte da PostgreSQL container bude zdrav (`docker compose ps`)
- Provjerite DATABASE_URL varijablu

**Model nije učitan:**
- Idite na stranicu Treniranje i prikupite uzorke za najmanje 2 znaka
- Kliknite **Izgradi DTW bazu** i pričekajte završetak

**Sporo prepoznavanje:**
- Smanjite broj referentnih izvedbi ili vrijednost `SEQUENCE_MAX_FRAMES`
- Backend uspoređuje vremenske sekvence na CPU-u

---

## Zaustavljanje

```bash
docker compose down          # zaustavi servise
docker compose down -v       # zaustavi i obriši podatke (baza + model)
```
