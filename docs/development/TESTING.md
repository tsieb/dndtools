# Testing and Validation

## 1. Where the tests are

| Layer              | Command                                                                  | What runs                                                                                                       |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Core unit          | `pnpm test:critical` (`pnpm --filter @dndtools/core test`)               | Vitest suite in `packages/core`                                                                                 |
| Cloud + transport  | `pnpm test:cloud`                                                        | net, cloud, and transport tests (`vitest.cloud.config.ts`)                                                      |
| React app unit     | `pnpm test:app`                                                          | non-network app logic, storage, AI, view-models (`vitest.app.config.ts`)                                        |
| Repo tooling       | `pnpm test:tooling`                                                      | guardrail and tooling tests in `tests/unit/`                                                                    |
| All of the above   | `pnpm test`                                                              | `test:critical` + `test:cloud` + `test:app` + `test:tooling`                                                    |
| Core coverage      | `pnpm test:coverage:core`                                                | V8 report with global and `src/security` regression floors                                                      |
| Smoke gate         | `pnpm test:smoke`                                                        | boundary lint + typecheck + the curated critical subset (`packages/core/vitest.smoke.config.ts`), about 30s     |
| Browser E2E        | `pnpm e2e`                                                               | Playwright specs in `apps/gm-react/tests/e2e/` on `desktop-chromium` and `mobile-chromium`                      |
| Accessibility gate | `pnpm a11y:gate`                                                         | non-text contrast lint + axe on both profiles + merged report                                                   |
| Performance        | `pnpm perf:capture` then `pnpm perf:compare`                             | see [PERFORMANCE.md](PERFORMANCE.md)                                                                            |
| Android native     | `./gradlew testReleaseUnitTest lintRelease` from `apps/gm-react/android` | Java unit tests and Android lint; the emulator matrix is in the [Android runbook](../runbooks/android-alpha.md) |
| Whole application  | `pnpm validate`                                                          | the staged, capability-gated harness (§3)                                                                       |

Pre-handoff gate: `pnpm check` = Android static preflight + quality gates + boundary lint +
typecheck + `pnpm test`. Layout-affecting work runs Playwright on both profiles; a change to a
shared route runs the full suite, because a mobile overflow on one route breaks other specs.

`DNDTOOLS_TEST_WORKERS` and `DNDTOOLS_PW_WORKERS` cap Vitest and Playwright workers (the loop sets
them per slot). `DNDTOOLS_E2E_PORT` isolates the Vite port; Playwright otherwise reuses whatever is
already listening on :5273.

Timing budgets (wall clock; a job past its budget is a regression to investigate, not a number to
raise): core unit 90s, core coverage 120s, CI `build-and-test` 10 min, one `browser-e2e` shard
12 min, `accessibility` 5 min. The core suite runs with `isolate: false` because it is framework-free
and each isolated file re-imported the whole module graph.

## 2. Mandatory rules

- Every bug fix includes a regression test.
- New domain behaviour in `packages/core` includes a unit test. User-critical UI changes include
  Playwright coverage. Storage or sync write-path changes include round-trip tests.
- Android bridge changes include a renderer contract test and a Java test; Keystore behaviour covers
  the authenticated round trip and a wrong-key failure.
- Mobile UI changes cover compact portrait, short landscape, tablet, 200% text, reduced motion,
  forced colors, safe areas, and a keyboard-reduced viewport; targets are checked at 48px.
- Playwright's `newPage()` is a fresh browser context with no shared IndexedDB.
- A `page.evaluate` that awaits app work waits for a fresh task before returning (§6).
- CI or gate changes update this document in the same change.

## 3. `pnpm validate`

One orchestrated pass over every verification the repo has, with a consolidated report. It does not
replace PR CI (`ci.yml`); it is the deep on-demand and weekly sweep (`validate.yml`).

```bash
pnpm validate            # static + unit + build + browser + audit
pnpm validate:fast       # static + unit + audit
pnpm validate:live       # + live AWS dev-stack checks (needs the dndtools profile)
pnpm validate --desktop  # + packaged Electron smoke (needs a display)
pnpm validate:full       # everything, still capability-gated
pnpm validate:list       # the check catalog
```

Selectors: `--layer=unit,static`, `--only=e2e,test:core`, `--skip=e2e`, `--jobs=N`, `--no-report`.
`--only` overrides layer selection; naming `--layer=cloud` turns on that off-by-default layer without
`--live`.

