# Track Expense

A React + TypeScript expense tracker with a FastAPI API, peso accounting, budgets, monthly charts, and the supplied mascot. The interface combines subtle neumorphic controls with frosted panels. Users must sign in before accessing the workspace; financial records are stored on the server.

## Run locally (Windows)

```powershell
npm.cmd ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
.\scripts\start.ps1
```

Open http://127.0.0.1:5176. The start script runs FastAPI on port 8000 and Vite on 5176. Stop with Ctrl+C. If either port is already occupied, stop the previous **Track Expense** server before starting another copy. Do not stop unrelated applications.

For separate terminals:

```powershell
$env:FRONTEND_ORIGIN = 'http://127.0.0.1:5176'
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

```powershell
npm.cmd run dev -- --port 5176 --strictPort
```

Sign in or create an account on the entry page. New accounts begin empty. Development records persist in the ignored `track_expense.db` file. Local SQLite is a development convenience; production requires PostgreSQL.

## Implemented

- Create, edit, delete, search, filter by month/category/type, and paginate income and expenses.
- Philippine peso display; positive decimal amounts on the server and integer centavo calculations in the client.
- Overall and category monthly budgets, remaining limits, and alerts from 80% usage.
- Six-month charts, category breakdown, net balance, previous-month comparison, and CSV exports with formula escaping.
- Registration, login, logout, Argon2id hashes, server-managed cookie sessions, rotation, 30-minute idle timeout, seven-day absolute expiry, CSRF protection, and account-scoped queries.
- Strict request schemas, bounded inputs, category ownership, request-body limits, sanitized errors, structured request logs, audit events, and database-backed rate limits.
- React error boundaries, loading/empty/error states, native dialog focus trapping, keyboard controls, reduced-motion support, and mobile navigation.
- PostgreSQL-capable SQLAlchemy schema and initial Alembic migration.
- Operator-issued single-use password recovery tokens. **Email delivery and email verification are not configured.**
- AES-256-GCM backup and staging restore tools, liveness/readiness checks, dependency lockfiles, Dependabot configuration, and CI build/test/security scans.

## Validate

```powershell
npm.cmd run build
npm.cmd test
npm.cmd audit
New-Item -ItemType Directory -Path '.tmp' -Force
.\.venv\Scripts\python.exe -m pytest backend -q
.\.venv\Scripts\python.exe -m pip_audit -r backend/requirements.lock.txt
```

Tests use their own temporary database, never your development database. They cover ownership across read/update/delete/export, decimal totals and month boundaries, CSRF, session rotation/expiry, rate limits, recovery token reuse, export safety, and authenticated backup round-trip recovery.

## Production handoff

Read [docs/OPERATIONS.md](docs/OPERATIONS.md) before deployment. Production hosting, PostgreSQL credentials, HTTPS, storage encryption, backup scheduling, external monitoring alerts, and email delivery require your selected services. They are **not active merely because their code/configuration exists**. PostgreSQL integration and PostgreSQL backup restoration must be tested on the selected provider before release.

`vercel.json` deploys the React frontend and FastAPI backend together using Vercel Services (currently beta). Both use the same HTTPS origin, with `/api` routed to FastAPI. Production requires a managed PostgreSQL database, `APP_ENV=production`, an exact HTTPS `FRONTEND_ORIGIN`, and completed Alembic migrations. Set secrets through the hosting service, never in Git. Google sign-in additionally requires the credentials documented below.

## Mascot

`public/assets/mascot-3d.png` is the transparent 3D-style image used in the dashboard. It is a raster image, not a GLB mesh. The original asset and generation prompt remain in `assets/`.
# Google sign-in

Google login and explicit account linking are available once server credentials are configured. Follow [the Google setup guide](docs/GOOGLE_SIGN_IN.md). The client secret stays on the API server; Google sign-in is disabled until setup is complete.
