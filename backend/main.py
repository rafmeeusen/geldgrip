from collections import Counter

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session
import json
import os

from database import get_db, engine
import models
import crud
import schemas
import backup
from categorizer import Categorizer

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Budget Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

categorizer = Categorizer()


def _with_similar(db: Session, tx):
    similar = crud.find_similar_pending(db, tx)
    data = schemas.Transaction.model_validate(tx).model_dump()
    data["similar_pending"] = [
        {"id": t.id, "description": t.description, "amount": t.amount} for t in similar
    ]
    return data


# ── Transactions ─────────────────────────────────────────────────────────────

@app.get("/api/transactions", response_model=list[schemas.Transaction])
def list_transactions(
    skip: int = 0,
    limit: int = 200,
    month: str | None = None,
    is_approved: bool | None = None,
    db: Session = Depends(get_db),
):
    return crud.get_transactions(db, skip=skip, limit=limit, month=month, is_approved=is_approved)


@app.get("/api/transactions/stats")
def get_stats(month: str | None = None, db: Session = Depends(get_db)):
    return crud.get_stats(db, month=month)


@app.patch("/api/transactions/{tx_id}", response_model=schemas.TransactionWithSimilar)
def update_transaction(
    tx_id: int,
    payload: schemas.TransactionUpdate,
    db: Session = Depends(get_db),
):
    tx = crud.update_transaction(db, tx_id, payload)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if payload.category_id is not None:
        categorizer.learn(db)
        categorizer.predict_bulk(db)
    return _with_similar(db, tx)


@app.post("/api/transactions/{tx_id}/approve", response_model=schemas.TransactionWithSimilar)
def accept_suggestion(tx_id: int, db: Session = Depends(get_db)):
    """Stage the suggested category (does not commit) — same code path as
    manual categorization, just pre-filled with the AI's guess."""
    tx = crud.accept_suggestion(db, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    categorizer.learn(db)
    categorizer.predict_bulk(db)
    return _with_similar(db, tx)


@app.post("/api/transactions/bulk-categorize", response_model=schemas.BulkCategorizeResult)
def bulk_categorize(payload: schemas.BulkCategorizeRequest, db: Session = Depends(get_db)):
    applied, conflicting = crud.bulk_categorize(db, payload.ids, payload.category_id)
    return {"applied": applied, "conflicting": conflicting}


@app.post("/api/transactions/commit-reviewed", response_model=schemas.CommitReviewedResult)
def commit_reviewed(db: Session = Depends(get_db)):
    count = crud.commit_reviewed(db)
    categorizer.learn(db)
    categorizer.predict_bulk(db)
    return {"committed": count}


# ── CSV Upload ────────────────────────────────────────────────────────────────

@app.post("/api/upload", response_model=schemas.UploadResult)
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")
    content = await file.read()
    from csv_parser import parse_kbc_csv
    transactions, dropped = parse_kbc_csv(content)
    added, skipped = crud.bulk_insert_transactions(db, transactions)
    # Run categorizer on new uncategorized transactions
    categorizer.predict_bulk(db)
    return {
        "added": added,
        "skipped": skipped,
        "filename": file.filename,
        "dropped": len(dropped),
        "dropped_reasons": dict(Counter(d["reason"] for d in dropped)),
        "dropped_rows": dropped,
    }


# ── Categories ────────────────────────────────────────────────────────────────

@app.get("/api/categories", response_model=list[schemas.Category])
def list_categories(db: Session = Depends(get_db)):
    return crud.get_categories(db)


@app.post("/api/categories", response_model=schemas.Category)
def create_category(payload: schemas.CategoryCreate, db: Session = Depends(get_db)):
    return crud.create_category(db, payload)


@app.patch("/api/categories/{cat_id}", response_model=schemas.Category)
def update_category(
    cat_id: int, payload: schemas.CategoryCreate, db: Session = Depends(get_db)
):
    cat = crud.update_category(db, cat_id, payload)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat


@app.delete("/api/categories/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db)):
    ok = crud.delete_category(db, cat_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"ok": True}


# ── Admin: backup / restore / clear ─────────────────────────────────────────

@app.get("/api/backup")
def export_backup(db: Session = Depends(get_db)):
    data = backup.export_backup(db)
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": "attachment; filename=geldgrip-backup.json"},
    )


@app.post("/api/admin/restore")
async def restore_backup(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    try:
        data = json.loads(content)
    except ValueError:
        raise HTTPException(status_code=400, detail="Not a valid JSON backup file")
    try:
        backup.restore_backup(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    categorizer.learn(db)
    return {"ok": True}


@app.post("/api/admin/clear")
def clear_all(db: Session = Depends(get_db)):
    db.query(models.Transaction).delete()
    db.query(models.Category).delete()
    db.commit()
    return {"ok": True}


# ── Serve React frontend ──────────────────────────────────────────────────────

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "static")

if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
