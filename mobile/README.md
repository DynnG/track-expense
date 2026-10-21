# Track Expense for Android

Separate Expo SDK 58 / React Native 0.88 app, with Expo Router tabs and TanStack Query. The existing React website stays at the repository root; FastAPI and the existing database serve both clients. Shared peso arithmetic and validation live in `../shared`. No second production database or sample financial records are created.

## Features

- Home: monthly income, expenses, balance, budget remaining, categories and recent transactions.
- History: paginated native list, month/category/type filters, debounced search, newest first.
- Add/edit/delete transactions with peso validation, native date/category controls, retained inputs on failure and explicit delete confirmation.
- Overall/category budgets, usage, remaining amounts and create/edit/delete.
- Monthly reports, category bars and six-month trends.
- Email/password sign-in and registration, protected screens, safe areas, keyboard-aware forms, offline notice, retry and pull-to-refresh.

All screens use real API responses. Mutations refresh affected query caches; returning to the foreground refreshes active data. There is no background polling or offline write queue. A connection is required to save. Failed saves retain the current form, and success appears only after server confirmation.

## Start on Android

Use Node 24 LTS. From PowerShell in the repository:

```powershell
cd mobile
npm ci
Copy-Item .env.example .env.local
npx expo start
```

The example points to `https://track-expense-seven.vercel.app`. Install a matching SDK 58 Expo Go on Android and scan the terminal QR code on the same Wi-Fi. If Expo Go does not support this SDK, use the installable preview APK instead. Use your existing Track Expense email/password account; Expo credentials are only for development/building.

For an emulator with a local API use `http://10.0.2.2:8000`; on a physical phone use your computer's LAN address and start the development API with `--host 0.0.0.0`. Local HTTP is development-only. Restart Expo after changing `EXPO_PUBLIC_API_URL`.

## Build an installable APK

The linked project is `@dynnn/track-expense-mobile`. The `preview` profile produces a signed APK for direct installation; `production` prepares an AAB for a future Play Store release.

```powershell
cd mobile
npm ci
npx eas-cli@latest login --browser
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://track-expense-seven.vercel.app --environment preview --visibility plaintext
npx eas-cli@latest build --platform android --profile preview
```

Approve Expo's browser authorization on the computer. This flow needs no phone notification or emailed code. EAS may ask to generate an Android keystore on the first build; retain that signing identity for future updates. Follow the resulting build link, download the APK on your Android phone and allow installation from that browser/file manager when Android asks. No Play Store account is needed for direct APK installation. Do not publish signing keys or passwords.

For a future store build, set the same public HTTPS API variable in the `production` environment and run:

```powershell
npx eas-cli@latest build --platform android --profile production
```

Store listing, Google Play account setup and publication are separate steps. No store release is performed automatically.

## API and security

Native sign-in/register/me/logout use `/api/v1/mobile/auth/*`; all financial CRUD and reports reuse the web endpoints and ownership checks. Sessions expire after 30 minutes idle or seven days absolute. Native tokens use a separate hash namespace, cannot replace web cookies, and are stored only in Expo SecureStore on Android/iOS. Browser previews keep tokens in memory. Passwords and financial query caches are not persisted to disk. Logout revokes the current session; password reset revokes all sessions. Existing web cookie/Origin/CSRF protections remain enforced. APK/store builds reject missing, non-HTTPS or non-origin API URLs. The API address is public configuration, never a database secret.

## Verification

```powershell
# mobile folder
npm run typecheck
npm run lint
npx expo-doctor
npm run export:android
# repository root
npm test -- --run
npm run build
.\.venv\Scripts\python.exe -m pytest backend -q
```

Backend integration tests cover native/web shared records and totals, CRUD, budgets, ownership isolation, invalid/expired sessions, logout isolation and production Origin/CSRF protection. Shared validation tests cover centavos, dates and API URL restrictions. Android Metro export compiles the actual native dependency graph, but does not prove installation, device rendering or Android secure-storage behavior. No Android SDK/emulator was available locally; a physical-device smoke test remains necessary after installing the APK.

Verification on 2026-10-21: 15 backend tests and 10 web/shared tests passed, web production build passed, mobile typecheck/lint passed and Expo Doctor passed 20/20 checks. Expo started successfully. The actual React Native screens were exercised through Expo's browser renderer against an isolated SQLite test API: sign-in, every main tab, transaction create/edit/reopen/delete, matching report and budget totals, confirmation prompts, failed-save input retention and successful retry. This browser check is separate from physical Android verification. Production website returned HTTP 200 and the protected mobile session route returned the expected HTTP 401 without a token.

The Expo toolchain currently reports upstream npm advisories involving braces, node-forge and uuid. Nonbreaking updates were applied; npm's proposed force fix downgrades Expo to an incompatible SDK and was not applied. Review upstream fixes before a store release. APK build status and download URL are reported separately only after EAS confirms success.
