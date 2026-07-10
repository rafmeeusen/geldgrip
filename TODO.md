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

**Decided:**
- "Similar pending" search includes all pending transactions with the matching counterparty, regardless of their current suggestion — not just unsuggested ones.
- If a matched sibling already had a **different** `suggested_category_id` than the one about to be applied (classifier previously guessed a different category for it), don't silently overwrite it as part of the bulk action — flag it distinctly, e.g. included in the banner/bulk-categorize response as a separate `conflicting` sub-list, and/or a warning marker shown on that transaction's row ("previously suggested: {other category}") so it doesn't get lost in a one-click bulk apply. Expected to be rare in practice — the user's workflow is to approve/correct in small batches, so pending siblings rarely already carry a conflicting stale suggestion — but cheap to handle correctly since the query already has the data.

**Interaction with item 4 (stage → commit rework, below):** applying a category to matched siblings should *stage* them (`category_id` set, `is_approved` left false) rather than approve them outright. They land in the new "Ready to commit" section for a final look, not as an irreversible one-click bulk-approve. This also resolves the conflicting-suggestion case above cleanly: a flagged sibling just sits in "Ready to commit" with its warning marker until the user looks at it and either commits or fixes it — no separate banner UI needed.

## 4. Rework review queue into stage → batch commit (replaces "approve all")

**Problem:** "approve all" (`crud.approve_all`, `POST /api/transactions/approve-all`, frontend `approveAll()` in Transactions.jsx:91-94/146) blindly accepts whatever `suggested_category_id` currently sits on every unapproved transaction, ignoring `suggested_confidence` entirely — a 36%-confidence guess gets approved exactly like a 98%-confidence one, with zero per-transaction review.

**Decided UX:** remove "approve all" outright. Replace it with an explicit two-step stage → commit pattern:
- The data model already supports a third state that's currently unused: `category_id` set but `is_approved = False` — "reviewed, not yet committed." No schema change needed.
- Reviewing a transaction — clicking ✓ to accept the suggestion, or manually picking a category via Edit — now only sets `category_id` (PATCH without `is_approved`). This *stages* the row; it does not commit it.
- The queue gets a new top section, **"Ready to commit (N)"**: every transaction with `category_id` set and `is_approved = False`, with a single **Approve/Commit** button that batch-approves exactly that set (new endpoint, no ids needed since it just commits whatever's currently staged — 1:1 with what's shown on screen).
- Below it, **"Needs review"** keeps only untouched transactions (`category_id IS NULL`).
- Workflow: review a handful → hit commit → repeat, as many times as needed until the queue is empty. Matches how the user actually wants to work — small verified batches, not one global accept-everything button.

**Architecture:**
- Remove: `crud.approve_all`, `POST /api/transactions/approve-all`, frontend `approveAll()` / `S.approveAll`.
- Repurpose the single-row `/api/transactions/{id}/approve` endpoint away: accepting a suggestion becomes "PATCH `category_id = suggested_category_id`" (stage), same code path as manual categorization. The only thing that flips `is_approved` is the new batch-commit endpoint.
- New endpoint: `POST /api/transactions/commit-reviewed` → `UPDATE transactions SET is_approved = true WHERE category_id IS NOT NULL AND is_approved = False`, then one `categorizer.learn(db)` call (and a `predict_bulk(db)` per item 3's fix).
- Frontend: split the `pending` array into `staged` (`category_id` set) and `untouched` (`category_id` null); add the "Ready to commit" section + its Approve button above "Needs review".

## 5. Default categories: replace hardcoded Python list with a text file (same format as item 2's backup)

**Problem:** default categories are hardcoded as a Python list — `DEFAULTS` in `seed.py:10-25`, 14 `(name, color)` tuples, `icon` always `"tag"`. Changing the starter set means editing code, not data. (Separately: the "+ New category" button (`POST /api/categories`) is unrelated to this list — it inserts straight into the `categories` table, so this item only concerns the *initial* seed set, not category creation in general.)

**Decided:** don't invent a new file format for this — reuse item 2's backup JSON shape. Concretely:
- Ship a default categories file in the repo, e.g. `backend/categories.default.json`, shaped exactly like the `categories` portion of a backup export: `{"format_version": 1, "categories": [{"name", "color", "icon"}, ...]}` (no `transactions` key, or an empty one).
- `seed.py` reads that file instead of the Python literal and inserts-if-missing by name, same idempotent behavior as today — just swap the hardcoded list for a file read.
- Because it's the same shape as a full backup, **a real backup taken from a previous install can be used directly to initialize a fresh install** — same parser, same code path for "seed" and "restore," nothing separate to maintain. This is the actual goal: fresh-install init and backup-restore become the same operation.

**Architecture:**
- Depends on item 2's backup format being defined first (categories referenced by name, `format_version` field) — implement in that order, this item builds directly on it.
- `seed.py` becomes: locate a categories/backup JSON file (env var override pointing at a user-supplied backup, falling back to the bundled `categories.default.json`) → parse the `categories` array → insert-if-missing by name.
- If a full backup (with `transactions` populated) is pointed at during fresh install, the same loader should be able to restore transactions too — not just categories — making this the general "restore" path, with "seed defaults on fresh install" as just the special case where only `categories` is present.
