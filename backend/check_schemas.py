from pydantic import ValidationError

from schemas import SignupRequest

SignupRequest(
    email="user@example.com",
    password="example-password-123",
)
print("Valid input accepted")

try:
    SignupRequest(
        email="invalid-email",
        password="short",
    )
except ValidationError:
    print("Invalid input rejected")
else:
    raise RuntimeError("Validation failed")