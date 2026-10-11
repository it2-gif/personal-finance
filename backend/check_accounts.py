from pydantic import ValidationError

from schemas import AccountCreate


AccountCreate(name="Cash", opening_balance="50.00")
AccountCreate(name="Bank", account_type="bank")
AccountCreate(
    name="Visa",
    account_type="credit",
    credit_limit="10000.00",
    opening_balance="-2000.00",
)
print("Valid accounts accepted")

invalid_accounts = [
    {"name": "Visa", "account_type": "credit"},
    {
        "name": "Visa",
        "account_type": "credit",
        "credit_limit": "0.00",
    },
    {
        "name": "Visa",
        "account_type": "credit",
        "credit_limit": "10000.00",
        "opening_balance": "2000.00",
    },
    {
        "name": "Cash",
        "credit_limit": "10000.00",
    },
]

for data in invalid_accounts:
    try:
        AccountCreate(**data)
    except ValidationError:
        continue
    raise AssertionError(f"Invalid account accepted: {data}")

print("Invalid accounts rejected")