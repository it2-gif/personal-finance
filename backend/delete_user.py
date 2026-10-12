import argparse

from sqlalchemy import delete, or_, select

from database import SessionLocal
from models import (
    Account,
    AccountSaveReceipt,
    CreditCardStatement,
    LoginSession,
    StatementPaymentAllocation,
    Transaction,
    TransactionSaveReceipt,
    Transfer,
    TransferSaveReceipt,
    User,
)


parser = argparse.ArgumentParser(description="Delete one user and all of their financial data.")
parser.add_argument("--email", required=True)
parser.add_argument("--apply", action="store_true")
args = parser.parse_args()

email = args.email.strip().lower()

with SessionLocal.begin() as db:
    user_id = db.scalar(select(User.id).where(User.email == email))
    if user_id is None:
        raise SystemExit("Account not found. Nothing changed.")

    account_ids = list(db.scalars(select(Account.id).where(Account.user_id == user_id)))
    transfer_ids = list(db.scalars(select(Transfer.id).where(or_(Transfer.from_account_id.in_(account_ids), Transfer.to_account_id.in_(account_ids))))) if account_ids else []
    statement_ids = list(db.scalars(select(CreditCardStatement.id).where(CreditCardStatement.account_id.in_(account_ids)))) if account_ids else []
    transaction_count = db.query(Transaction).filter(Transaction.account_id.in_(account_ids)).count() if account_ids else 0

    print(f"User: {email}")
    print(f"Accounts: {len(account_ids)}")
    print(f"Transactions: {transaction_count}")
    print(f"Transfers: {len(transfer_ids)}")
    print(f"Statements: {len(statement_ids)}")

    if not args.apply:
        db.rollback()
        print("Dry run only. Add --apply to permanently delete these records.")
    else:
        if transfer_ids or statement_ids:
            conditions = []
            if transfer_ids:
                conditions.append(StatementPaymentAllocation.transfer_id.in_(transfer_ids))
            if statement_ids:
                conditions.append(StatementPaymentAllocation.statement_id.in_(statement_ids))
            db.execute(delete(StatementPaymentAllocation).where(or_(*conditions)))
        if statement_ids:
            db.execute(delete(CreditCardStatement).where(CreditCardStatement.id.in_(statement_ids)))
        if transfer_ids:
            db.execute(delete(Transfer).where(Transfer.id.in_(transfer_ids)))
        if account_ids:
            db.execute(delete(Transaction).where(Transaction.account_id.in_(account_ids)))
        db.execute(delete(AccountSaveReceipt).where(AccountSaveReceipt.user_id == user_id))
        db.execute(delete(TransactionSaveReceipt).where(TransactionSaveReceipt.user_id == user_id))
        db.execute(delete(TransferSaveReceipt).where(TransferSaveReceipt.user_id == user_id))
        db.execute(delete(LoginSession).where(LoginSession.user_id == user_id))
        if account_ids:
            db.execute(delete(Account).where(Account.id.in_(account_ids)))
        db.execute(delete(User).where(User.id == user_id))
        print("User and related financial data deleted.")
