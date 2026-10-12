# Railway deployment without Docker

This project deploys as three Railway services:

1. PostgreSQL
2. Backend (`/backend`)
3. Frontend (`/frontend`)

The frontend and backend have separate HTTPS domains. The backend accepts only the configured frontend origin and uses a secure HTTP-only session cookie.

## 1. Create the Railway project

Create a new empty Railway project, then add a PostgreSQL database.

Add two services from the same source repository:

- Backend root directory: `/backend`
- Frontend root directory: `/frontend`

Each directory contains its own `railway.json`. Docker is not used.

## 2. Generate domains

In each application service, open **Settings → Networking** and generate a public domain. Record:

- `BACKEND_DOMAIN`, for example `finance-api.example.up.railway.app`
- `FRONTEND_DOMAIN`, for example `finance.example.up.railway.app`

Use the real generated values below. Do not include a trailing slash.

## 3. Backend variables

Add these variables to the backend service:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_ENV=production
APP_ORIGIN=https://FRONTEND_DOMAIN
ALLOWED_HOSTS=BACKEND_DOMAIN,*.railway.internal
COOKIE_SAMESITE=none
```

If the PostgreSQL service has a different name, select its `DATABASE_URL` using Railway's **Add Reference Variable** control instead of typing the reference manually.

The backend service automatically runs:

```text
alembic upgrade head
```

before each deployment, then starts FastAPI on Railway's assigned `$PORT`. Its health check is `/api/health` and verifies the database connection.

## 4. Frontend variable

Add this build variable to the frontend service:

```text
VITE_API_URL=https://BACKEND_DOMAIN
```

Vite embeds this value during the build. After changing it, redeploy the frontend.

## 5. Deploy and verify

Deploy PostgreSQL first, then the backend, then the frontend.

Verify in this order:

1. Open `https://BACKEND_DOMAIN/api/health` and confirm `status` is `ok` and `database` is `connected`.
2. Open the frontend domain.
3. Sign in.
4. Reload the page and confirm the session remains active.
5. Add a small test entry and confirm it appears in history.
6. Download the export ZIP.
7. Review backend logs and confirm no database URL or password appears.

## 6. User accounts

Visitors can create separate accounts from the public landing page. Every financial record is restricted to its owning user.

Use a unique password of at least 12 characters. Do not store the password in Railway variables or deployment logs.

Signup displays a private recovery code once. Users must store it somewhere safe because password recovery does not use an email provider. A successful password reset replaces the recovery code and signs out every existing session for that account.

## 7. Custom domains

Add custom domains only after the Railway domains work. Then update:

- Backend `APP_ORIGIN`
- Backend `ALLOWED_HOSTS`
- Frontend `VITE_API_URL`

Redeploy both application services after changing domains.

## 8. Backups

Review `BACKUP_AND_RESTORE.md` before entering important financial data. Test a restore using a separate database rather than the production database.
