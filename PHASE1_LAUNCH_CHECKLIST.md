# Spendwise Phase 1 launch checklist

Complete this checklist before accepting real client financial data.

## Implemented in the application

- End-to-end encrypted financial vault with authenticated encryption.
- Password and recovery-code key wrapping.
- Optional operating-system biometric/passkey vault unlock.
- Recovery-code paste-back verification and safe text download.
- Encrypted portable backup download and password-based restore.
- Optimistic vault revisions with a safe multi-device conflict refresh.
- Client error boundary that does not expose financial contents.
- Public Privacy, Terms, Security, and Support drafts.
- Same-origin API proxy, secure HTTP-only production cookies, origin checks, trusted-host checks, rate limiting, and restrictive browser headers.
- Production router allowlist: Railway starts `secure_app:app`, which removes every legacy plaintext financial HTTP handler while preserving migration history.

## Railway actions required

1. Enable automatic PostgreSQL backups with at least 30 days of retention.
2. Store a periodic encrypted database backup outside the primary Railway project.
3. Restore a backup into a separate scratch database and verify `/api/health` plus a disposable test account.
4. Configure an uptime monitor for the public page and `/api/health`.
5. Configure alerts for failed deployments, HTTP 5xx responses, database storage, and backup failures.
6. Keep `alembic upgrade head` as the backend pre-deploy command, never as the start command.

Do not test restoration over the production database.

## Business details required

- Replace the placeholder Support contact with a dedicated support email.
- Add the legal business/operator name, governing country, effective date, and contact details to Privacy and Terms.
- Publish a service status page.
- Define database-backup retention and account-deletion retention accurately.
- Decide the supported countries, currencies, timezones, and minimum user age.

The included legal pages are technical drafts, not legal advice. Obtain qualified legal review for the markets where Spendwise will operate.

## Independent review required

Commission an application-security and cryptography review covering:

- vault encryption, key wrapping, recovery, passkey PRF, and ciphertext rollback;
- XSS, content-security policy, browser extensions, and JavaScript supply chain;
- authentication, sessions, account enumeration, rate limiting, and CSRF;
- deployment permissions, database/network exposure, secrets, logs, and backups;
- dependency, container, and infrastructure scanning.

Resolve all critical/high findings before public launch. Retest after fixes.

## Checks to run locally

From `frontend`:

```text
npm test
npm run lint
npm run build
```

From `backend`, using the production-compatible Python environment:

```text
python check_security.py
python check_encrypted_vault.py
python check_route_surface.py
alembic heads
```

Then test signup, verified recovery-code capture, login, every ledger operation, simultaneous-device conflict, password reset, encrypted backup restore, passkey unlock, export, sign out, and account deletion with disposable accounts.
