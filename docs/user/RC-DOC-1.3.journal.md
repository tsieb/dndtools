# RC-DOC-1.3 run journal

## Scope and research

- Baseline: b54cf4c7. Initial worktree clean. Owned files only.
- Applied the user-provided docs-research skill. No natural-writer agent definition or Headroom tools available. No agents spawned.
- Read existing architecture owners, UI, message catalog, schemas and existing onboarding, map, widget, system, session, joining and privacy test sources. Each guide links its sources.
- Eight English guides share the existing Markdown renderer in Help; implementation references stay in repository docs, outside the in-app reading body.
- Cloud-Enhanced is consent-only and release-blocked; Android precision authoring and desktop background-widget limits are explicit.

## Validation

Scoped checks are recorded below. RC-DOC-2.2 is absent: scripts/validate/docs-links.ts does not exist and quality-gates.ts has no docs-link gate. Do not claim that checker passed. Central operator owns full gates and independent review.

- Source review found an existing shell restriction: AppShell.tsx:237 mounts Footer (the only HelpMenu owner) only at phone width. Desktop/rail Help triggers are outside this task's owned files. HANDOFF to shell owner: mount Help in desktop/rail chrome. Browser guide verification therefore uses the existing phone Help entry, as help-menu.spec.ts does.
- The initial temporary Playwright config needed a local package.json with type=module before importing the app config. The first full-width attempt was stopped after confirming the missing shell trigger in source; it is not a passing desktop-navigation check.

## Results and reproduction

Commands run from the repository root unless noted:

- `pnpm --filter @dndtools/gm-react typecheck`: passed (exit 0).
- `pnpm exec eslint apps/gm-react/src/app/help/HelpMenu.tsx`: passed after correcting the new section to reuse translated chrome and spacing tokens.
- `pnpm exec prettier --check apps/gm-react/src/app/help/HelpMenu.tsx docs/README.md docs/user`: passed.
- `git diff --check`: passed.
- `pnpm --filter @dndtools/gm-react build`: passed; Vite built 2703 modules and check-prod-bundle reported OK for 84 JS assets. Rollup reported its Zod annotation and large-chunk warnings. This is a renderer build, not a native installer test.
- `CI=1 DNDTOOLS_E2E_PORT=15843 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/help-menu.spec.ts --workers=1`: 6 passed. Both projects deliberately use phone width in this existing spec.
- Temporary integration probe at `/tmp/rc-doc-1.3-browser/guides.spec.ts`, using the app's Playwright config and helpers: 2 passed, desktop Chromium and mobile Chromium both at 390×844. For each of eight titles it focuses the Help button, presses Enter, checks the named guide dialog, English article with more than 500 characters, no implementation-reference section, no dialog horizontal overflow, and the Help return button. Command: `CI=1 DNDTOOLS_E2E_PORT=15845 pnpm --filter @dndtools/gm-react exec playwright test --config=/tmp/rc-doc-1.3-browser/playwright.config.ts --workers=1 --retries=0`.
- The interrupted full-width probe left its Vite process on 15844; CI correctly rejected reusing that port. The passing probe used a fresh port. Confirmed and terminated only this task's orphan Vite and pnpm processes afterward.
- Relative-link check: 70 links across docs/README.md and nine docs/user Markdown files resolved. This checks local file existence, not external links, anchors, whole-tree reachability, ADR coupling, or the absent RC-DOC-2.2 gate. Reproduce:

```sh
python - <<'PYTHON'
from pathlib import Path
import re
files = [Path('docs/README.md'), *Path('docs/user').glob('*.md')]
count = 0
for source in files:
    for target in re.findall(r'\]\(([^)]+)\)', source.read_text()):
        if '://' in target:
            continue
        count += 1
        assert (source.parent / target.split('#')[0]).exists(), (source, target)
print(f'{count} relative links resolve')
PYTHON
```

## Review and remaining validation

- Self-reviewed the final guide text against linked source and existing tests. Corrected session instructions to put Go live before the start dialog, with confirmation inside it. Kept source references separate from the in-app prose and made no external release-availability claims.
- Eight user pages are reachable through the existing Help menu and docs index. The journal is linked from the docs index for maintainer reachability, and is intentionally not a user guide.
- PARTIAL RC-DOC-1.3: scoped implementation and checks complete; RC-DOC-2.2 checker unavailable in this baseline, desktop/rail Help trigger remains a shell-owner handoff, central full gates and independent review pending. No native device installation, live remote table, cloud recovery, or offline browser session was exercised.
- No push, promotion, dispatcher state edits, or additional agents.
