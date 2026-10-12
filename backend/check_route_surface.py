import os
import tempfile

database_file = tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False)
database_file.close()
os.environ["DATABASE_URL"] = f"sqlite:///{database_file.name}"
os.environ["APP_ENV"] = "development"

from secure_app import app


paths = {getattr(route, "path", "") for route in app.router.routes}
required = {
    "/api/health",
    "/api/auth/signup",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/reset-password",
    "/api/auth/recovery-vault",
    "/api/auth/change-password",
    "/api/auth/account",
    "/api/auth/me",
    "/api/vault",
}
legacy_roots = (
    "/api/accounts",
    "/api/transactions",
    "/api/transfers",
    "/api/statements",
    "/api/summary",
    "/api/export",
)

missing = required - paths
assert not missing, f"Required encrypted routes are missing: {sorted(missing)}"
assert not any(
    path == root or path.startswith(f"{root}/")
    for path in paths
    for root in legacy_roots
), "A legacy plaintext finance route is still registered"

os.unlink(database_file.name)
print("Encrypted production route surface checks passed")
