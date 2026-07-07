from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os

from database import get_db, engine
import models
import crud
import schemas
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


# ── Transactions ─────────────────────────────────────────────────────────────

@app.get("/api/transactions", response_model=list[schemas.Transaction])
def list_transactions(
    skip: int = 0,
    limit: int = 200,
    month: str | None = None,
    db: Session = Depends(get_db),
):
    return crud.get_transactions(db, skip=skip, limit=limit, month=month)


@app.get("/api/transactions/stats")
def get_stats(month: str | None = None, db: Session = Depends(get_db)):
    return crud.get_stats(db, month=month)


@app.patch("/api/transactions/{tx_id}", response_model=schemas.Transaction)
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
    return tx


@app.post("/api/transactions/{tx_id}/approve", response_model=schemas.Transaction)
def approve_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = crud.approve_transaction(db, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    categorizer.learn(db)
    return tx


@app.post("/api/transactions/approve-all")
def approve_all(month: str | None = None, db: Session = Depends(get_db)):
    count = crud.approve_all(db, month=month)
    categorizer.learn(db)
    return {"approved": count}


# ── CSV Upload ────────────────────────────────────────────────────────────────

@app.post("/api/upload", response_model=schemas.UploadResult)
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")
    content = await file.read()
    from csv_parser import parse_kbc_csv
    transactions = parse_kbc_csv(content)
    added, skipped = crud.bulk_insert_transactions(db, transactions)
    # Run categorizer on new uncategorized transactions
    categorizer.predict_bulk(db)
    return {"added": added, "skipped": skipped, "filename": file.filename}


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


# ── Serve React frontend ──────────────────────────────────────────────────────

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "static")

if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
