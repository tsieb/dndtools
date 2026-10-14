# Whole-app security review v2 — 2026-10-14

Task: RC-ENG-5.1. Original assessment source base: `81b6b34c85f88c9855c7e0ca5aab7f69b1bafdc2`.

**Status: no open High.** H-01 (custom worker code in the app's storage origin) is fixed by
failing closed: the app no longer starts package workers at all. M-01 is mitigated. The
update-signature evidence gap (V-01) and the per-PR `/security-review` runs are still open. This
report is not a release sign-off.

## Method and limitations

This is an implementation-side source assessment with selected existing regression suites, not
the central operator's independent review. It covers the nine requested surfaces at the source
base above. It does not certify deployed infrastructure, published installers, or every app route.
No production account, private vault, credential, or payment was accessed.

The required `/security-review` command is not exposed in this session. No matching instruction
file was found in repository skills or local skill locations. **Per-PR `/security-review` runs
remain outstanding for every row below.** The historical WID-6.2 and WID-6.6 reports in `state/`
are prior evidence, not new command runs or a whole-app sign-off. Commit references below identify
source history only; they are not assertions that corresponding PRs were reviewed.

The preceding attempt ended in an automatic cybersecurity-risk rejection before its proposed
browser reproduction ran. This pass continued with source review and existing tests. H-01 is
supported by source and documented browser semantics; it is not a demonstrated live exploit.

## Surface assessment

| Surface                         | Source reviewed / history anchor                                                                               | Assessment and remaining evidence                                                                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sandbox host, including WID-1.3 | `apps/gm-react/src/app/widgets/SandboxHost.tsx`, `public/widget-host.html`; latest host change `8bc8e0981`     | The iframe uses `allow-scripts` without `allow-same-origin`, a restrictive document CSP, and checks message source against its frame. The separate worker branch had H-01; it now runs no package code (fixed below).                                                    |
| Host API                        | `apps/gm-react/src/app/widgets/hostBridge.ts`, `packages/core/src/security/widget-host-api.ts`; `5611f2362`    | Approved permissions are empty unless the package is trusted; forbidden capabilities are denied by core policy. These checks govern protocol calls, not ambient browser APIs, which is why H-01 was fixed by not running workers.                                        |
| Widget package review           | `packages/core/src/commands/widget-package.ts`, `queries/widget-package-review.ts`; `83e83121f`                | Imported builtin runtime is rejected; runtime policy is validated; the existing trust-review and platform-review-fixes suites pass. A package review cannot substitute for storage isolation of executable code.                                                         |
| System packages as data         | `packages/core/src/schemas/system-package.ts`, `state/system-package.ts`; `55b6c54fe`                          | Strict object schemas and a restricted formula parser, with own-property scope checks, keep this path declarative. Schema, command, and portability suites pass. No new High identified in this inspected path.                                                          |
| Player-private store            | `apps/gm-react/src/platform/storage/privateStore.ts`; `98267e20b`                                              | Separate per-vault/per-character Dexie databases and import-boundary tests prevent ordinary replication/cloud/MCP integration. Database names are not a security boundary against app-origin code. H-01 broke this guarantee; it is fixed.                               |
| PWA cache                       | `apps/gm-react/src/sw/service-worker.js`; `3c6e02666`                                                          | Cross-origin and non-GET traffic are excluded. Successful same-origin GETs are cached broadly, with `ignoreVary` on lookup. M-01 is mitigated by credential bypass, private-response eviction, and cache-policy migration; dedicated regression tests cover these paths. |
| Auto-update signature           | `apps/gm-react/electron/updater.cjs`, `electron-builder.yml`, `.github/workflows/release.yml`; `ec1dd91d8`     | Packaged builds ignore the development feed override; download/install require explicit state transitions. Release CI contains macOS and Windows signature checks. Signature evidence remains incomplete: V-01.                                                          |
| Stripe webhook                  | `packages/cloud-fns/src/billing/webhook.ts`; `95aa5f3ec`                                                       | Raw-body signature verification precedes event handling; mode mismatch is rejected; current subscriptions are re-read; duplicate events are tracked. All 43 billing tests pass. No new High identified in the inspected handler; no live Stripe verification performed.  |
| Cloud-Enhanced                  | `packages/core/src/security/cloud-security-decision.ts`, `packages/cloud-fns/src/sync/handler.ts`; `182805496` | Enhanced decision remains `approved: false`; sync accepts bounded encrypted-envelope shapes. Core privacy-mode and sync-handler suites pass. This is gate-closure coverage only, not approval of the deferred server-readable CLD-6 platform.                            |

Paths abbreviated in the table are relative to the corresponding package's `src/`, except the
sandbox document and desktop config, which are under `apps/gm-react/`.

## H-01 — High: custom worker executes in the application's storage origin

**Fixed in this task (fail closed); see Resolution below. Source-based finding; confidence high.** Preconditions: an installed, enabled custom
widget selects the worker runtime and runs in a browser whose policy permits blob workers.
The checked-in web-hosting policy explicitly permits them. This does not require the widget to
be granted storage access through the host API.

Evidence at the reviewed base:

- `apps/gm-react/src/app/widgets/WidgetRenderSlot.tsx:551` selects `WORKER_WIDGET_HOST` for
  `sandbox: 'worker'`.
- `apps/gm-react/src/app/widgets/WorkerHost.ts:663` creates a blob URL in the app context and
  constructs a `Worker` from it. There is no intervening opaque-origin execution context.
- `infra/web-hosting/template.yaml:206` permits `worker-src 'self' blob:`. The comment in the
  worker factory about the packaged shell failing closed does not cover the hosted web policy.
- `apps/gm-react/src/platform/storage/privateStore.ts:34` and `:78` place private records in
  named Dexie databases on that same application origin.

A blob worker retains its creator's origin, and workers expose IndexedDB. Those browser
semantics imply that this execution context can access origin storage outside `hostBridge`;
separate database names and actor-filtered render props do not prevent it. This is a
confidentiality and integrity violation of the widget contract, including private player data.
See [MDN Worker construction](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker)
and [worker IndexedDB access](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/indexedDB).

The passing `WorkerHost.test.ts` tests cover protocol/session behavior through an injected worker,
and `privateStore.test.ts` covers the intended storage API and module import boundary. Neither
establishes the missing browser origin boundary. No deployed exploitability or data access is claimed.

### Resolution

`WorkerHost.ts` no longer contains a blob-worker factory. Its default factory,
`refuseUnisolatedWorker`, throws before any blob URL or `Worker` exists, for both classic and module
entrypoints. `WidgetWorkerSession.start()` already turns a throwing factory into the
`WORKER_COPY.unsupported` state and records the failure through `isolateFrame`, so the tile shows the
existing "disabled, preserved" placeholder. The package, its configuration and its placement are
untouched. `WidgetRenderSlot.tsx` still routes `sandbox: 'worker'` to `WorkerHost`. That routing is
harmless now because the only production factory runs nothing, and tests can still inject a fake
worker to cover the protocol. No other caller constructs a worker from package code: `createBlobWorker`
had no other references.

Because no package code runs, it cannot reach IndexedDB or CacheStorage. Re-enabling workers
requires a storage-isolated (opaque-origin) context with a bridge-only channel, plus a real-browser
regression under the hosted CSP that proves origin storage is unreachable. That is a new feature
for a later task and needs its own security review. Do not restore the blob factory to fix the
placeholder.

Verification for this fix is listed under "Executed regression evidence" below.

## M-01 — Medium: broad same-origin runtime caching

**Mitigated in this task; residual Low.** Before the fix, `apps/gm-react/src/sw/service-worker.js` admitted every basic
successful GET response and wrote it to CacheStorage. Request authorization and response
`Cache-Control` were not consulted, and cache lookup used `ignoreVary: true`. If sensitive or
account-dependent endpoints are served on the app origin, their responses can persist and be
replayed offline across account changes. The current cross-origin exclusion limits this risk;
this review did not establish an affected authenticated same-origin endpoint or actual disclosure.

Mitigation: requests carrying `Authorization` bypass all service-worker cache reads and writes,
including precache and navigation fallback. `isCacheable` refuses `no-store`/`private` responses;
a non-cacheable network response also evicts an older entry at the same URL. The cache namespace
now includes the policy revision, so activation removes entries admitted by the former policy,
even for unversioned development builds. Public assets retain offline fallback.

Dedicated source-execution tests cover authenticated precache/runtime bypass, private-response
replacement followed by offline access, public offline fallback, and old-cache cleanup. These are
VM tests with mocked browser APIs, not a browser confidentiality proof. The earlier PWA browser
results below predate this follow-up. Cookie-authenticated endpoints without cache directives and
broad `ignoreVary` lookup remain residual risks; no affected endpoint was established in this review.
Before adding same-origin authenticated APIs, use an explicit public shell/asset allowlist and test
cache behaviour across account changes.

## V-01 — Update-signature evidence gap

The updater's opening comment calls its feed signed, but a SHA-512 checksum alone does not
authenticate a publisher. The checked-in smoke script's tampered scenario compares a payload
against an advertised checksum; it is not evidence of rejecting a forged signature. The repo
does contain production macOS/Windows signing verification steps, so absence of a literal
`publisherName` in the common builder config is not by itself proof of unsigned Windows releases.

Before sign-off, inspect produced `app-update.yml` and release metadata for the pinned updater
version, identify the actual trust root on each OS (including Linux AppImage), and demonstrate
rejection of a wrongly signed artifact/manifest. Record unsigned-preview behavior separately.
No release build, update-install smoke, or signature verification ran in this task. This is an
unresolved verification gap, not a fabricated second confirmed High.

## Executed regression evidence

Assessment runs. All commands below exited 0 at the source base above: **14 files, 338 tests**. Exact original
Headroom stdout was retrieved, not inferred from compressed previews.

| Command                                                                                                                                                                                                                                                                                 | Result                                                               | Headroom artifact                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------- |
| `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/widgets/hostBridge.test.ts apps/gm-react/src/app/widgets/WorkerHost.test.ts apps/gm-react/src/platform/storage/privateStore.test.ts apps/gm-react/src/platform/serviceWorker.test.ts`                         | 4 files / 79 tests                                                   | `d8dc0e283a8140db9f04e599360292f4` |
| `pnpm --filter @dndtools/core exec vitest run tests/security-widget-host-api.test.ts tests/security-widget-exfiltration.test.ts tests/security-vault-privacy-modes.test.ts tests/system-package.test.ts tests/system-package-commands.test.ts tests/system-package-portability.test.ts` | 6 files / 163 tests                                                  | `dff0bbe7241b4087bfb56363ec23edd1` |
| `pnpm --filter @dndtools/core exec vitest run tests/widget-trust-review.test.ts tests/widget-platform-review-fixes.test.ts`                                                                                                                                                             | 2 files / 17 tests                                                   | `f359710025fd4d3b957600fec67b7de3` |
| `pnpm exec vitest run --config vitest.cloud.config.ts packages/cloud-fns/src/billing/billing.test.ts packages/cloud-fns/src/sync-api`                                                                                                                                                   | 1 file / 43 billing tests; the second selector matched no sync tests | `9931305d8cee442d98cff74fe9fbacd9` |
| `pnpm exec vitest run --config vitest.cloud.config.ts packages/cloud-fns/src/sync/handler.test.ts`                                                                                                                                                                                      | Corrected sync selector: 1 file / 36 tests                           | `a5a1a21371e54cfaa72161c332a6fb20` |

Historical fix verification for H-01 and M-01, recorded by the preceding implementation at
`dc4da0010`. These results were not rerun as part of the follow-up unless listed separately:

- **Default factory refuses (temporary test, not committed).** A vitest file stubbed `Worker` and
  `URL.createObjectURL` and started a `WidgetWorkerSession` with `refuseUnisolatedWorker`, once
  with a classic entrypoint and once with a module entrypoint. In both cases neither stub was called,
  the only published state was `{ phase: 'failed', diagnostic: WORKER_COPY.unsupported }`, and
  `isolatedFrom()` was set. The preceding attempt deleted that scratch file. This follow-up commits equivalent regression
  coverage in `WorkerHost.test.ts` under the companion-test allowance in roadmap §21.2.
- `pnpm exec vitest run --config vitest.app.config.ts` on that file plus `WorkerHost.test.ts`,
  `serviceWorker.test.ts` and `WidgetRenderSlot`: 4 files, 37 tests passed.
- `pnpm typecheck` (core, cloud-fns, gm-react) exited 0. `eslint` and `prettier --check` on both
  changed source files exited 0.
- `playwright test tests/e2e/pwa-offline.spec.ts` on `desktop-chromium` and `mobile-chromium`: 18
  passed. This covers offline boot, offline create plus offline reload, and the manifest/worker
  checks under the changed cache admission.

Follow-up verification from starting HEAD `dc4da0010`:

- `pnpm exec vitest run tests/unit/service-worker-security.test.ts`: 8 tests passed.
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/widgets/WorkerHost.test.ts apps/gm-react/src/platform/serviceWorker.test.ts apps/gm-react/src/app/widgets/WidgetRenderSlot.test.tsx`:
  3 files, 37 tests passed, including both production-factory refusal cases. The renderer error
  boundary test intentionally emits `renderer exploded` diagnostics.
- Targeted ESLint, Prettier, and `git diff --check` passed. Native output was inspected;
  no Headroom tool was exposed in this session.

Not run: per-PR `/security-review`, dependency advisory audit, packaged update verification, full
repository gates, and deployed-cloud checks. No browser test of a running custom worker was
written: after the fix no package worker starts, so there is no worker whose storage access could
be observed.
Source evidence for H-01 and M-01 is retained in artifact `67d441b682fd4055806d700d0a9a4e5e`.
Headroom artifact IDs are run-local retrieval handles; source paths, base SHA, and exact commands
are the durable reproduction references.

## Acceptance handoff

The central review rejected `e7a6b35d4` because H-01 was still open. Self-heal round 2 then widened
the claim to `WorkerHost.ts` and `service-worker.js`, and this revision makes both runtime changes
described above. `WidgetRenderSlot.tsx` was not changed or needed.

- [x] No open High. H-01 is fixed by failing closed, and M-01 is mitigated to a residual Low.
- [x] `docs/security/README.md` links this report and states what is fixed and what is still open.
- [ ] Per-PR `/security-review` runs with exact reviewed revisions. This session has no
      `/security-review` command, so none ran.
- [ ] Update-signature evidence (V-01) before a release sign-off.
- [x] Factory-refusal regression committed in `WorkerHost.test.ts`. Isolated execution, if it
      is ever wanted, requires a separate task with its own browser regression.

This report does not approve Cloud-Enhanced or certify release readiness.
