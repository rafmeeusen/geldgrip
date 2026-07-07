# geldgrip
Grip op mijn geld / digitaal huishoudboekje
Budget Planner

A self-hosted budget planner that ingests KBC CSV exports, auto-categorizes transactions using machine learning, and lets you review and correct suggestions — so it gets smarter over time.

---

## Features

- **KBC CSV import** — drag & drop your bank export; duplicates are automatically skipped
- **Smart categorization** — merchant-name matching + Naive Bayes classifier trained on your corrections
- **Review queue** — pending transactions surface first with a confidence score
- **Manual correction loop** — every correction retrains the model instantly
- **Reports** — expenses by category with bar chart, filterable by month
- **Single Docker container** — one command to deploy anywhere

---

## Quick start (VPS / server)

### Prerequisites
- Docker + Docker Compose installed on your server
- Port 8000 open (or proxied via nginx)

### 1. Clone / copy the project

```bash
git clone <your-repo-url> budget-planner
cd budget-planner
```

### 2. Build and run

```bash
docker compose up -d --build
```

The app will be available at `http://your-server-ip:8000`.

First startup seeds 14 default categories automatically.

### 3. (Recommended) Put it behind nginx with HTTPS

```nginx
server {
    server_name budget.yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 20M;
    }

    # SSL via certbot:
    # certbot --nginx -d budget.yourdomain.com
}
```

---

## Exporting from KBC Online Banking

1. Log in to **KBC Online** (web)
2. Go to **My accounts → Transactions**
3. Select a date range and click **Export → CSV**
4. In the app click **+ Upload CSV** and drop the file

The parser handles both old and new KBC CSV formats automatically, including the semicolon delimiter and Belgian number formatting (e.g. `1.234,56`).

---

## How categorization works

Categorization runs in priority order:

1. **Exact merchant match** — if you've seen "LIDL BRUSSEL" before and approved it as "Groceries", all future LIDL transactions get that category at ~90% confidence.
2. **Fuzzy merchant match** — catches slight variations in merchant names (e.g. different LIDL branches).
3. **TF-IDF + Naive Bayes classifier** — trained on the full text of all approved transactions. Kicks in after you've approved at least 3 transactions across 2+ categories.
4. **Uncategorized** — falls through to your review queue.

The model **retrains automatically** whenever you approve or manually correct a transaction. No manual steps needed.

---

## Development (local)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python seed.py          # create default categories
uvicorn main:app --reload
```

API runs on http://localhost:8000, docs at http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev             # proxies /api to localhost:8000
```

Frontend dev server on http://localhost:5173

### Build for production (embedded in backend)

```bash
cd frontend && npm run build
# Outputs to backend/static/
cd ../backend && uvicorn main:app
```

---

## Data & backups

The SQLite database is stored in a Docker volume (`budget-data`) mounted at `/data/budget.db`.

To back it up:

```bash
docker compose exec budget-planner sqlite3 /data/budget.db ".backup /data/budget_backup.db"
docker cp budget-planner_budget-planner_1:/data/budget_backup.db ./backup.db
```

---

## Project structure

```
budget-planner/
├── backend/
│   ├── main.py          # FastAPI app & routes
│   ├── models.py        # SQLAlchemy ORM models
│   ├── schemas.py       # Pydantic request/response schemas
│   ├── crud.py          # Database operations
│   ├── database.py      # DB connection setup
│   ├── csv_parser.py    # KBC CSV parser
│   ├── categorizer.py   # ML categorization engine
│   ├── seed.py          # Default category seeder
│   ├── start.sh         # Container entrypoint
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api/client.js
│   │   ├── pages/
│   │   │   ├── Transactions.jsx
│   │   │   ├── Categories.jsx
│   │   │   └── Reports.jsx
│   │   └── components/
│   │       ├── Upload.jsx
│   │       ├── CategoryPicker.jsx
│   │       └── ConfidenceBadge.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Adding support for other banks

Edit `backend/csv_parser.py` and extend the `COLUMN_MAP` dict with your bank's column names. The parser auto-detects comma vs semicolon delimiters and UTF-8 vs latin-1 encoding.
