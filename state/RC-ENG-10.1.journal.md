# RC-ENG-10.1 run journal

## 2026-09-30 — implementation

- Started from a clean task branch at `a0c885f9`. No Headroom tools were called; this journal cites native tool output.
- **WidgetFrame.** `BINDING_GLYPH` now holds message keys (`boardCanvas.binding.{bound,unbound,missing,conflicted,hidden}`), and the bound tooltip is `t('boardCanvas.binding.boundTo', { name })`. Once the rule started reading templates, the frame's own `${title} content` region and `Resize ${title}` handle were flagged, so they moved to `boardCanvas.tile.content` / `boardCanvas.tile.resize`. The English text is unchanged, so e2e role names such as `Resize Torchlight` still match. The `RESIZE_HELP` constant also became `boardCanvas.tile.resizeHelp`.
- **File-size gate.** The first cut pushed WidgetFrame to 818 lines, which failed `tests/unit/file-size-gate.test.ts` (800-line hard limit). The glyph tones became two local constants and `RESIZE_HELP` went to the catalogue. The file is now exactly 800 lines, so the next addition has to split it.
- **TagInput.** New `removeTagLabel?: (tag) => string` prop with an English default (`Remove ${tag}`, kept out of JSX as a module constant). ScreenMetaEditor and TagsPanel pass `t('common.action.removeTag', { tag })`.
- **Lint rule.** `no-literal-jsx-text` now also checks template literals in `title`, `aria-label` and `alt`, directly or in either branch of a `?:`/`&&`/`||`/`??`. A template is flagged when any static part carries language. A part that starts a CSS custom property (`--widget-${name}`, StyleStep) is skipped as code. The widened rule found 32 hits: 3 in WidgetFrame (fixed) and 29 in 16 files outside the claim. Those 16 are ratcheted in `no-literal-jsx-text.allow.js`, with a comment saying they are old English the widening surfaced, not new copy.
- **Catalogues.** en and es gained the same 10 keys, and the es↔en key-equality test passes. fr stays the empty scaffold on purpose: `index.test.ts` asserts `catalogCoverage('fr') === 0`, and it adds no orphan keys. `qps-ploc.ts` was regenerated with `tsx scripts/i18n-catalog.ts pseudo`.
- **Outside the claim (acceptance needed it):** `tests/unit/no-literal-jsx-text.test.ts` (lint fixtures), `WidgetFrame.test.tsx` and `TagInput.test.tsx` (companions), `i18n/messages/{en,es}.ts` and `i18n/dev/qps-ploc.ts` (catalogue keys).

## Evidence

- New tests:
  - WidgetFrame renders each of the five states under `es` (`Vinculado`, `Sin vincular`, `Ausente`, `En conflicto`, `Oculto`), checking both text and `title`, with no English label present. It also checks the `Vinculado a Old mill` tooltip and the `Contenido de …` region name.
  - TagInput asserts that the formatter names each remove button, and that the English default applies when no formatter is passed.
  - The lint fixtures `aria-label={`Remove ${tag}`}`, `alt={`${name} portrait`}` and a conditional `title` all fail. `${a} / ${b}`, `--widget-${x}` and a `placeholder` template pass.
- Mutation check: restoring the pre-story WidgetFrame, TagInput and rule turns every new test red (8 app tests and the lint fixture test).
- `pnpm test:app`: 156 files / 1736 tests passed, before the file-size fix. After the fix, the canvas/forms/i18n app tests (186) and file-size + lint-rule tooling tests (4) passed. The full `pnpm test:tooling` run before the fix showed the file-size failure and nothing else (231/232).
- `pnpm lint` exit 0; its warnings are pre-existing emphasis-lint ones. `pnpm typecheck` passed. `format:check:changed -- --base loop/rc` passed.
- Not run: Playwright. No rendered English changed; only `es` output changed.
- No push, promotion, loop launch or dispatcher state edits.

## 2026-10-03 — ownership feedback and French catalogue correction

- Continued the existing implementation commits on the task branch. No Headroom tools were available in this session.
- Restored `i18n/dev/qps-ploc.ts` exactly to the pre-task `a0c885f9` version, removing that file from the aggregate candidate diff as requested by gate feedback. The pseudo-locale test now checks its actual generated key coverage and verifies English fallback for a newly added key; no generated catalogue edits remain.
- Corrected the earlier French omission: the French scaffold now declares the full English key space through explicit source fallbacks, with French translations for all ten messages introduced by this task. Key equality does not imply full French translation coverage: unrelated messages still use English. The catalogue test asserts en/es/fr key equality and French bound-to/remove-tag interpolation.
- Fresh native-tool evidence: focused WidgetFrame, TagInput and i18n tests passed (3 files, 106 tests); lint-rule fixtures and file-size gate passed (2 files, 4 tests). Targeted ESLint, GM app TypeScript checking (`tsc --noEmit`), and `git diff --check` passed. The aggregate diff for `qps-ploc.ts` against `a0c885f9` is empty.
- Full repository gates and pinned-container visual regression are left to the central operator as instructed. No push, promotion, new loop, additional agent, or dispatcher control-state edit.

## 2026-10-03 — repair full app-test gate

- Read the original central app-test log at `/home/trinkle/Programming/agent-dispatcher/.state/attempts/08bffedd-76c5-4f2c-9cd1-b082ae2987b3/output.log`, including the complete failure section. Its sole failure was `i18n/dev/pseudo.test.ts` → `matches the current source catalog exactly`: the generated catalogue had 5967 entries while English had 5977. The ten missing entries were exactly this task's messages.
- The preceding ownership workaround was incorrect: generated pseudo messages are a required companion to source-catalogue changes. Regenerated `i18n/dev/qps-ploc.ts` using `pnpm exec tsx scripts/i18n-catalog.ts pseudo`; only the ten task messages were added. This file must be included in the candidate claim for the mandatory consistency gate to pass. No dispatcher claim/control state was edited.
- Restored the strict `catalogCoverage('qps-ploc') === 1` assertion and verified the new bound label is pseudo-localized rather than falling back to English. Kept the exact generated-catalogue equality test unchanged.
- No Headroom tools were available. No agents, pushes, promotions, or loops were started.
- Fresh validation: `pnpm test:app --maxWorkers=3` exited 0: 160 files / 1761 tests passed (51.16 s); original output retained at `/tmp/rc-eng-10.1-app-tests.log`. Prettier check and targeted ESLint passed for both changed TypeScript files; `git diff --check` passed. Other central gates were not rerun for this generated-data/test-only correction.