| Layer   | Checks                                                                                                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| static  | eslint, boundary lint, quality-gate meta-gate, CI-guardrail audit, text and non-text contrast, typecheck ×3, prettier (warn only)       |
| unit    | core, app, tooling, cloud suites; P2P crypto gate                                                                                       |
| build   | core, cloud Lambda bundles, gm-react                                                                                                    |
| browser | Playwright E2E, axe gate and report, `verify:{routes,roundtrip,canvas,ui}`, live WebRTC handshake (managed `react-dev` server on :5273) |
| desktop | packaged Electron smoke: `dndtools://app` origin, CORS, CSP, persistence across restart, privileged-IPC tripwires                       |
| cloud   | SSM resolvable, CloudFront headers, anonymous rejection, Cognito OIDC, signaling, TURN, E2EE round-trip (`infra/verify-*.sh`)           |
| audit   | feature-inventory drift (warn only)                                                                                                     |

Capabilities (`aws`, `display`, `electron`) are probed up front; a check whose requirement is absent
is skipped with a reason, never failed. Read the capabilities line before trusting a green run.
Output lands in `test-results/validation/` (`index.html`, `report.md`, `report.json`,
`logs/<check>.log`). Exit code is non-zero only when a required check failed. Never fix the
repo-wide Prettier warn with a bare `pnpm format`; run `pnpm format:fix:changed`.

## 4. Feature-inventory audit

`pnpm feature-audit` parses the tables between the `inventory:start` / `inventory:end` markers in
`docs/requirements/FEATURE-GAPS.md`. Every honest limit carries an anchor `` `path` › `string` ``; the
audit fails when the string is gone from that file, so a quietly closed limit breaks the build
instead of rotting. It also reports stub markers in `apps/gm-react/src` and screens with no
core-dispatch reference.

## 5. Local LLM verification

`pnpm ai:verify:local` runs the deterministic provider, prompt, and MCP exchange tests, then two real
Ollama scenarios (a rollable table and an NPC) through the same staged-write pipeline the app uses.
It fails if Ollama is unreachable, the model is missing, or a scenario yields no schema-valid staged
proposal. `pnpm ai:smoke` skips instead of failing without Ollama.

```sh
ollama serve
ollama pull qwen2.5:7b          # tool-calling model (OLLAMA_MODEL overrides)
ollama pull nomic-embed-text    # embeddings for semantic search
pnpm ai:verify:local
```

Semantic search embeds once per note revision and caches vectors device-local; with no daemon a new
query reports `lexical-only` rather than failing. Switching embedding models re-embeds the vault.

## 6. "Execution context was destroyed" with no navigation

`combat-audio-automation.spec.ts` and `systems.spec.ts` used to fail on mobile-chromium under load
with `page.evaluate: Execution context was destroyed, most likely because of a navigation`
(RC-ENG-2.6). Nothing navigated. The failure screenshots kept state that only lives in React (the
selected Audio tab, toasts from earlier steps), Playwright launches Chromium with the back-forward
cache off, a traced run loaded each test's document exactly once, and a cold full-suite run printed
no Vite reload.

The protocol error underneath is V8's `Promise was collected`. Playwright's Chromium layer reports
every protocol error that is not a page exception with the navigation message. When a
`page.evaluate` function returns a promise, the inspector holds that promise weakly, and one
microtask slot passes between the promise settling and the inspector reading it. A full GC in that
slot collects the settled promise and fails the call. The slot is empty unless the app has work
queued behind the promise. In combat-audio it always has: `combat.start` fires the audio automation
driver, which queues `session.audio.play` right behind it, and that command's reducer and Dexie
write run inside the slot. Memory pressure makes full GCs frequent, so the failure tracked machine
load and never appeared on an idle machine, with or without a 4× CPU throttle.

To reproduce it on demand, make every young-generation GC a full one:

```bash
DNDTOOLS_E2E_JS_FLAGS='--gc-global --max-semi-space-size=1' DNDTOOLS_E2E_PORT=<free port> \
  npx playwright test tests/e2e/combat-audio-automation.spec.ts --project=mobile-chromium --retries=0
```

Before the fix that failed 3 of 3 at `combat-audio-automation.spec.ts:12`, and `DEBUG=pw:protocol`
showed `Promise was collected` for each failure.

The fix is in the helpers, not the retry count. An evaluate that awaits app work waits for a fresh
task (`await new Promise((resolve) => setTimeout(resolve, 0))`) before it returns, so only the
inspector's own job runs in that slot. `dispatch()` in `_helpers.ts` does this and returns only
`status`, `rejection` and `events`; the runtime's `nextState` is the whole vault. Write any new
async evaluate the same way, or poll with `page.waitForFunction`, which retries this error. About 36
async evaluates in other specs still return straight off app work and carry the same exposure.

Two opt-in switches in `_helpers.ts` help with the next hunt of this kind: `DNDTOOLS_E2E_CPU_THROTTLE=4`
slows the renderer, and `DNDTOOLS_E2E_TRACE_NAV=1` logs main-frame navigations, the Vite client's
console lines, and the stack behind each unload.
