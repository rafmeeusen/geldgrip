from pydantic import BaseModel
from datetime import datetime


class CategoryBase(BaseModel):
    name: str
    color: str = "#888780"
    icon: str = "tag"


class CategoryCreate(CategoryBase):
    pass


class Category(CategoryBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionBase(BaseModel):
    date: datetime
    description: str
    counterparty: str | None = None
    amount: float
    currency: str = "EUR"
    account: str | None = None
    reference: str | None = None


class TransactionUpdate(BaseModel):
    category_id: int | None = None
    description: str | None = None
    is_approved: bool | None = None


class Transaction(TransactionBase):
    id: int
    category_id: int | None
    category: Category | None
    suggested_category_id: int | None
    suggested_category: Category | None
    suggested_confidence: float | None
    is_approved: bool
    is_manually_categorized: bool
    fingerprint: str
    created_at: datetime

    class Config:
        from_attributes = True


class UploadResult(BaseModel):
    added: int
    skipped: int
    filename: str
