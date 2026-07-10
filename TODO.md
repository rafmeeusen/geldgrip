# TODO

Two parts: **Part 1** is what the app looks/feels like after this rework — pages, buttons, what the user can do — no implementation details. **Part 2** is the details behind each piece, for whoever implements this.

---

## Part 1 — UI overview

### Navigation
Three sections: **Reports (home/default)**, Transactions, **Settings** (new). Categories is no longer a top-level section — it moves under Settings, since it's used rarely (setup-time, not day-to-day).

### Transactions page
No longer the default/landing page (Reports is — see below). Also no longer a full transaction history — it's purely the review inbox, showing only what still needs action:
- Stats bar: unchanged (income, expenses, balance, to-review count).
- After uploading a CSV: if any rows couldn't be imported, a warning banner appears summarizing how many and why, expandable to see the raw rows.
- Review queue, top to bottom:
  - **Ready to commit** — transactions already reviewed (suggestion accepted, or a category manually picked) but not yet committed. One **Approve** button commits the whole batch at once.
  - **Needs review** — untouched transactions. Each row has **✓** (accept the suggested category) and **Edit** (pick a different one). Either one moves the row into "Ready to commit."
    - Right after that, if other pending transactions share the same shop/counterparty, a banner offers to apply the same category to all of them — **Apply to all** / **Dismiss**. Anything applied this way also lands in "Ready to commit," not committed automatically. If one of those other transactions was already headed for a different category, it's flagged with a warning instead of being silently overwritten.
- Removed: the **Categorized** section (once a transaction is committed, it drops off this page entirely — it's no longer a browsable history view, just a queue) and the old "Approve all" link that blindly accepted every suggestion regardless of confidence.

### Reports page — now the default/home view
Unchanged in content — not part of this rework — just becomes what the app opens to instead of Transactions.

### Settings page (new)
- **Export** — one button, downloads a backup file.
- **Restore** — upload a backup file to load it in. Only available once the app has been fully cleared; disabled otherwise.
- **Clear all data** — wipes everything. Requires typing a confirmation phrase before the button is enabled.
- **Categories** — moved here from its own top-level nav item. Same management screen as today (list/create/edit/delete), just relocated.

---

## Part 2 — Details

### Navigation details: routing changes
- `App.jsx`: default route `/` renders `Reports` instead of `Transactions`. `Transactions` moves to its own path, e.g. `/transactions`.
- `Categories` stops being a top-level `<Route>`/`NavLink`; it becomes a sub-view reachable only from within `Settings` (e.g. a tab or nested route under `/settings`), alongside Export/Restore/Clear.
- `Transactions.jsx` drops the `approved` split and its "Categorized" table entirely — it only ever needs to fetch/render pending + staged transactions now. `crud.get_transactions`/`GET /api/transactions` itself doesn't need to change (Reports still needs the full, unfiltered history for its aggregates) — this is a frontend-only query/render change, e.g. the Transactions page requests `is_approved=false` explicitly rather than fetching everything and filtering client-side as it does today.

### CSV import details: what gets silently dropped today
`csv_parser.parse_kbc_csv` skips rows that are missing amount/date, fail to parse, or have amount == 0 (csv_parser.py:111-125) — silently, no log, no return value. The DB is not guaranteed to be a complete copy of the CSV as a result.

### CSV import details: surfacing it
- `parse_kbc_csv` returns `(transactions, dropped)`, `dropped` = list of `{reason, raw_row}`. Reasons: `missing_amount_or_date`, `unparseable_amount`, `zero_amount`, `unparseable_date`.
- `POST /api/upload` includes `dropped` (count + reasons breakdown) in `UploadResult`.
- Frontend renders the warning banner described in Part 1 when `dropped > 0`.

### Backup details: format
JSON logical export, not a raw SQLite file copy. A raw file copy (`sqlite3 budget.db ".backup"`) is a fine secondary ops-level safety net but doesn't survive future schema changes to `models.py`; the JSON export is the one this feature is built around, and needs to stay restorable across schema changes.
- Top-level `"format_version": 1`.
- All categories: id, name, color, icon.
- All transactions, all columns, including `raw_description` — the only place non-mapped CSV columns (balance, BIC, address, value date, rubriek hint) survive.
- `category` / `suggested_category` referenced by **name**, not id, so the export is self-contained even if ids get renumbered on restore.

### Backup details: endpoint
`GET /api/backup` → downloadable `.json`, triggered from the Settings page "Export" button.

### Backup details: verification
Before trusting this for real data: round-trip test — export, restore into a scratch DB, diff transaction counts + fingerprint sets + category counts against the original.

### Restore details: backup file can be used to restore
- Categories and transactions load in the same shape they were exported in.
- The same restore mechanism is reused for two different triggers: the Settings-page "Restore" button (`POST /api/admin/restore`, file upload, same pattern as `/api/upload`) and fresh-install seeding (`seed.py`) — one implementation, two callers. This also means a real backup from a previous install can be used directly to initialize a brand-new install, not just to recover an existing one.
- Consolidate into `backend/backup.py`: `export_backup(db) -> dict` (used by the export endpoint) and `restore_backup(db, data: dict)` (used by restore + seeding).
- After a successful restore: run `categorizer.learn(db)` once.

### Restore details: restore function is blocked until application has been fully cleared/reset
- `restore_backup()` refuses outright if `transactions` or `categories` currently has any rows — no merge, no dedup, nothing inserted. This is a hard precondition, not a soft warning.
- `POST /api/admin/restore` returns `400` ("Database is not empty — clear all data first") in that case. The Settings page treats this as an expected, guided state — "Restore" stays disabled until "Clear all data" has been run — not a surprising error message.
- Because restore only ever runs against a guaranteed-empty DB, no dedup/merge logic is needed at all: what comes out afterward is exactly what was in the backup file, with no ambiguity about conflicting rows.
- `seed.py` (default categories, below) must respect the same precondition: it checks `categories` is empty *before* calling `restore_backup()`, since the function no longer no-ops safely on repeated calls the way today's per-category existence check does.

### Clear all data details: scope
Deletes every row from `transactions` and `categories` — categories too, otherwise a later restore would collide with pre-existing category names. Schema untouched (same `models.Base.metadata.create_all`-managed tables, just emptied).

### Clear all data details: confirmation
Destructive and irreversible: type-to-confirm (e.g. type "DELETE" or the app name) before the button enables, not a single click. Suggest nudging the user toward exporting first (e.g. surface the last export timestamp) rather than blocking outright.

### Default categories details: file replaces hardcoded list
Default categories are currently a Python list — `DEFAULTS` in `seed.py:10-25`, 14 `(name, color)` tuples, `icon` always `"tag"`. Replace with a bundled file, e.g. `backend/categories.default.json`, shaped exactly like the `categories` portion of a backup export (`{"format_version": 1, "categories": [...]}`), so it's loadable through the same `restore_backup()` path as any other backup. (The "+ New category" button, `POST /api/categories`, is unrelated — it inserts straight into the table and isn't part of this item.)

