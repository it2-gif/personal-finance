import argparse
from datetime import datetime, timezone

from sqlalchemy import select

from database import SessionLocal
from models import (
    Account,
    CreditCardStatement,
    StatementPaymentAllocation,
    Transaction,
    Transfer,
)


def ids(value: str) -> list[int]:
    if not value:
        return []
    try:
        return sorted({int(item.strip()) for item in value.split(",") if item.strip()})
    except ValueError as error:
        raise argparse.ArgumentTypeError("IDs must be comma-separated numbers") from error


parser = argparse.ArgumentParser(
    description="Safely reverse or archive confirmed test records. Dry-run is the default."
)
parser.add_argument("--transaction-ids", type=ids, default=[])
parser.add_argument("--transfer-ids", type=ids, default=[])
parser.add_argument("--account-ids", type=ids, default=[])
parser.add_argument("--statement-ids", type=ids, default=[])
parser.add_argument("--apply", action="store_true")
args = parser.parse_args()

now = datetime.now(timezone.utc)

with SessionLocal.begin() as db:
    transactions = db.scalars(
        select(Transaction).where(Transaction.id.in_(args.transaction_ids))
    ).all()
    transfers = db.scalars(
        select(Transfer).where(Transfer.id.in_(args.transfer_ids))
    ).all()
    accounts = db.scalars(
        select(Account).where(Account.id.in_(args.account_ids))
    ).all()
    statements = db.scalars(
        select(CreditCardStatement).where(
            CreditCardStatement.id.in_(args.statement_ids)
        )
    ).all()

    print("Transactions to reverse:", [item.id for item in transactions])
    print("Transfers to reverse:", [item.id for item in transfers])
    print("Accounts to archive:", [item.id for item in accounts])
    print("Statements to remove:", [item.id for item in statements])

    missing = {
        "transactions": sorted(set(args.transaction_ids) - {item.id for item in transactions}),
        "transfers": sorted(set(args.transfer_ids) - {item.id for item in transfers}),
        "accounts": sorted(set(args.account_ids) - {item.id for item in accounts}),
        "statements": sorted(set(args.statement_ids) - {item.id for item in statements}),
    }
    if any(missing.values()):
        raise SystemExit(f"Some IDs were not found; nothing changed: {missing}")

    if not args.apply:
        print("Dry run only. Add --apply after reviewing these exact IDs.")
        db.rollback()
    else:
        for item in transactions:
            item.reversed_at = item.reversed_at or now

        for transfer in transfers:
            if transfer.reversed_at is not None:
                continue
            allocations = db.scalars(
                select(StatementPaymentAllocation).where(
                    StatementPaymentAllocation.transfer_id == transfer.id
                )
            ).all()
            for allocation in allocations:
                statement = db.get(CreditCardStatement, allocation.statement_id)
                if statement is not None:
                    statement.paid_amount = max(
                        statement.paid_amount - allocation.amount, 0
                    )
                db.delete(allocation)
            transfer.reversed_at = now

        for account in accounts:
            account.archived_at = account.archived_at or now

        for statement in statements:
            if statement.paid_amount > 0:
                raise SystemExit(
                    f"Statement {statement.id} has allocated payments; nothing changed."
                )
            db.delete(statement)

        print("Cleanup applied. Financial entries were reversed, not erased.")
