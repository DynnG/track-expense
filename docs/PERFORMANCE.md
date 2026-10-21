# Google sign-in removal and performance review

Implemented on 2026-10-21 without changing the React/Vite, FastAPI/SQLAlchemy, or PostgreSQL architecture. Email/password authentication and the login-first screen remain required. No production records were modified during testing, and no schema migration was added.

## Findings and changes

- There was no separate Google logging service. The user confirmed removal of Google **sign-in and account linking**. Removed `backend/google_auth.py`, `src/GoogleConnection.tsx`, their route registration, provider discovery/status requests, callback handlers, buttons, CSS, example environment variables and PyJWT dependency. Google calls were not part of the expense-write path and were not the source of the repeated report reads. Kept request diagnostics, query-string redaction, shared `httpx` test dependency, shared `cryptography` backup dependency and unrelated Google Fonts. Vercel's environment listing contained no Google OAuth variables to remove.
- The monthly report previously queried transactions seven times: once for the selected month and once for each of six trend months (including the selected month again). Each query materialized every matching transaction as an ORM object. It now uses two bounded SQL aggregates: day/type sums and counts for the six-month window, plus selected-month category totals. Exact Decimal amounts stay as strings in the API. Monthly, daily, category, previous-month and count calculations remain consistent.
- The frontend previously fetched category totals separately from the monthly report, duplicating reads of the same month. The report now includes `breakdown`, removing that request. The existing category-report endpoint remains available for compatibility and uses SQL aggregation. Reports and budgets still load across workspace pages because the shared header needs them for budget notifications; that working feature is retained.
- Every mutation previously invalidated every query, including categories and budgets that had not changed. Transaction writes now invalidate only reports, history and recent transactions for the current user. Budget writes invalidate budgets only. All cached report months are invalidated after transaction writes because moving a transaction can affect both totals and six-month trends. No new persistent or server cache was introduced.
- Chart transformation and Recharts rendering previously ran when unrelated parent state changed (dialogs, notifications, search typing). Chart components and the paginated transaction table are now memoized with stable data and event-handler props. Lightweight arithmetic stays simple. The existing 300 ms search debounce and server pagination remain in place; superseded queries now receive cancellation signals.
- API calls and CSV downloads now have a 20-second timeout and friendly failure messages. Timed-out writes are never automatically retried; users are told to check their records before retrying. Existing loading/saving indicators and validation remain intact.
- Request-scoped SQLAlchemy sessions now use `expire_on_commit=False`, avoiding repeated refresh SELECTs of the same session, user or just-saved transaction after rate-limit and save commits. Sessions are still closed after each request; there is no cross-request object cache. Authentication, session expiry, CSRF, ownership and rate limits still run.
- Transaction pagination's count query no longer sorts its subquery. The existing `(user_id, transaction_date)` index matches the date-bounded query pattern; no new index or schema change was justified.
- Browser verification uncovered a pre-existing edit failure: React Hook Form retained the record's `id` in submitted defaults, while the API rejects unknown fields. A transaction input serializer now whitelists editable fields before POST/PATCH. A regression test covers this failure without weakening backend validation.

## Measurements

The reproducible benchmark is `scripts/benchmark-reports.py`. It compares the historical report at commit `955eadb` with the new implementation, using 12,000 synthetic records across six months in a temporary SQLite database. It runs each implementation six times, discards the first timing, and reports the remaining median. It never uses the development or production database.

| Measurement | Before | After |
| --- | ---: | ---: |
| Report median on this machine | 222.30 ms | 29.18 ms |
| Transaction SELECTs per report | 7 | 2 |
| Selected-month expense | 21,163.10 | 21,163.10 |
| Selected-month transaction count | 2,000 | 2,000 |
| Workspace data GETs on a fresh dashboard, excluding session/login | 5 | 4 |
| Data GETs after a dashboard transaction write | 5 | 2 |
| Data GETs after a dashboard budget write | 5 | 1 |

These are local measurements and request counts, not production latency claims. The browser confirmed the optimized save/refetch flows against an isolated test API. Raw browser timing and React render profiling were unavailable through the connected browser interface, so no numerical initial-load, list-render or interaction-speed claim is made. The production main bundle decreased from 405.35 kB to approximately 403.37 kB; the lazy chart bundle remains approximately 386 kB.

## Verification

Before changes: `python -m pytest backend -q` passed 15 tests; `npm test -- --run` passed 2 tests; `npm run build` passed.

After changes: backend suite passes 12 tests, frontend suite passes 7 tests, and the production build passes. Retired provider tests were replaced with tests confirming the Google routes return 404 and email/password login still works. New tests cover aggregate query counts, exact centavos, previous-month/year boundaries, empty reports, edit/delete report updates, category totals, pagination, filters, cancellation, timeouts and the read-only-ID edit regression. Existing ownership, recovery, CSRF, rate-limit, origin and backup checks still pass.

Browser checks used an isolated SQLite database under `.tmp`, a synthetic account and synthetic transactions. Verified login without provider requests, adding an expense, editing its amount, debounced search, deleting that test expense, setting an overall budget, persistence across refresh, peso balances and chart labels. Console error/warning capture was empty. Local request diagnostics confirmed two report/history GETs after a transaction write and one budgets GET after a budget save. Existing tests also verify invalid inputs and sanitized failures.

Only intentional Google references remain: negative route tests, historical migration 0002, retirement/recovery documentation and unrelated Google Fonts. Historical identity tables are preserved, not dropped; future migrations must not delete them automatically. See [retirement and recovery notes](GOOGLE_SIGN_IN.md).

## Remaining limits

Production latency still depends on database/network distance, serverless startup and database wake-up. These were not attributed a measured share of lag in this local run. The chart bundle is still relatively large, but is lazy-loaded; replacing the chart library would exceed the requested targeted scope. Very large month histories may eventually need cursor pagination or specialized search indexing; current history requests remain capped at 100 records, with 10 shown per page. Profile production with representative data before adding indexes or longer-lived caches.

Implementation references: [React memo](https://react.dev/reference/react/memo), [SQLAlchemy request/session guidance](https://docs.sqlalchemy.org/en/20/orm/session_basics.html).
