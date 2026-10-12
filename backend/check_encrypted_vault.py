import base64
import os
import tempfile

database_file = tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False)
database_file.close()
os.environ["DATABASE_URL"] = f"sqlite:///{database_file.name}"
os.environ["APP_ENV"] = "development"

from fastapi import HTTPException, Response

from database import Base, SessionLocal, engine
from main import get_vault, put_vault
from models import User
from schemas import VaultWrite


def vault_payload(expected_revision=None, marker=b"owner-a"):
    return {
        "format_version": 1,
        "expected_revision": expected_revision,
        "password_kdf_salt": base64.b64encode(b"p" * 16).decode(),
        "password_kdf_iterations": 600_000,
        "password_wrap_nonce": base64.b64encode(b"n" * 12).decode(),
        "password_wrapped_key": base64.b64encode(b"w" * 48).decode(),
        "recovery_kdf_salt": base64.b64encode(b"r" * 16).decode(),
        "recovery_kdf_iterations": 600_000,
        "recovery_wrap_nonce": base64.b64encode(b"m" * 12).decode(),
        "recovery_wrapped_key": base64.b64encode(b"x" * 48).decode(),
        "passkey_envelope": None,
        "data_nonce": base64.b64encode(b"d" * 12).decode(),
        "ciphertext": base64.b64encode(marker * 4).decode(),
    }


Base.metadata.create_all(engine)
with SessionLocal() as db:
    first = User(email="first@example.com", password_hash="unused")
    second = User(email="second@example.com", password_hash="unused")
    db.add_all([first, second])
    db.commit()
    db.refresh(first)
    db.refresh(second)

    created = put_vault(VaultWrite(**vault_payload()), Response(), first, db)
    assert created.revision == 1
    try:
        get_vault(Response(), second, db)
        raise AssertionError("Second user unexpectedly read the first vault")
    except HTTPException as error:
        assert error.status_code == 404

    second_created = put_vault(VaultWrite(**vault_payload(marker=b"owner-b")), Response(), second, db)
    assert second_created.ciphertext != get_vault(Response(), first, db).ciphertext

    try:
        put_vault(VaultWrite(**vault_payload(expected_revision=99)), Response(), first, db)
        raise AssertionError("A stale vault revision was accepted")
    except HTTPException as error:
        assert error.status_code == 409

engine.dispose()
os.unlink(database_file.name)
print("encrypted vault authorization checks passed")
