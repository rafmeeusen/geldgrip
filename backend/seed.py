"""
Run on every backend startup. Seeds default categories (or a user-supplied
backup, via SEED_BACKUP_FILE) into an empty database. No-ops if categories
already exist.
Usage: python seed.py
"""
import json
import os

from database import SessionLocal, engine
import models
from backup import restore_backup

models.Base.metadata.create_all(bind=engine)

DEFAULT_FILE = os.path.join(os.path.dirname(__file__), "categories.default.json")
SEED_FILE = os.environ.get("SEED_BACKUP_FILE", DEFAULT_FILE)

db = SessionLocal()
if db.query(models.Category).first() is not None:
    print("Categories already exist, skipping seed.")
else:
    with open(SEED_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    restore_backup(db, data)
    print(f"Seeded categories from {SEED_FILE}")
db.close()
print("Done.")
