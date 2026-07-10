
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

