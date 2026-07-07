"""
Categorization engine.

Strategy (in priority order):
1. Exact fingerprint match (same merchant appeared before, user approved it)
2. Merchant name fuzzy match from learned rules
3. TF-IDF + Naive Bayes classifier trained on approved transactions
4. No suggestion (returns None, confidence 0)

The engine re-trains whenever the user approves or manually corrects a transaction.
"""

from __future__ import annotations
import re
import unicodedata
from difflib import SequenceMatcher

from sqlalchemy.orm import Session
import models


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = text.lower()
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


class Categorizer:
    def __init__(self):
        self._clf = None
        self._vectorizer = None
        self._label_map: dict[int, int] = {}  # clf label → category_id
        self._merchant_rules: dict[str, tuple[int, int]] = {}  # norm_merchant → (cat_id, count)
        self._trained = False

    # ── Public API ────────────────────────────────────────────────────────────

    def learn(self, db: Session):
        """Retrain on all manually categorized or approved transactions."""
        txs = (
            db.query(models.Transaction)
            .filter(
                models.Transaction.category_id.isnot(None),
                models.Transaction.is_approved == True,
            )
            .all()
        )
        if len(txs) < 3:
            return

        self._build_merchant_rules(txs)
        self._train_classifier(txs)
        self._trained = True

    def predict(self, description: str, counterparty: str | None) -> tuple[int | None, float]:
        """Return (category_id, confidence) for a single transaction."""
        # 1. Merchant rule match
        if counterparty:
            norm_cp = _normalize(counterparty)
            if norm_cp in self._merchant_rules:
                cat_id, count = self._merchant_rules[norm_cp]
                confidence = min(0.5 + count * 0.1, 0.98)
                return cat_id, round(confidence, 2)

            # Fuzzy merchant match
            best_ratio = 0.0
            best_cat = None
            for merchant_key, (cat_id, count) in self._merchant_rules.items():
                ratio = SequenceMatcher(None, norm_cp, merchant_key).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_cat = cat_id
            if best_ratio > 0.82 and best_cat is not None:
                return best_cat, round(best_ratio * 0.9, 2)

        # 2. ML classifier
        if self._trained and self._clf is not None:
            text = _normalize(f"{counterparty or ''} {description}")
            try:
                X = self._vectorizer.transform([text])
                proba = self._clf.predict_proba(X)[0]
                best_idx = proba.argmax()
                confidence = float(proba[best_idx])
                if confidence > 0.35:
                    cat_id = self._label_map[best_idx]
                    return cat_id, round(confidence, 2)
            except Exception:
                pass

        return None, 0.0

    def predict_bulk(self, db: Session):
        """Run prediction on all uncategorized/unapproved transactions."""
        txs = (
            db.query(models.Transaction)
            .filter(
                models.Transaction.is_approved == False,
                models.Transaction.is_manually_categorized == False,
            )
            .all()
        )
        for tx in txs:
            cat_id, confidence = self.predict(tx.description, tx.counterparty)
            tx.suggested_category_id = cat_id
            tx.suggested_confidence = confidence
        db.commit()

    # ── Private helpers ───────────────────────────────────────────────────────

    def _build_merchant_rules(self, txs: list):
        rules: dict[str, dict[int, int]] = {}
        for tx in txs:
            if tx.counterparty:
                key = _normalize(tx.counterparty)
                rules.setdefault(key, {})
                rules[key][tx.category_id] = rules[key].get(tx.category_id, 0) + 1
        # Keep majority category per merchant
        self._merchant_rules = {}
        for merchant, counts in rules.items():
            best_cat = max(counts, key=counts.get)
            self._merchant_rules[merchant] = (best_cat, counts[best_cat])

    def _train_classifier(self, txs: list):
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.naive_bayes import ComplementNB
            from sklearn.pipeline import Pipeline
            import numpy as np
        except ImportError:
            return

        texts = [
            _normalize(f"{tx.counterparty or ''} {tx.description}")
            for tx in txs
        ]
        labels = [tx.category_id for tx in txs]

        unique_labels = sorted(set(labels))
        if len(unique_labels) < 2:
            return

        self._label_map = {i: cat_id for i, cat_id in enumerate(unique_labels)}
        y = np.array([unique_labels.index(l) for l in labels])

        self._vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            min_df=1,
            max_features=5000,
            sublinear_tf=True,
        )
        X = self._vectorizer.fit_transform(texts)

        self._clf = ComplementNB(alpha=0.5)
        self._clf.fit(X, y)
