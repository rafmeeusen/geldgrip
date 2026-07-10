# TODO

Three items below, written up in enough detail to implement together in one rework pass. Each has: problem, decided UX/format, architecture notes, and open questions still to confirm.

## 1. Warn when CSV rows are dropped during import

**Problem:** `csv_parser.parse_kbc_csv` silently skips rows that are missing amount/date, fail to parse, or have amount == 0 (csv_parser.py:111-125). No log, no return value — those rows vanish with no trace, and the DB is not guaranteed to be a complete copy of the CSV.

**Fix:**
- `parse_kbc_csv` returns `(transactions, dropped)`, where `dropped` is a list of `{reason, raw_row}`. Reasons: `missing_amount_or_date`, `unparseable_amount`, `zero_amount`, `unparseable_date`.
- `POST /api/upload` includes `dropped` (count + reasons breakdown) in `UploadResult`.
- Frontend shows a warning banner after upload when `dropped > 0`, e.g. "3 rows skipped (2 unparseable date, 1 zero amount)", expandable to see the raw rows.

## 2. Backup / export from the frontend

**Problem:** original uploaded CSVs are never stored (only parsed transactions survive); no way to get data out except querying the SQLite file directly.

**Format decision:** JSON logical export, not a raw SQLite file copy. A raw file copy (`sqlite3 budget.db ".backup"`) is a fine secondary ops-level safety net, but doesn't survive future schema changes to `models.py` — the JSON export is the one the "backup" button produces, and it needs to stay restorable after the schema evolves.

**Contents:**
- Top-level `"format_version": 1`.
- All categories (id, name, color, icon).
- All transactions, all columns including `raw_description` — it's the only place non-mapped CSV columns (balance, BIC, address, value date, rubriek hint) survive.
- `category` and `suggested_category` referenced by **name**, not just id, so the export is self-contained even if ids get renumbered on restore.

**Endpoint:** `GET /api/backup` → downloadable `.json` file, triggered by a button in the frontend (page TBD).

**Verification (manual test before relying on it for real data):** round-trip test — export, restore into a scratch DB, diff transaction counts + fingerprint sets + category counts against the original.

## 3. Suggest category for similar transactions right after categorizing one

**Problem:** when you correct or approve a transaction's category, `categorizer.learn(db)` reruns (main.py:55, 64) and rebuilds the merchant rules — but `categorizer.predict_bulk(db)` is never called again afterward; it only runs on upload (main.py:86). So other pending transactions from the same counterparty (e.g. more Ecopower rows from a multi-month import) keep stale/empty suggestions until the next CSV upload.

**UX (decided):**
- Exact counterparty match only — no fuzzy matching. Most transactions are recurring known shops, fuzzy isn't needed here.
- Triggers after: manual categorize (PATCH with `category_id`) and single approve. Does **not** trigger after "approve all" (already a bulk action — would spam banners).
- Search scope: other pending (`is_approved == False`) transactions with the same normalized counterparty, across **all months**, not just whatever month filter is currently selected — the whole point is catching siblings from a multi-month import.
- If matches exist: inline banner in the queue — "N other transactions from {counterparty} found — apply '{category}' to all?" with **Apply to all** / **Dismiss**.
  - *Apply to all*: bulk-sets `category_id` + `is_approved = true` on those ids, one `learn()` call afterward (not per-transaction).
  - *Dismiss*: banner closes, no bulk action — but those transactions' `suggested_category_id` should still refresh (via `predict_bulk`) so the dropdown is pre-filled next time they're reviewed individually.

**Architecture:**
- Fix the underlying staleness bug first: call `categorizer.predict_bulk(db)` after `categorizer.learn(db)` in the PATCH and approve endpoints (main.py:55, 64) — currently missing entirely.
- New endpoint: `POST /api/transactions/bulk-categorize` — `{ids: [...], category_id: int}`. Nothing today bulk-applies an explicit category to an arbitrary id list (`approve-all` only accepts whatever's already suggested, scoped by month).
- PATCH/approve response should include `similar_pending: [{id, description, amount}]` so the frontend can render the banner without an extra round-trip.

**Open questions to confirm before building:**
- Should "similar pending" search include transactions that already have a *different* suggested category (classifier guessed wrong), or only unsuggested ones? Leaning: include all pending regardless of current suggestion, since correcting stale/wrong suggestions is the point.
- Where does the "Apply to all" banner live in the UI — inline right above/below the row just categorized, or a toast/banner at the top of the page?
