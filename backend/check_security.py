from datetime import datetime, timedelta, timezone

from pydantic import ValidationError

from main import blocked_seconds, login_throttle_key
from models import LoginThrottle
from schemas import ChangePasswordRequest


key = login_throttle_key("Owner@Example.com", "127.0.0.1")
assert len(key) == 64
assert "owner@example.com" not in key
assert key == login_throttle_key(" owner@example.com ", "127.0.0.1")

now = datetime.now(timezone.utc)
record = LoginThrottle(
    key_hash=key,
    failed_attempts=5,
    window_started_at=now,
    blocked_until=now + timedelta(minutes=5),
)
assert blocked_seconds(record, now) > 0
assert blocked_seconds(record, now + timedelta(minutes=6)) == 0

key_wrapper = {
    "password_kdf_salt": "c" * 24,
    "password_kdf_iterations": 600_000,
    "password_wrap_nonce": "b" * 16,
    "password_wrapped_key": "d" * 64,
}

ChangePasswordRequest(
    current_password="old-password-value",
    new_password="new-password-value",
    **key_wrapper,
)

try:
    ChangePasswordRequest(
        current_password="same-password-value",
        new_password="same-password-value",
        **key_wrapper,
    )
except ValidationError:
    pass
else:
    raise AssertionError("Matching old and new passwords were accepted")

print("Security helper checks passed")
