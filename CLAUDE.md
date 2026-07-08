# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Geldgrip ("grip on my money") is a self-hosted budget planner: it ingests KBC bank CSV exports, auto-categorizes transactions with a learned model, and lets the user review/correct suggestions in a queue. FastAPI backend + React (Vite) frontend, single SQLite DB, shipped as one Docker container with the frontend build embedded into the backend.

## Commands

### Backend (from `backend/`)
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python seed.py              # idempotent: inserts the 14 default categories if missing
uvicorn main:app --reload   # http://localhost:8000, docs at /docs
```
There is no test suite, linter, or formatter configured for either side — don't invent commands for them.

### Frontend (from `frontend/`)
```bash
npm install
npm run dev       # http://localhost:5173, proxies /api/* to localhost:8000 (see vite.config.js)
npm run build     # outputs directly to ../backend/static (outDir in vite.config.js)
```

### Full stack via Docker
```bash
docker compose up -d --build   # builds frontend, embeds it in backend image, serves both on :8000
```
The Dockerfile is a two-stage build: stage 1 builds the Vite frontend into `backend/static`, stage 2 is the Python image that serves it. `backend/start.sh` runs `seed.py` then launches uvicorn — that's the container's actual entrypoint, not `uvicorn` directly.

## Architecture

**Data flow for a CSV upload:** `POST /api/upload` → `csv_parser.parse_kbc_csv` turns raw bytes into a list of transaction dicts → `crud.bulk_insert_transactions` dedupes against existing rows by `fingerprint` (sha256 of date+amount+description+counterparty+account) and inserts new ones → `categorizer.predict_bulk` immediately fills in `suggested_category_id`/`suggested_confidence` for anything unapproved. Nothing is auto-approved on import; everything lands in the review queue.

**Categorization (`backend/categorizer.py`) is a single in-process `Categorizer` instance held as module-level state in `main.py`** — it is *not* persisted to the DB or disk. It rebuilds itself from scratch on every `learn()` call by re-querying all approved/manually-categorized transactions, so a server restart means the model is empty until enough transactions exist and something triggers `learn()` again (approve, correct, or the "approve all" bulk action). Prediction priority, in order, first match wins:
1. Exact normalized-counterparty match against merchant rules built from history (confidence scales with how many times that merchant was seen: `0.5 + count*0.1`, capped at 0.98).
2. Fuzzy counterparty match (`difflib.SequenceMatcher`) against the same merchant rules, only above a 0.82 similarity ratio.
3. TF-IDF + ComplementNB classifier trained on `counterparty + description` text of all approved transactions — only kicks in once `learn()` has seen ≥3 approved transactions across ≥2 distinct categories, and only returns a prediction above 0.35 confidence.
4. No suggestion (`None`, confidence 0) → falls into the review queue uncategorized.

`learn()` is called from `main.py` after any mutation that could change the training set (manual category edit, single approve, approve-all) — if you add a new way to approve/correct a transaction, make sure to call `categorizer.learn(db)` afterward or suggestions will go stale.

**CSV parsing (`backend/csv_parser.py`) is KBC-format-specific but built to tolerate real-world export quirks:** bare `\r` line endings (not `\n`/`\r\n`), semicolon delimiter, Belgian number formatting (`1.234,56`), and multiple possible encodings (tries `utf-8-sig`, `utf-8`, `latin-1`, `cp1252` in order). Column recognition goes through the `COLUMN_MAP` dict keyed on lowercased Dutch header names — to support another bank's export format, extend that map rather than writing a parallel parser, since fingerprinting/dedup and the rest of the pipeline assume the same internal dict shape coming out of `parse_kbc_csv`.

**Frontend is unusually flat for a React app: no CSS files, no component library** — all styling is inline JS style objects (see the `S = {...}` pattern at the top of `App.jsx` and each page/component). Follow that convention rather than introducing a stylesheet or CSS-in-JS library. State is local `useState`/`useEffect` per page, no global store; `client.js` is a thin fetch wrapper (`api.*`) that's the only place HTTP calls should be made from. Cross-page refresh is done via a `window.dispatchEvent(new Event('refresh-transactions'))` after upload rather than shared state — check for that pattern before adding a new state-management layer.

**Single SQLite file everywhere.** `DATABASE_URL` env var controls the path (defaults to `sqlite:///./budget.db` locally, `sqlite:////data/budget.db` in the Docker image where `/data` is a named volume). There are no migrations — `models.Base.metadata.create_all(bind=engine)` runs on every backend startup (`main.py` and `seed.py` both call it), so schema changes to `models.py` require either a manual `ALTER TABLE`/DB wipe or writing a migration path yourself; nothing does this automatically.
