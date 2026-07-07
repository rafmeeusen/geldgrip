"""
KBC CSV parser.

Handles the actual KBC export format:
- Semicolon delimited
- \r (CR-only) line endings — not \n or \r\n
- Headers: Rekeningnummer;Rubrieknaam;Naam;Munt;Afschriftnummer;Datum;
           Omschrijving;Valuta;Bedrag;Saldo;Credit;Debet;
           Rekening tegenpartij;BIC code tegenpartij;Naam tegenpartij;
           Adres tegenpartij;gestructureerde mededeling;vrije mededeling
- Belgian number format: -1.234,56
- Dates: dd/mm/yyyy
"""

import csv
import hashlib
import io
from datetime import datetime


COLUMN_MAP = {
    "rekeningnummer": "account",
    "rubrieknaam": "category_hint",
    "rubriek": "category_hint",
    "naam": "account_holder",
    "munt": "currency",
    "afschriftnummer": "statement_number",
    "datum": "date",
    "transactiedatum": "date",
    "omschrijving": "description",
    "valuta": "value_date",
    "bedrag": "amount",
    "saldo": "balance",
    "credit": "credit",
    "debet": "debet",
    "rekening tegenpartij": "counterparty_account",
    "bic code tegenpartij": "counterparty_bic",
    "naam tegenpartij": "counterparty",
    "adres tegenpartij": "counterparty_address",
    "gestructureerde mededeling": "structured_memo",
    "vrije mededeling": "memo",
    "mededeling": "memo",
    "valuta datum": "value_date",
}


def _normalize_header(h: str) -> str:
    return h.strip().lower().replace("\ufeff", "").replace("\r", "")


def _parse_amount(val: str) -> float:
    val = val.strip().replace("\xa0", "").replace(" ", "").replace("\r", "")
    if not val:
        raise ValueError("empty amount")
    # Belgian format: periods as thousands separator, comma as decimal
    val = val.replace(".", "").replace(",", ".")
    return float(val)


def _parse_date(val: str) -> datetime:
    val = val.strip().replace("\r", "")
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(val, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {val!r}")


def _fingerprint(row: dict) -> str:
    key = f"{row.get('date')}|{row.get('amount')}|{row.get('description')}|{row.get('counterparty')}|{row.get('account')}"
    return hashlib.sha256(key.encode()).hexdigest()


def parse_kbc_csv(content: bytes) -> list[dict]:
    # Decode
    for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError("Could not decode CSV file")

    # Normalise line endings: KBC uses bare \r (CR only), convert to \n
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()

    # Detect delimiter from first line
    first_line = text.split("\n")[0]
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    # Build header map
    raw_headers = reader.fieldnames or []
    header_map = {}
    for h in raw_headers:
        normalized = _normalize_header(h)
        internal = COLUMN_MAP.get(normalized)
        if internal:
            header_map[h] = internal

    transactions = []
    for row in reader:
        mapped: dict = {}
        for raw_h, internal in header_map.items():
            val = (row.get(raw_h) or "").strip().replace("\r", "")
            mapped[internal] = val

        if not mapped.get("amount") or not mapped.get("date"):
            continue

        try:
            amount = _parse_amount(mapped["amount"])
        except (ValueError, KeyError):
            continue

        if amount == 0.0:
            continue

        try:
            date = _parse_date(mapped["date"])
        except ValueError:
            continue

        parts = []
        if mapped.get("description"):
            parts.append(mapped["description"])
        if mapped.get("memo"):
            parts.append(mapped["memo"])
        if mapped.get("structured_memo"):
            parts.append(mapped["structured_memo"])
        description = " | ".join(p for p in parts if p) or "—"

        counterparty = mapped.get("counterparty") or mapped.get("counterparty_account") or None

        record = {
            "date": date,
            "description": description,
            "counterparty": counterparty,
            "amount": amount,
            "currency": mapped.get("currency", "EUR") or "EUR",
            "account": mapped.get("account") or None,
            "reference": mapped.get("statement_number") or None,
            "raw_description": str(dict(row)),
            "category_id": None,
            "suggested_category_id": None,
            "suggested_confidence": None,
            "is_approved": False,
            "is_manually_categorized": False,
        }
        record["fingerprint"] = _fingerprint(record)
        transactions.append(record)

    return transactions
