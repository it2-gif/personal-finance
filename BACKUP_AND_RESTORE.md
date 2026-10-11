# Backup and restore

CSV export is useful for reading your records, but it is not a complete database backup.

## Railway protection

In Railway, open the PostgreSQL service and use the **Backups** tab:

1. Enable daily backups.
2. Add weekly and monthly retention when the database contains real financial data.
3. Create a manual backup before every database migration.
4. Enable point-in-time recovery before public use if its storage cost is acceptable.

Restoring a Railway volume backup is staged first. Review the staged volume change before deploying it. Never wipe the source volume as a cleanup step because its backups are deleted with it.

## Portable logical backup

Install PostgreSQL client tools, then use Railway's public database URL in a temporary PowerShell environment variable:

```powershell
$env:PF_DATABASE_URL = "PASTE_DATABASE_PUBLIC_URL_HERE"
pg_dump $env:PF_DATABASE_URL --format=custom --no-owner --file="personal-finance-backup.dump"
Remove-Item Env:PF_DATABASE_URL
```

Do not put the real database URL inside this file, a script, command history you share, or an exported CSV.

Railway recommends using a CLI tunnel instead of the public TCP proxy for larger recurring dumps:

```powershell
railway connect postgres --tunnel-only
```

Use the connection details printed by that command with `pg_dump` in a second terminal.

## Restore drill

Never test a restore over the production database. Restore into a separate scratch database:

```powershell
pg_restore --dbname="SCRATCH_DATABASE_URL" --no-owner --exit-on-error "personal-finance-backup.dump"
```

After restoration:

1. Compare table row counts.
2. Check recent accounts, transactions, transfers, and statements.
3. Confirm migrations are at the expected head.
4. Record how long the restore took.
5. Delete only the scratch database after verification.

Official reference: https://docs.railway.com/guides/postgres-backups-restores

## Safe test-data cleanup

The cleanup tool defaults to a dry run and requires exact numeric IDs:

```powershell
cd "E:\My projects\personal-finance\backend"
.\.venv\Scripts\python.exe cleanup_test_data.py --transaction-ids 12,13 --transfer-ids 7
```

Review the printed IDs. Apply only when every target is confirmed test data:

```powershell
.\.venv\Scripts\python.exe cleanup_test_data.py --transaction-ids 12,13 --transfer-ids 7 --apply
```

Transactions and transfers are reversed, accounts are archived, and only unpaid statement records are removed. Real ledger history is never silently deleted.
