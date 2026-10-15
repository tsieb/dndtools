# RC-ENG-8.5 run journal

- Scope: palette label ranking, import keyword cleanup, command focus handoff, and browser regression coverage. No agents, push, promotion, or dispatcher changes.
- Headroom tools unavailable; native command output used.
- Diagnosis: authored Actions group precedes Go to regardless of label quality; import keywords contain section names. A newly opened dialog can capture the palette input before it unmounts.
- Implemented exact/prefix ranking above other matches, preserving group order within each rank. Restore opener focus before invoking a command so successor dialogs retain it.
- Added seven full-label Enter navigation cases, a prefix case, and Import hub focus return via both Enter and click. The spec runs on desktop-chromium and mobile-chromium.
- Initial browser run: 57 passed, seven mobile cases failed because Settings has a second combobox. Original diagnostic in `/tmp/rc-eng-8.5-e2e.log` identified a strict locator violation; scoped the new locator to the palette. Full rerun passed: 64 tests across both profiles (exit 0), original output `/tmp/rc-eng-8.5-e2e-final.log`.
- Pinned container visual gate: `apps/gm-react/tests/visual/run-in-container.sh palette-help.spec.ts --workers=2` passed all 15 tests across desktop, rail, and phone. Original output: `/tmp/rc-eng-8.5-visual.log`.
- Targeted ESLint: exit 0, no errors; existing `flat` hook-dependency warning remains. Original output: `/tmp/rc-eng-8.5-eslint.log`.
- Prettier applied; diff whitespace check passed. App TypeScript check passed (exit 0); original output: `/tmp/rc-eng-8.5-types-final.log`.
- Central gates and independent review remain the operator's responsibility.

## Gate follow-up

- Read the original failed App tests log at `/home/trinkle/Programming/agent-dispatcher/.state/attempts/2b03efef-bac9-4243-a593-e2c1bf3d791f/output.log`. Its sole failure was `pseudo.test.ts` catalog equality: generated `importHub.keywords` retained the removed section nouns (197 files passed, one failed).
- Regenerated with `pnpm exec tsx scripts/i18n-catalog.ts pseudo`. The only derived change is `apps/gm-react/src/i18n/dev/qps-ploc.ts`'s import keywords. This generated companion to the owned English catalog is required to satisfy the gate; no test assertion weakened.
- Full `pnpm test:app` rerun passed (exit 0): 198 files, 2389 tests. Prettier and `git diff --check` also passed; original output retained at `/tmp/rc-eng-8.5-app-followup.log`.