### Default categories details: seeding logic
`seed.py` locates a categories/backup JSON file (env var override pointing at a user-supplied backup, falling back to the bundled default file), checks `categories` is empty, and if so calls `restore_backup()`. On every later startup it does nothing — simpler than today's per-category existence loop, same "safe to run on every boot" property.

### Review queue details: the three-state data model
No schema change needed — `category_id` set + `is_approved = False` is already a valid, just currently unused, combination:
1. Untouched: `category_id IS NULL`.
2. Staged/reviewed: `category_id` set, `is_approved = False`.
3. Committed: `is_approved = True`.

### Review queue details: what reviewing a row does now
Both **✓** (accept the suggestion) and **Edit** → pick a category now only `PATCH` `category_id` (no `is_approved`) — this stages the row (state 2 above) rather than committing it (state 3).

### Review queue details: the commit action
New endpoint, e.g. `POST /api/transactions/commit-reviewed` → `UPDATE transactions SET is_approved = true WHERE category_id IS NOT NULL AND is_approved = False`, no ids needed since it commits exactly what's shown in "Ready to commit." Followed by one `categorizer.learn(db)` + `predict_bulk(db)` call.

### Review queue details: removing "approve all"
Delete `crud.approve_all`, `POST /api/transactions/approve-all`, and frontend `approveAll()`/`S.approveAll` (Transactions.jsx:91-94/146). It used to blindly accept whatever `suggested_category_id` was present, ignoring `suggested_confidence` entirely — a 36%-confidence guess got approved exactly like a 98%-confidence one. Also repurpose the old single-row `/api/transactions/{id}/approve` endpoint: accepting a suggestion becomes "PATCH `category_id = suggested_category_id`" (stage), same code path as manual categorization — the batch-commit endpoint above is the only thing that flips `is_approved`.

### Similar-transaction suggestion details: matching scope
Exact counterparty match only, no fuzzy matching (most transactions are recurring known shops). Searches all other pending (`is_approved == False`) transactions with the same normalized counterparty, across **all months**, not just whatever month filter is currently selected — the point is catching siblings from a multi-month import, and it includes transactions that already carry a *different* suggestion, not just unsuggested ones.

### Similar-transaction suggestion details: staging, not instant approve
"Apply to all" bulk-sets `category_id` only on the matched ids (`is_approved` left false) — they land in "Ready to commit" for a final look, consistent with the rest of the review-queue rework, not an irreversible one-click bulk-approve.

### Similar-transaction suggestion details: conflicting suggestions
If a matched sibling already had a **different** `suggested_category_id` than the one being applied, don't silently overwrite it — flag it (e.g. a separate `conflicting` sub-list in the bulk-categorize response, plus a warning marker on that row, "previously suggested: {other category}"). Expected to be rare given the user's workflow of reviewing in small batches, but cheap to handle correctly since the query already has the data.

### Similar-transaction suggestion details: underlying bug + new endpoint
- Root cause this whole feature depends on: `categorizer.learn(db)` reruns after a manual categorize or accept (main.py:55, 64) and rebuilds merchant rules, but `categorizer.predict_bulk(db)` is never called again afterward — it only runs on upload (main.py:86). Fix: call `predict_bulk(db)` right after `learn(db)` in those endpoints, so other pending transactions' suggestions actually refresh.
- New endpoint: `POST /api/transactions/bulk-categorize` — `{ids: [...], category_id: int}`, sets `category_id` only (no existing endpoint bulk-applies an explicit category to an arbitrary id list).
- PATCH/approve responses should include `similar_pending: [{id, description, amount}]` so the frontend can render the banner without an extra round-trip.
