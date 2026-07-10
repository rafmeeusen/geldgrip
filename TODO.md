
- Rename Settings' "Clear all data" to "Reset application". It should put the app back into exactly the state of a fresh install: wipe all transactions and categories, then reseed the bundled default categories (`categories.default.json`) — the same thing `seed.py` does on first container boot, just triggered on demand instead of only at startup.
  - Consequence: loosen the Restore guard from "categories AND transactions empty" to "transactions empty" only. `restore_backup()` deletes whatever categories are present (the reseeded defaults) before loading the backup's own categories — safe since transactions are guaranteed empty at that point, so no dangling references.
  - Confirmation copy should shift from "delete" framing to "reset" framing (e.g. type-to-confirm phrase, warning text) to match the new mental model.

- Settings' "Restore" should make clear it expects a `.json` backup file — e.g. hint text near the file input, and/or constrain the picker to `.json`.

- Backup filename should include the date/time it was exported, e.g. `geldgrip-backup-2026-07-10-1432.json`, instead of the current hardcoded `geldgrip-backup.json`.
  - Update both `Content-Disposition` in `GET /api/backup` (`main.py`) and the `a.download` fallback name in `client.js`'s `downloadBackup()` — the browser prefers the header's filename when present, but both should agree.

- Accepting a suggestion (✓) on the Transactions page scrolls the review queue back to the top instead of staying where the user was.
  - Likely cause: `acceptSuggestion`/`setCategory` call `load()`, which sets `loading=true` first — this unmounts the tables in favor of the "Loading…" line, collapsing the scroll container, so `scrollTop` resets to 0; the fresh data then renders at that reset position instead of restoring where the user was.
  - Fix direction: stop tearing down the table on action-triggered reloads (only show the "Loading…" state on true initial mount, not on every `load()` call), so the scroll container's content — and its scroll position — stays put while data refreshes underneath.

- Backup export shouldn't have a separate top-level `categories` list — each transaction already carries its category, so drop the redundant overview.
  - Implementation: instead of a transaction's `category`/`suggested_category` being a bare name that's looked up in the top-level list, embed the category info (name, color, icon) directly on the transaction. `restore_backup()` then derives the category set by deduping those embedded objects across all transactions (by name), creates `Category` rows first, builds a name→id map, then inserts transactions against it.
  - Consequence: categories with zero transactions (created but never actually used, whether as `category` or `suggested_category`) no longer round-trip through export/restore — they just won't be in the backup file. `categories.default.json` + "Reset application" (above) already cover reseeding the default set, so this seems fine, but flagging it since it's a behavior change from today's export.

- Income vs. expenses (Transactions page stats bar + Reports page) should be based on each transaction's category, not the sign of the amount.
  - Add an `is_income` boolean to `Category` (model, schema, and a toggle in the Settings > Categories create/edit form) — optional, defaults to false.
  - `backend/categories.default.json`: each category entry gets an optional `is_income` field alongside `color`/`icon`. Exactly one default category should be marked `"is_income": true` — the app reads the default income category from this file rather than hardcoding a name in code.
  - Classification rule: a transaction counts as income if its category's `is_income` is true, as an expense if it has a category and `is_income` is false, and is **excluded from both totals** if it has no `category_id` yet (still untouched in the review queue) — no sign-based fallback. "Categorized" means `category_id` is set, regardless of whether it's been committed yet (`is_approved`) — i.e. staged transactions ("Ready to commit") already count, matching the existing three-state review model.
  - Update both places that compute this today, independently and already somewhat inconsistently with each other:
    - `crud.get_stats()` (backend) — drives the Transactions page's stats bar.
    - `Reports.jsx` (frontend) — currently the summary cards sum by sign over all filtered transactions, while the "Expenses by category" breakdown groups by `category_id || suggested_category_id`; both should switch to the same categorized-only, `is_income`-based rule.
  - Consequence: "Balance" (income − expenses) will no longer include amounts still sitting in the review queue until they're categorized — the existing "to review" count already signals what's excluded, so this should read as consistent rather than confusing.

