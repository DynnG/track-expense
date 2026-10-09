# Operations and production readiness

## Hosting and secrets

Use a Python-capable backend host and managed PostgreSQL. Build React with `npm ci && npm run build`; host `dist/` as static files. Route `/api/*` to FastAPI under the **same** HTTPS origin as the frontend. Set `APP_ENV=production`, `FRONTEND_ORIGIN=https://your-domain`, and a PostgreSQL `DATABASE_URL` with verified TLS (`sslmode=verify-full` and a provider CA where supported). Keep secrets in the host’s protected environment or secret manager.

Run `python -m alembic upgrade head` before starting production. Production does not auto-create tables. The development database is created automatically; do not run the initial migration over an existing development database without a deliberate migration/stamp process. Use a fresh staging database to verify migration first. Use a dedicated migration role and a least-privilege application role. Application credentials should not be able to modify schema or audit retention policy.

Set the proxy to reject requests above 16 KiB and apply connection/IP rate limits before the API. The API counters are shared through the database; upstream limits must protect unauthenticated reads and connections too. Do not blindly trust forwarding headers. Secure cookies and HSTS activate with production mode. The app assumes same-origin requests, so there is deliberately no permissive CORS configuration.

Frontend security headers on the static host:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

The chart library and inline progress styles require inline style attributes; no inline script is needed. Self-host fonts if external font traffic is undesirable. Development Vite uses looser requirements; apply these headers to the production build.

## Recovery and sessions

Passwords use Argon2id; opaque session values are stored only as SHA-256 digests in the database. CSRF tokens remain in client memory and are matched on every private write. Login rotates the cookie; logout and password reset revoke sessions. Idle expiry is 30 minutes and absolute expiry is seven days.

Account recovery currently requires a trusted operator to verify ownership and run:

```
python -m backend.admin recovery-token
```

Deliver the printed token privately to the verified owner. It expires in 15 minutes and is single-use; the user enters it in the recovery dialog. Never capture operator output in ordinary logs. Automated recovery requires a transactional email provider, ownership verification, generic responses, token delivery throttling, and end-to-end delivery testing. No email-provider credentials or email verification flow are currently configured.

Run `python -m backend.admin cleanup` daily under the operator role to remove expired rate buckets, sessions and recovery tokens. Retain restricted audit events for a documented period (initial recommendation: 90 days) in accordance with the user’s policy. Restrict access to request logs; initial retention target: 30 days. Logs contain request ID, method, duration and status, not request bodies, descriptions, credentials or cookies. Audit records contain user IDs and action names only. Configure centralized restricted log storage and exception alerts on the selected host.

## Encryption and backups

Enable provider storage encryption for the database. A password hash is not database encryption. Obtain storage encryption guarantees and backup retention settings from the provider rather than assuming the application supplies them.

Create a random 32-byte key in your secret manager and expose its base64 encoding as `BACKUP_KEY` to the **backup job only**. Keep this key separately from the archives. Losing it makes backups unrecoverable.

```
python -m backend.backup backup backups/2026-10-09.tebackup
```

This creates an authenticated AES-256-GCM archive. For PostgreSQL, install matching `pg_dump`/`pg_restore` operator tools; credentials are passed in the child process environment, not command arguments. The backup utility currently buffers a dump in memory, so run it on an operator host sized for the database. For very large databases, use the provider’s encrypted streaming backup service instead.

Configure a scheduled operator job for daily backups and copy encrypted archives to restricted storage outside the primary database host. Enable point-in-time recovery if the provider supports it. Set an initial 30-day retention, RPO ≤24 hours and RTO ≤4 hours, then measure these targets. Scheduling and remote storage are not yet configured.

Restore local encrypted backups only to a **new** staging file:

```
python -m backend.backup restore-sqlite backups/2026-10-09.tebackup --target restored-staging.db
```

For PostgreSQL, set `RESTORE_DATABASE_URL` to a distinct empty staging database:

```
python -m backend.backup restore-postgres backups/2026-10-09.tebackup
```

Restoration refuses nonempty PostgreSQL targets and existing SQLite files. Check user/transaction/budget counts, foreign key relationships, selected monthly totals and account isolation. Perform and document this restore drill monthly, with the production provider. Automated tests verify the local encryption/tamper detection/SQLite restore path, not the hosted PostgreSQL recovery procedure.

## Monitoring and release checks

Monitor `/api/v1/health/live` and `/api/v1/health/ready` over HTTPS using the host or an uptime provider. `scripts/check-health.py` exits nonzero when readiness fails. Configure alerts for repeated failures, sustained 5xx responses, slow responses, database connections/storage, login abuse, and missed backups. No external alert destination is configured.

The GitHub workflow runs frontend build, money tests, API isolation/security tests, backup restore tests, npm audit and pip-audit on push/PR and weekly. Dependabot supplies weekly update configuration. These become active after the project is placed in a GitHub repository with Actions and Dependabot enabled. Enable repository secret scanning/push protection separately. Pin workflow actions to verified commit SHAs as part of the production repository policy.

Before launch, verify the full flow on PostgreSQL, test concurrent writes and throttling across workers, configure email verification/recovery, verify provider encryption and backup alerts, restore a production-format backup to staging, and configure error monitoring. Deploy a staging version before exposing accounts publicly.
