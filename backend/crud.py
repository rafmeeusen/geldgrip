from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from datetime import datetime
import models
import schemas
from categorizer import _normalize


# ── Transactions ──────────────────────────────────────────────────────────────

def get_transactions(
    db: Session,
    skip: int = 0,
    limit: int = 200,
    month: str | None = None,
    is_approved: bool | None = None,
):
    q = db.query(models.Transaction).order_by(models.Transaction.date.desc())
    if month:
        year, m = month.split("-")
        q = q.filter(
            extract("year", models.Transaction.date) == int(year),
            extract("month", models.Transaction.date) == int(m),
        )
    if is_approved is not None:
        q = q.filter(models.Transaction.is_approved == is_approved)
    return q.offset(skip).limit(limit).all()


def get_stats(db: Session, month: str | None = None):
    q = db.query(models.Transaction)
    if month:
        year, m = month.split("-")
        q = q.filter(
            extract("year", models.Transaction.date) == int(year),
            extract("month", models.Transaction.date) == int(m),
        )
    txs = q.all()
    income = sum(t.amount for t in txs if t.amount > 0)
    expenses = sum(t.amount for t in txs if t.amount < 0)
    pending = sum(1 for t in txs if not t.is_approved)
    return {
        "income": round(income, 2),
        "expenses": round(expenses, 2),
        "balance": round(income + expenses, 2),
        "pending": pending,
        "total": len(txs),
    }


def update_transaction(db: Session, tx_id: int, payload: schemas.TransactionUpdate):
    tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
    if not tx:
        return None
    if payload.category_id is not None:
        tx.category_id = payload.category_id
        tx.is_manually_categorized = True
    if payload.description is not None:
        tx.description = payload.description
    db.commit()
    db.refresh(tx)
    return tx


def accept_suggestion(db: Session, tx_id: int):
    """Stage a transaction's suggested category (does not commit/approve)."""
    tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
    if not tx:
        return None
    if tx.suggested_category_id and not tx.category_id:
        tx.category_id = tx.suggested_category_id
    db.commit()
    db.refresh(tx)
    return tx


def commit_reviewed(db: Session):
    """Flip every staged (category_id set, not yet approved) row to approved."""
    q = db.query(models.Transaction).filter(
        models.Transaction.category_id.isnot(None),
        models.Transaction.is_approved == False,
    )
    count = q.update({models.Transaction.is_approved: True}, synchronize_session=False)
    db.commit()
    return count


def find_similar_pending(db: Session, tx: models.Transaction):
    """Other pending transactions sharing the same normalized counterparty,
    across all months. Exact match only, no fuzzy matching."""
    if not tx.counterparty:
        return []
    norm_cp = _normalize(tx.counterparty)
    candidates = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.is_approved == False,
            models.Transaction.id != tx.id,
            models.Transaction.counterparty.isnot(None),
        )
        .all()
    )
    return [t for t in candidates if _normalize(t.counterparty) == norm_cp]


def bulk_categorize(db: Session, ids: list[int], category_id: int):
    """Stage category_id on the given ids. Rows that already carry a
    different suggested_category_id are not overwritten — they're returned
    as conflicting instead."""
    txs = db.query(models.Transaction).filter(models.Transaction.id.in_(ids)).all()
    applied = []
    conflicting = []
    for tx in txs:
        if tx.suggested_category_id is not None and tx.suggested_category_id != category_id:
            conflicting.append(tx)
            continue
        tx.category_id = category_id
        tx.is_manually_categorized = True
        applied.append(tx)
    db.commit()
    for tx in applied + conflicting:
        db.refresh(tx)
    return applied, conflicting


def bulk_insert_transactions(db: Session, transactions: list[dict]):
    added = 0
    skipped = 0
    for data in transactions:
        existing = (
            db.query(models.Transaction)
            .filter(models.Transaction.fingerprint == data["fingerprint"])
            .first()
        )
        if existing:
            skipped += 1
            continue
        tx = models.Transaction(**data)
        db.add(tx)
        added += 1
    db.commit()
    return added, skipped


# ── Categories ────────────────────────────────────────────────────────────────

def get_categories(db: Session):
    return db.query(models.Category).order_by(models.Category.name).all()


def create_category(db: Session, payload: schemas.CategoryCreate):
    cat = models.Category(**payload.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def update_category(db: Session, cat_id: int, payload: schemas.CategoryCreate):
    cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not cat:
        return None
    for k, v in payload.model_dump().items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


def delete_category(db: Session, cat_id: int):
    cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not cat:
        return False
    db.delete(cat)
    db.commit()
    return True
