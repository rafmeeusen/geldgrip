
- Rename Settings' "Clear all data" to "Reset application". It should put the app back into exactly the state of a fresh install: wipe all transactions and categories, then reseed the bundled default categories (`categories.default.json`) — the same thing `seed.py` does on first container boot, just triggered on demand instead of only at startup.
  - Consequence: loosen the Restore guard from "categories AND transactions empty" to "transactions empty" only. `restore_backup()` deletes whatever categories are present (the reseeded defaults) before loading the backup's own categories — safe since transactions are guaranteed empty at that point, so no dangling references.
  - Confirmation copy should shift from "delete" framing to "reset" framing (e.g. type-to-confirm phrase, warning text) to match the new mental model.

