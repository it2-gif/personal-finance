from pydantic import ValidationError

from schemas import TransactionCreate

valid_data = {
    "account_id": 1,
    "type": "expense",
    "amount": "150.00",
    "date": "2026-10-04",
    "category": " Food ",
}

transaction = TransactionCreate(**valid_data)
assert transaction.category == "Food"
print("Valid transaction accepted")

for invalid_amount in ("0", "-10", "1.234", "NaN"):
    try:
        TransactionCreate(
            **{**valid_data, "amount": invalid_amount}
        )
    except ValidationError:
        continue

    raise RuntimeError(f"Invalid amount accepted: {invalid_amount}")

print("Invalid amounts rejected")