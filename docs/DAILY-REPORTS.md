# Daily reports

The Android Reports tab now opens on today's Philippine calendar date. **Yesterday** shows the previous day's total and the transactions behind it in one tap. Previous/next-day controls and the native date picker support reviewing earlier days. Future dates are disabled. Today follows the Manila date after midnight or app resume; an explicitly selected earlier date stays selected.

The daily spending total comes first, followed by income/net figures, comparison with the previous day, and a paginated transaction list. Tapping a transaction opens the existing editor. Successful create/edit/delete operations invalidate both daily totals and daily lists. Category spending and a seven-day income/expense trend provide context below the records. Empty days show zero and an explicit empty state. Monthly budget calculations and the dashboard's monthly overview retain their existing meaning.

The website Reports page also uses a date selector, daily totals, previous-day comparison, seven-day chart, and date-scoped CSV export.

## API

- `GET /api/v1/reports/daily?day=YYYY-MM-DD`: selected-day totals/count/category breakdown, previous-day totals and seven calendar days including zeros.
- `GET /api/v1/transactions?month=YYYY-MM&day=YYYY-MM-DD&page=1&page_size=20`: server-filtered, owner-scoped daily transaction pagination. A day outside the specified month is rejected.
- `GET /api/v1/reports/export?day=YYYY-MM-DD`: exports only that day. Formula escaping is retained. Existing monthly API routes/exports remain compatible with older clients.

Daily summaries use two SQL aggregate queries, exact decimal money arithmetic and existing session/ownership checks. No schema migration, duplicate database, sample production records, or new credentials are needed.

## Verification on 2026-10-29

- 21 backend tests passed, including date isolation, owner isolation, decimal totals, leap/year boundaries, empty days, invalid dates, daily CSV filtering/escaping and transaction pagination.
- 18 web/shared/mobile unit tests passed (temporary release copies excluded).
- Mobile TypeScript and lint checks passed; Android Metro export succeeded.
- The successful cloud build's Expo Doctor result was 19/20: its remaining warning recommends newer SDK 58 patch versions for eight existing Expo packages. This feature update retained the previously used dependency versions; no new native dependency was added.
- The actual Expo screens were exercised via the browser renderer against an isolated test database: Today, Yesterday, earlier empty day, transaction editing, return to Reports, and refreshed totals/list.
- Production health returned HTTP 200. Daily report and transaction routes returned HTTP 401 without a session.

APK installation and the native Android calendar UI still require a physical-phone smoke test. Build/download status is recorded in the mobile README only after EAS confirms success. Install the update over the existing app; do not uninstall first.

## Android delivery

Expo completed version **1.0.2**, Android build **3**, on 2026-10-29. [Download APK](https://expo.dev/artifacts/eas/9tXnoSLEyNNO5Yu73btsrmLecu72wbhlY9nEXZvRnVk.apk) · [Successful build](https://expo.dev/accounts/dynnn/projects/track-expense-mobile/builds/1acc294f-a4c0-440c-bfe0-d34d3710c8fa). The existing signing key and package were reused. Update the installed app without uninstalling, then open **Reports → Yesterday**. The native build includes the pre-existing released UI/session fixes present in the workspace. The daily API and day-filtered transaction API are live on the existing production backend.
