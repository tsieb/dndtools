# Google Docs Vault Source — OAuth Setup (manual, one-time)

The Google Docs vault-source connection (import + write-back in the Knowledge/Community
"Connected sources" panel) is **fail-closed**: the option is completely hidden until the
build carries a Google OAuth client id in `VITE_GOOGLE_CLIENT_ID`. Registering that client
is a human step in the Google Cloud console — it cannot be automated from this repo.

The integration uses the OAuth 2.0 **token grant** from the browser (GIS-style
`response_type=token` in a popup — the access token comes back in the redirect fragment, so
there is **no token-endpoint call and no client secret in the bundle**). It requests ONLY the
`https://www.googleapis.com/auth/drive.file` scope (per-file access to files the user
explicitly picks/creates). `drive.file` is a **non-restricted** scope, so no Google
security review is required for testing or small-scale use.

## Steps

1. **Create (or pick) a Google Cloud project** at <https://console.cloud.google.com>
   (suggested name: `dndtools`).
2. **Enable APIs**: APIs & Services → Library → enable **Google Drive API** and
   **Google Docs API**.
3. **Configure the OAuth consent screen**: APIs & Services → OAuth consent screen →
   - User type: **External**, Publishing status: **Testing** is fine (test users only).
   - App name `DND Tools`, your support email.
   - Scopes: add `.../auth/drive.file` (non-sensitive list).
   - Test users: add each Google account that will connect a Docs source.
4. **Create the client id**: APIs & Services → Credentials → Create credentials →
   **OAuth client ID** → Application type **Web application**:
   - Authorized JavaScript origins:
     - `http://localhost:5273` (vite dev)
     - `http://localhost:4273` (vite preview)
     - `https://d1xn0o010v89mt.cloudfront.net` (deployed dev web app — adjust per stage)
   - Authorized redirect URIs — the token grant returns to the app's own page URL
     (popup-first with a full-redirect fallback), so that URL must be a registered
     redirect URI (origin + path, no `#/…` fragment):
     - `http://localhost:5273/`
     - `http://localhost:4273/`
     - `https://d1xn0o010v89mt.cloudfront.net/`
5. **Provide the id to the build** (either):
   - Local dev: add `VITE_GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com` to
     `apps/gm-react/.env.local` (the file `pull-cloud-env.mjs` writes — re-running that
     script overwrites it, so prefer the SSM route below for anything durable).
   - Durable/CI: store it in SSM and let the env pull pick it up:

     ```bash
     aws ssm put-parameter --profile dndtools --region ca-central-1 \
       --name /dndtools/dev/google/client-id --type String \
       --value '<client-id>.apps.googleusercontent.com'
     ```

     (`apps/gm-react/scripts/pull-cloud-env.mjs` reads `google/client-id` as an optional
     parameter; absent ⇒ feature stays hidden.)
6. **Verify**: rebuild/restart the app signed in as a test user → Knowledge → Connected
   sources → "Connect Google Docs" appears; connecting opens the Google popup; after
   consent, an import of a picked Doc round-trips and write-back updates the Doc.

## Notes / gotchas

- **Why the token grant (and not authorization-code + PKCE)**: verified 2026-07-10 against a
  freshly created Web-application client — Google's token endpoint refuses the secret-less
  code exchange (`invalid_request: client_secret is missing.`) even with PKCE; Web clients
  are treated as confidential there, and the app must never ship a secret in the bundle. The
  token grant needs no token-endpoint call at all, which is exactly the model Google's own
  GIS SDK uses for browser apps. The web client's issued `client_secret` is therefore unused;
  it is parked in SSM (`/dndtools/dev/google/client-secret`, SecureString) purely so it never
  lives in a file — nothing reads it.
- **Testing mode tokens expire**: consent-screen "Testing" apps issue short-lived tokens
  without refresh; the app holds them in sessionStorage only and shows an honest
  "sign in again" state on expiry. Publish the consent screen only if/when this leaves
  personal use.
- The client id is **not a secret** (it ships in the JS bundle); the origin allowlist is
  what constrains it.
- Never request broader Drive scopes (`drive`, `drive.readonly`): they are restricted,
  trigger review, and the write-back design doesn't need them.
