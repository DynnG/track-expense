# Enable Google sign-in

The implementation uses Google's authorization code flow with PKCE, signed ID-token validation, nonce checks and browser-bound single-use state. Only `openid email profile` is requested. Access and refresh tokens are discarded; financial records are not sent to Google. Existing accounts must sign in with their password and explicitly connect Google in Settings. Matching email addresses are never automatically linked.

1. In Google Cloud, select your project and configure the Google Auth Platform consent screen. For Testing mode, add the accounts that will test sign-in as test users.
2. Create an OAuth client with application type **Web application**. Add this exact authorized redirect URI for local development:
   `http://127.0.0.1:5176/api/v1/auth/google/callback`
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the API process environment, then restart the API. Keep the secret out of frontend code, Git, screenshots and chat. The example env file documents the names; the app does not automatically load it.
4. Keep `FRONTEND_ORIGIN=http://127.0.0.1:5176` locally. For production, configure the exact HTTPS origin and its matching `/api/v1/auth/google/callback` redirect in Google Cloud. Run Alembic migrations before starting the production API. Google sign-in remains disabled until both credentials are set.
5. Test a new Google account, returning sign-in, cancellation and explicitly linking an existing account. Linking requires a login within the previous ten minutes. Request only the scopes above when publishing the consent screen.

Example PowerShell (replace the placeholders privately in your environment):

```powershell
$env:GOOGLE_CLIENT_ID = 'your-client-id.apps.googleusercontent.com'
$env:GOOGLE_CLIENT_SECRET = 'your-client-secret'
./scripts/start.ps1
```

Session cookies use HttpOnly and SameSite=Lax, plus Secure in production. Session and CSRF tokens rotate after successful Google authentication. OAuth attempts expire after ten minutes and are consumed atomically. API access logs remove query strings so authorization codes are not logged. Ensure your reverse proxy also redacts query strings for the callback. No arbitrary callback destination is accepted.

Automated tests mock Google's exchange and use locally signed RSA tokens to exercise identity validation; a live Google login still requires your configured OAuth credentials.

References: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server).
