# Script Reference

Script inventory for local development, CI, release work, and agent automation. Runtimes are typical local estimates on a warm workspace and should be treated as order-of-magnitude guidance.

---

## 1. Canonical Commands

| Script                 | Purpose                                                                    | Typical runtime | Use when                                               |
| ---------------------- | -------------------------------------------------------------------------- | --------------- | ------------------------------------------------------ |
| `pnpm audit:quick`     | Structured smoke-quality runner with JSON events and log files             | 1-3 min         | You want a fast local confidence pass                  |
| `pnpm audit:full`      | Structured full-quality runner with desktop checks                         | 8-20 min        | You want to rehearse the `master` CI gate locally      |
| `pnpm test:smoke`      | Fast smoke gate: format, lint, typecheck, critical tests                   | < 5 min         | Working on an epic PR targeting `initiative/*`         |
| `pnpm metrics:capture` | Capture bundle, build, merge-gate test, and perf metrics to `tmp/metrics/` | 10-30+ min      | Refreshing baselines or generating CI metric artifacts |
| `pnpm metrics:compare` | Compare captured metrics vs committed baselines                            | < 10 sec        | Reviewing regressions or generating PR comments        |

---

## 2. Dev / Shell

| Script             | Purpose                                         | Typical runtime | Use when                                     |
| ------------------ | ----------------------------------------------- | --------------- | -------------------------------------------- |
| `pnpm dev`         | Start the Vite dev server for browser-mode work | long-running    | Iterating on renderer code in browser mode   |
| `pnpm build`       | Build the SvelteKit renderer                    | 20-90 sec       | Verifying production renderer output         |
| `pnpm preview`     | Preview the built renderer                      | long-running    | Checking the static production build locally |
| `pnpm prepare`     | Sync generated SvelteKit files                  | < 10 sec        | Dependency install / generated-file refresh  |
| `pnpm postinstall` | Install git hooks                               | < 10 sec        | Runs automatically after install             |

---

## 3. Tests

| Script                           | Purpose                                       | Typical runtime | Use when                                     |
| -------------------------------- | --------------------------------------------- | --------------- | -------------------------------------------- |
| `pnpm test`                      | Run the full Vitest suite                     | 30-180 sec      | Standard unit/integration validation         |
| `pnpm test:critical`             | Run the curated critical Vitest subset        | 15-90 sec       | Maintaining the smoke gate                   |
| `pnpm test:watch`                | Watch-mode Vitest session                     | long-running    | TDD on unit/integration work                 |
| `pnpm test:e2e`                  | Browser Playwright suite                      | 1-5 min         | Browser route/workflow regression checks     |
| `pnpm desktop:test`              | Full desktop Playwright suite                 | 5-15 min        | Broad desktop regression sweeps              |
| `pnpm desktop:test:critical`     | Desktop critical-path suite                   | 3-10 min        | Merge-blocking desktop workflow checks       |
| `pnpm desktop:test:a11y`         | Desktop accessibility suite                   | 2-8 min         | Accessibility regression validation          |
| `pnpm desktop:test:perf`         | Desktop performance benchmark suite           | 10-25 min       | Capturing perf metrics or budget regressions |
| `pnpm desktop:test:memory`       | Desktop memory-profile suite                  | 10-20 min       | Memory investigation or scheduled profiling  |
| `pnpm test:e2e:desktop`          | Legacy alias for `pnpm desktop:test`          | same as target  | Backward-compatible automation               |
| `pnpm test:e2e:desktop:critical` | Legacy alias for `pnpm desktop:test:critical` | same as target  | Backward-compatible automation               |
| `pnpm test:e2e:desktop:a11y`     | Legacy alias for `pnpm desktop:test:a11y`     | same as target  | Backward-compatible automation               |
| `pnpm test:e2e:desktop:perf`     | Legacy alias for `pnpm desktop:test:perf`     | same as target  | Backward-compatible automation               |
| `pnpm test:e2e:desktop:memory`   | Legacy alias for `pnpm desktop:test:memory`   | same as target  | Backward-compatible automation               |

---

## 4. Quality / Docs

