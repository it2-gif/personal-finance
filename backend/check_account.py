from sqlalchemy import select

from database import SessionLocal
from models import User

with SessionLocal() as db:
    user = db.scalar(select(User).limit(1))

    if user:
        print("Registered email:", user.email)
    else:
        print("No account found")