# Spendwise encrypted-vault deployment

Spendwise now stores financial records as one authenticated, client-encrypted vault per user. PostgreSQL receives ciphertext and key envelopes only. Email addresses, password hashes, recovery-code hashes, session metadata, vault revision numbers, and encryption parameters remain visible to the service because they are required for authentication and synchronization.

## One-time destructive reset

Migration `4f0d2b9e8c61` deletes every existing test user and every plaintext financial record after creating `encrypted_vaults`. This was intentionally authorized because the database contains test data only. It must never be reused as a migration strategy on a database containing real client data.

The migration is not data-reversible. Its downgrade removes the encrypted-vault table but cannot recreate deleted test records.

## Cryptographic design

- Financial JSON is encrypted in the browser with AES-256-GCM.
- A random data-encryption key protects the vault.
- PBKDF2-SHA-256 with 600,000 iterations derives separate password and recovery wrapping keys from independent random salts.
- Password changes rewrap the data key; they do not decrypt data on the server.
- Recovery unwraps the data key with the old recovery code and atomically installs a new password wrapper and recovery-code wrapper.
- Optional OS-managed biometric unlock uses a WebAuthn passkey PRF to wrap the data key. Unsupported devices fall back to the password.
- The server stores no plaintext financial records and never receives a vault decryption key.
- Optimistic revision checks prevent one device from silently overwriting a newer vault.

## Deployment order

1. Confirm again that every current account is disposable test data.
2. Keep `DATABASE_URL=${{Postgres.DATABASE_URL}}` on the backend.
3. Keep the Postgres public TCP proxy disabled.
4. Keep `BACKEND_URL=https://backend-production-73d2.up.railway.app` on the frontend and keep `VITE_API_URL` absent.
5. Deploy backend and frontend from the same commit during a maintenance window. The old frontend is incompatible with the ciphertext-only backend.
6. Confirm the backend pre-deploy migration reaches `4f0d2b9e8c61`.
7. Open `/api/health` through the frontend and confirm the database is connected.
8. Create a new account, save its recovery code, add test records, close the PWA, and unlock it again.
9. Test password change and recovery before entering real data.
10. Enable biometric unlock only on a supported device, close the PWA, and verify both biometric and password fallback unlock.

## Database verification

After creating test financial records:

- `encrypted_vaults.ciphertext` must contain binary ciphertext.
- `accounts`, `transactions`, `transfers`, and `credit_card_statements` must remain empty.
- Requests sent to `/api/vault` must contain base64 ciphertext and key envelopes, never account names or amounts.
- Direct requests to legacy finance endpoints must return HTTP `410`.

## Required external review

The automated tests cover authenticated encryption, tamper rejection, password/recovery equivalence, password rewrapping, ledger calculations, revision conflicts, and per-user vault isolation. Before marketing Spendwise as a security product or accepting high-value client data, commission an independent application-security and cryptography review. Browser-delivered end-to-end encryption cannot protect users if the deployed JavaScript or origin is compromised.