| Script                 | Purpose                                     | Typical runtime | Use when                              |
| ---------------------- | ------------------------------------------- | --------------- | ------------------------------------- |
| `pnpm lint`            | ESLint plus navigation/token custom linters | 20-90 sec       | Standard lint validation              |
| `pnpm lint:tokens`     | Semantic design-token compliance scan       | 5-20 sec        | Checking token regressions only       |
| `pnpm lint:navigation` | Navigation-layer contract lint              | 5-20 sec        | Verifying navigation structure only   |
| `pnpm lint:fix`        | Auto-fix eligible lint issues               | 20-90 sec       | Cleaning up fixable lint violations   |
| `pnpm format`          | Run Prettier write mode                     | 10-60 sec       | Before staging broad edits            |
| `pnpm format:check`    | Validate Prettier formatting                | 5-30 sec        | CI-safe format gate                   |
| `pnpm docs:validate`   | Validate docs invariants and metadata drift | 5-30 sec        | Docs or contract changes              |
| `pnpm typecheck`       | Run `svelte-check` with project tsconfig    | 20-90 sec       | Type safety validation                |
| `pnpm check`           | Lint + typecheck + full Vitest suite        | 1-5 min         | Pre-push and standard completion gate |

---

## 5. MCP / Vault

| Script               | Purpose                                    | Typical runtime | Use when                             |
| -------------------- | ------------------------------------------ | --------------- | ------------------------------------ |
| `pnpm mcp:dev`       | Run the MCP server from source             | long-running    | Developing MCP handlers              |
| `pnpm mcp:build`     | Build the MCP bundle with `tsup`           | 10-45 sec       | Preparing desktop or release bundles |
| `pnpm mcp:inspect`   | Launch the MCP inspector against source    | long-running    | Interactive tool/resource debugging  |
| `pnpm vault:verify`  | Run vault verification CLI checks          | 10-60 sec       | Sanity-checking vault integrity      |
| `pnpm fixture:vault` | Generate a fixture vault for tests or perf | 10-90 sec       | Creating synthetic data sets         |

---

## 6. Desktop / Packaging

| Script                       | Purpose                                                        | Typical runtime        | Use when                             |
| ---------------------------- | -------------------------------------------------------------- | ---------------------- | ------------------------------------ |
| `pnpm desktop:build`         | Build renderer and MCP in parallel, then bundle Electron       | 45-150 sec             | Any desktop or Electron validation   |
| `pnpm desktop:package`       | Build and package desktop installers                           | 2-10 min               | Producing release candidates locally |
| `pnpm desktop:package:win`   | Package Windows NSIS installers                                | 3-10 min               | Windows release work                 |
| `pnpm desktop:package:mac`   | Package macOS DMG + ZIP artifacts                              | 3-10 min               | macOS release work                   |
| `pnpm desktop:package:linux` | Package Linux AppImage + `.deb` artifacts                      | 3-10 min               | Linux release work                   |
| `pnpm desktop:run`           | Start the built Electron app                                   | long-running           | Running the built desktop shell      |
| `pnpm desktop:start`         | Legacy alias for `pnpm desktop:run`                            | long-running           | Backward-compatible automation       |
| `pnpm desktop:smoke`         | Launch the built app against a temp vault and assert readiness | 30-90 sec              | Fast desktop launch verification     |
| `pnpm desktop`               | Build and then run the desktop app                             | 1-3 min + long-running | One-command local desktop boot       |

---

## 7. Android

| Script                          | Purpose                                             | Typical runtime | Use when                         |
| ------------------------------- | --------------------------------------------------- | --------------- | -------------------------------- |
| `pnpm android:add`              | Scaffold the native Android project                 | 30-120 sec      | Initial Android setup only       |
| `pnpm android:sync`             | Build web assets and sync Capacitor Android project | 30-120 sec      | Preparing Android-native work    |
| `pnpm android:open`             | Open the Android Studio project                     | long-running    | Native Android debugging         |
| `pnpm android:assemble:release` | Build a release APK through Gradle                  | 2-10 min        | Local Android release generation |

---

## 8. Metrics / Profiling

| Script                | Purpose                                            | Typical runtime | Use when                                          |
| --------------------- | -------------------------------------------------- | --------------- | ------------------------------------------------- |
| `pnpm perf:compare`   | Legacy performance-only alias to `metrics:compare` | < 10 sec        | Backward-compatible performance regression checks |
| `pnpm memory:profile` | Run the memory-profile helper script               | 5-20 min        | Investigating desktop memory growth               |

---

## 9. Naming Notes

- Canonical desktop test names now use the `desktop:test:*` family.
- Legacy `test:e2e:desktop:*` names remain as aliases so existing local habits and automation do not break.
- Canonical runtime command is `desktop:run`; `desktop:start` is preserved as an alias.
- New automation-friendly commands are `audit:quick`, `audit:full`, `metrics:capture`, and `metrics:compare`.
