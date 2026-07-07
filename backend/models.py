from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    color = Column(String, default="#888780")
    icon = Column(String, default="tag")
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="category", foreign_keys="Transaction.category_id")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, nullable=False)
    description = Column(Text, nullable=False)
    counterparty = Column(String, nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="EUR")
    account = Column(String, nullable=True)
    reference = Column(String, nullable=True)
    raw_description = Column(Text, nullable=True)

    # Categorization
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    category = relationship("Category", back_populates="transactions", foreign_keys=[category_id])

    # AI suggestion
    suggested_category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    suggested_confidence = Column(Float, nullable=True)
    suggested_category = relationship("Category", foreign_keys=[suggested_category_id])

    # Status
    is_approved = Column(Boolean, default=False)
    is_manually_categorized = Column(Boolean, default=False)

    # Dedup
    fingerprint = Column(String, unique=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
