# Project status dashboard

A local, read-only, zero-dependency dashboard answering "what is the state of everything
right now?" — deployed infra, CI, releases, versions, and live endpoints — without
clicking through four consoles.

```
pnpm dashboard        # → http://127.0.0.1:4990
```

## What it shows

| Section | Source (command) |
| --- | --- |
| Version / branch / activity | `git log|status|describe`, root `package.json` (plus a `git fetch origin main` so ahead/behind is honest) |
| GitHub Actions | `gh run list` — latest run per workflow + a last-20-runs strip |
| GitHub releases | `gh api repos/{owner}/{repo}/releases` — includes **drafts** |
| Open PRs | `gh pr list` |
| AWS CloudFormation | `aws cloudformation describe-stacks --profile dndtools --region ca-central-1` — status + last-updated per stack |
| Live endpoints | HTTPS GET of every `https://` output on the stacks (CloudFront, API URLs); 4xx counts as "up but auth-gated" |
| GCP | `gcloud services list` on the configured project (`dndtools-502020`) — it is the Docs/Drive OAuth integration project; there are no GCP compute stacks |

The page auto-refreshes every 60s; the server caches collector results for 30s
(`Refresh now` bypasses the cache). Each section fails independently — a dead
credential renders as a "collector failed" card with the CLI's error, never a blank page.

## Safety posture

- **Read-only**: describe/list/log/GET only; there is no code path that mutates AWS, GCP,
  or GitHub state, and the server has no mutation endpoints (GET only, 405 otherwise).
- **Localhost only**: binds `127.0.0.1`, never a LAN interface.
- **No shell interpolation**: every CLI call is `execFile` with a fixed argument array.
- **No secrets served**: the JSON carries stack names/statuses/timestamps and public URLs;
  tokens stay inside `gh`/`aws`/`gcloud` config.
- **XSS-safe rendering**: all dynamic text (commit subjects, run titles, CLI errors) is
  rendered via `textContent` under a strict CSP.

## Config

| Env var | Default |
| --- | --- |
| `DASHBOARD_PORT` | `4990` |
| `DASHBOARD_AWS_PROFILE` | `dndtools` |
| `DASHBOARD_AWS_REGION` | `ca-central-1` |

Helpers in `lib.mjs` are pure and covered by `tests/unit/dashboard-lib.test.ts`
(`pnpm test:tooling`).
