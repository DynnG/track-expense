# Retired Google sign-in

Google sign-in and account linking have been removed. Email/password sign-in, registration, server-side sessions and operator-assisted recovery remain available. No Google provider requests or OAuth routes remain active.

Migration 0002 is retained unchanged so existing installations can migrate normally. Its historical `google_identities` and `oauth_attempts` tables are deliberately left in place; no account, financial record, or external identity record is deleted. These tables are no longer queried by the application. Google-only accounts can use the existing administrator-verified recovery process to set a local password; ownership must be verified before issuing a recovery token.

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are no longer read. Remove them from hosting configuration if previously configured. Local query-redacting access logs remain in place for privacy and diagnostics. Google Fonts used by the existing visual design are unrelated and remain unchanged.
