from getpass import getpass

from sqlalchemy import delete, select

from auth import password_hasher
from database import SessionLocal
from models import LoginSession, User

email = input("Owner email: ").strip().lower()
if not email or "@" not in email:
    raise SystemExit("Enter a valid email address. Nothing changed.")

password = getpass("New password (12–128 characters): ")
confirmation = getpass("Confirm new password: ")

if not 12 <= len(password) <= 128:
    raise SystemExit("Password must contain 12–128 characters.")

if password != confirmation:
    raise SystemExit("Passwords do not match. Nothing changed.")

hashed_password = password_hasher.hash(password)

with SessionLocal.begin() as db:
    user = db.scalar(
        select(User).where(User.email == email)
    )

    if user is None:
        raise SystemExit("Account not found. Nothing changed.")

    user.password_hash = hashed_password
    db.execute(
        delete(LoginSession).where(LoginSession.user_id == user.id)
    )

print("Password reset successfully.")
