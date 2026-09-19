# RC-DOC-1.4 — Release notes and marketing surface

## Implementation

- Reviewed repository development rules, roadmap ownership and evidence requirements, and the
  existing hosting template and deploy workflow. No applicable AGENTS.md or Headroom tools found.
- Added an unreleased RC preview, Lamplight README with shared real-app screenshots, and a static
  landing page in the owned hosting directory. Hosting routing and publication remain operator work.
- Applied the local natural-writer instructions from `/home/trinkle/.claude/agents/natural-writer.md`
  directly: concrete GM tasks, alpha status, no invented release date or claims of RC readiness;
  reread copy for filler, repeated sentence structure, and unsupported claims. No subagents spawned.
- Added a scoped marketing visual suite because this branch has no RC-DSN-4.1 visual suite yet.
  Uses the existing e2e onboarding/runtime approach and a fresh built-in sample vault.

## Acceptance evidence

- Natural-writer pass: `CHANGELOG.md:9`, `README.md:3`, and
  `infra/web-hosting/static/index.html:24` use concrete campaign tasks and explicitly state alpha/RC
  status. Claims checked against `docs/architecture/SYSTEM_PACKAGES.md`,
  `apps/gm-react/src/ds/components/feedback/VisibilityChip.jsx:6`, the existing install guide, and
  the actual captured board/atlas. The pass was performed directly, not delegated.
- Current screenshots: `infra/web-hosting/static/screenshots/provenance.json:2` identifies source
  `5134e91c54d83d01c4791a8d969ab796a51834b3`; no app source was changed in this task. Shared PNGs are
  referenced by README and landing page. Captured September 12 in America/Vancouver (September 13
  UTC), in fresh profiles with only built-in sample content and Ruined Keep selected via UI.
- Applied `docs/design-package/SKILL.md` and its readme: Tavern semantic palette, locally served
  Inter/Cinzel with licenses, one primary CTA, sentence-case copy, visible keyboard focus, and
  responsive layout. Static semantic HTML is appropriate for a page with no app runtime; no
  React DS components, i18n runtime, or app theme switcher are loaded. No animated elements.
- Visually inspected both app captures and desktop/phone landing captures. The existing board's
  Fit layout clips some widget body text; these are faithful captures, not edited mockups. App
  widget layout remediation is outside this task's ownership.

## Validation

- The initial missing `playwright` import was corrected to declared `@playwright/test`; capture
  assertions now use the actual headings (GM Screen and Maps). Axe uses explicit browser contexts.
- `node infra/web-hosting/visual-suite.mjs --refresh`: two app captures, then landing checks at
  390, 768, and 1440px for loaded images, no horizontal overflow, and zero axe violations.
  Exact output: ignored `test-results/marketing/visual-suite.log`. Full-page review images are in
  that directory. These checks cover the marketing page, not the app-wide a11y gate.
- Full repository gates and independent review remain with the central operator. No publication,
  push, promotion, loop launch, or dispatcher control-state edits occurred.
- Final refresh passed all five capture/page cases; original log read in full. PNG SHA-256 values
  match provenance, and relative Markdown links resolve.
- `pnpm exec eslint infra/web-hosting/visual-suite.mjs` passed. Scoped Prettier checks passed;
  historic changelog formatting was preserved outside the new RC entry. `git diff --check` passed.
- `pnpm gates` passed with existing app file-size warnings; exact output read from
  `test-results/marketing/gates.log`. No warning names an owned file. This is the quality-gate
  registry check, not a claim that all application tests or release gates ran.
