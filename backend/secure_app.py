"""Production entry point exposing only authentication and encrypted-vault APIs.

Legacy plaintext models and migrations remain temporarily available for schema
history and rollback analysis, but their HTTP handlers are removed from the
production router here. A later migration can drop the empty legacy tables
after the encrypted release has completed its retention window.
"""

from main import LEGACY_FINANCE_PATHS, app


def is_legacy_route(route) -> bool:
    path = getattr(route, "path", "")
    return any(path == root or path.startswith(f"{root}/") for root in LEGACY_FINANCE_PATHS)


app.router.routes = [route for route in app.router.routes if not is_legacy_route(route)]

