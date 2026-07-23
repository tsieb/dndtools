# Google Docs + Calendar — OAuth Setup (manual, one-time)

The Google Docs vault-source connection (import + write-back in the Knowledge/Community
"Connected sources" panel) is **fail-closed**: its sign-in controls stay disabled until the
build carries a Google OAuth client id in `VITE_GOOGLE_CLIENT_ID`. Registering that client
is a human step in the Google Cloud console — it cannot be automated from this repo.

The integration uses a Google Identity Services token client. GIS returns the access token
directly to its popup callback: no redirect fragment, token-endpoint call, or client secret is
used. It requests only `https://www.googleapis.com/auth/drive.file`, so the app can access Docs
it creates. Connecting arbitrary existing Docs is intentionally unavailable until a Google
Picker grant flow is implemented; the app does not compensate by requesting broader Drive access.

## Steps

1. **Create (or pick) a Google Cloud project** at <https://console.cloud.google.com>
   (suggested name: `dndtools`).
2. **Enable APIs**: APIs & Services → Library → enable **Google Drive API**,
   **Google Docs API**, and **Google Calendar API** (the Session screen's "Schedule next
   session" panel — roadmap P2 #8 — uses the same client id).
3. **Configure the OAuth consent screen**: APIs & Services → OAuth consent screen →
   - User type: **External**, Publishing status: **Testing** is fine (test users only).
   - App name `DND Tools`, your support email.
   - Scopes: add `.../auth/drive.file` (non-sensitive list) and `.../auth/calendar.events`
     (sensitive list — scheduling; requested as its own separate token grant, never combined
     with the Docs scope).
   - Test users: add each Google account that will connect a Docs source.
4. **Create the client id**: APIs & Services → Credentials → Create credentials →
   **OAuth client ID** → Application type **Web application**:
   - Authorized JavaScript origins:
     - `http://localhost:5273` (vite dev)
     - `http://localhost:4273` (vite preview)
     - `https://d1xn0o010v89mt.cloudfront.net` (deployed dev web app — adjust per stage)
   - No redirect URI is required for this GIS callback flow.
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
   sources → Google Docs → Sign in with Google; after consent, create a Doc, push a note,
   pull it back, and confirm write-back updates the same Doc.

## Notes / gotchas

- The runtime uses Google's GIS token client and popup callback. Do not add a client secret,
  implicit redirect/fragment parser, or authorization-code exchange to the browser bundle.
- `drive.file` does not automatically grant access to an arbitrary pasted document id. A future
  "connect existing" flow must use Google Picker and keep this same narrow scope.
- **Testing mode tokens expire**: consent-screen "Testing" apps issue short-lived tokens
  without refresh; the app holds them in sessionStorage only and shows an honest
  "sign in again" state on expiry. Publish the consent screen only if/when this leaves
  personal use.
- The client id is **not a secret** (it ships in the JS bundle); the origin allowlist is
  what constrains it.
- Never request broader Drive scopes (`drive`, `drive.readonly`): they are restricted,
  trigger review, and the write-back design doesn't need them.
