"""
JSON logical backup: export and restore.

Format is self-contained across schema changes and id renumbering — categories
are referenced by name, not id, both on export and on restore.
"""
from datetime import datetime

from sqlalchemy.orm import Session

import models

FORMAT_VERSION = 1


def export_backup(db: Session) -> dict:
    categories = db.query(models.Category).order_by(models.Category.id).all()
    transactions = db.query(models.Transaction).order_by(models.Transaction.id).all()
    name_by_cat_id = {c.id: c.name for c in categories}

    return {
        "format_version": FORMAT_VERSION,
        "categories": [
            {"id": c.id, "name": c.name, "color": c.color, "icon": c.icon}
            for c in categories
        ],
        "transactions": [
            {
                "date": t.date.isoformat(),
                "description": t.description,
                "counterparty": t.counterparty,
                "amount": t.amount,
                "currency": t.currency,
                "account": t.account,
                "reference": t.reference,
                "raw_description": t.raw_description,
                "category": name_by_cat_id.get(t.category_id),
                "suggested_category": name_by_cat_id.get(t.suggested_category_id),
                "suggested_confidence": t.suggested_confidence,
                "is_approved": t.is_approved,
                "is_manually_categorized": t.is_manually_categorized,
                "fingerprint": t.fingerprint,
                "created_at": t.created_at.isoformat(),
            }
            for t in transactions
        ],
    }


def restore_backup(db: Session, data: dict) -> None:
    """Load categories + transactions from a backup dict into an empty DB.

    Hard precondition: refuses outright if the DB already has any categories
    or transactions. No merge/dedup logic exists because of this — callers
    must clear the DB first.
    """
    if db.query(models.Category).first() is not None or db.query(models.Transaction).first() is not None:
        raise ValueError("Database is not empty — clear all data first")

    name_to_id: dict[str, int] = {}
    for cat in data.get("categories", []):
        row = models.Category(
            name=cat["name"],
            color=cat.get("color", "#888780"),
            icon=cat.get("icon", "tag"),
        )
        db.add(row)
        db.flush()
        name_to_id[cat["name"]] = row.id

    for tx in data.get("transactions", []):
        db.add(models.Transaction(
            date=datetime.fromisoformat(tx["date"]),
            description=tx["description"],
            counterparty=tx.get("counterparty"),
            amount=tx["amount"],
            currency=tx.get("currency", "EUR"),
            account=tx.get("account"),
            reference=tx.get("reference"),
            raw_description=tx.get("raw_description"),
            category_id=name_to_id.get(tx.get("category")),
            suggested_category_id=name_to_id.get(tx.get("suggested_category")),
            suggested_confidence=tx.get("suggested_confidence"),
            is_approved=tx.get("is_approved", False),
            is_manually_categorized=tx.get("is_manually_categorized", False),
            fingerprint=tx["fingerprint"],
            created_at=datetime.fromisoformat(tx["created_at"]) if tx.get("created_at") else datetime.utcnow(),
        ))

    db.commit()
