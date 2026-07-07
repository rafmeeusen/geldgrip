"""
Run once to seed default categories into the database.
Usage: python seed.py
"""
from database import SessionLocal, engine
import models

models.Base.metadata.create_all(bind=engine)

DEFAULTS = [
    ("Groceries",      "#1D9E75"),
    ("Restaurants",    "#D85A30"),
    ("Transport",      "#378ADD"),
    ("Housing",        "#7F77DD"),
    ("Health",         "#D4537E"),
    ("Utilities",      "#888780"),
    ("Shopping",       "#BA7517"),
    ("Entertainment",  "#E24B4A"),
    ("Income",         "#639922"),
    ("Savings",        "#0F6E56"),
    ("Insurance",      "#5F5E5A"),
    ("Education",      "#185FA5"),
    ("Travel",         "#EF9F27"),
    ("Personal care",  "#993556"),
]

db = SessionLocal()
for name, color in DEFAULTS:
    exists = db.query(models.Category).filter(models.Category.name == name).first()
    if not exists:
        db.add(models.Category(name=name, color=color, icon="tag"))
        print(f"  + {name}")
    else:
        print(f"  ~ {name} (already exists)")
db.commit()
db.close()
print("Done.")
