from uuid import uuid4

from pydantic import ValidationError

from schemas import TransferCreate


valid = {
    "request_id": uuid4(),
    "from_account_id": 1,
    "to_account_id": 2,
    "amount": "50.00",
    "date": "2026-10-05",
    "description": "Transfer check",
}

TransferCreate(**valid)
print("Valid transfer accepted")

invalid_changes = [
    {"to_account_id": 1},
    {"from_account_id": 0},
    {"amount": "0.00"},
    {"amount": "-1.00"},
    {"amount": "1.001"},
    {"request_id": "invalid"},
]

for changes in invalid_changes:
    try:
        TransferCreate(**(valid | changes))
    except ValidationError:
        continue
    raise AssertionError(f"Invalid transfer accepted: {changes}")

print("Invalid transfers rejected")