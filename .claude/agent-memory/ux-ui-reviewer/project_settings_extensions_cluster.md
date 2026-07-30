---
name: settings-extensions-community-cluster
description: UX audit state for gm-react Settings.tsx / Extensions.tsx / Community.tsx — which defects are FIXED vs STILL-OPEN, plus verified non-issues so future passes stop re-checking them.
metadata:
  type: project
---

Audit state for the three-screen cluster `src/screens/{Settings,Extensions,Community}.tsx`.
Line numbers are from the 2026-07-30 pass on branch `auto/visual-review-loop`.

**Why:** this cluster was repeatedly skipped (the reviewer owning it died on API 529s), so it
accumulated a backlog no other pass covered.
**How to apply:** on the next sweep, skip everything under FIXED and the VERIFIED NON-ISSUES
section; re-check STILL-OPEN by grepping the anchor string, not the line number.

## FIXED (do not re-report)
- `Extensions.tsx:~2096-2107` — clipped finding note.
- `Extensions.tsx:~1601-1698` — phone overflow.
- Hard-coded colors: cluster is clean. Only literal is `Settings.tsx:1553` `background:'#fff'`,
  a deliberate QR quiet zone documented at `:1543`.
- `Extensions.tsx:1949-1968` — orphan-label fix for `def.fields` (`htmlFor`/`id` pairing).

## STILL-OPEN (2026-07-30)
1. `Extensions.tsx:830` `if (docs || docsError) return;` + `:974` `{!sourceUiOpen && …}` + `:983-985`
   — Open5e source picker is a permanent dead-end when `listDocuments()` fails: Cancel lives inside
   the `{docs && …}` branch, the "Other sources…" trigger is hidden while open, and `docsError` is
   never cleared so it never retries.
2. `Community.tsx:521-528` `runExport` / `:579` `setResult` / `:734` — export success banner is set
   on success and never reset, so a later cancelled/failed export still shows a green
   "Downloaded <file>".
3. `Settings.tsx:3030` `if (hasKey) { Toaster.warning('Forget the current key…') }` vs `:3144`
   `disabled={locked}` — the explanation is DEAD CODE; the hard-disabled preset card can never fire
   its own onClick. Canonical case for the DS soft-disable (`aria-disabled`) pattern.
4. `Settings.tsx:2543` `passOk` / `:2647` — recovery-key passphrase mismatch only hard-disables
   "Export file"; no inline error identifies the mismatch (WCAG 3.3.1).
5. `Settings.tsx:368` COMPLEXITY_LEVELS tier picker — plain `<button>`s, selection is visual-only.
   No `role="radiogroup"` / `role="radio"` / `aria-checked` / roving tabIndex.
6. `Extensions.tsx:653-663` `ImportControl` — inline "Import again → Import copy / Keep" confirm
   swaps the trigger out without moving focus; focus falls to `<body>`.
7. `Extensions.tsx:1983-1988` — custom-object `number` fields render a plain `<Input>` (no
   `type`/`inputMode`), so phones get the alpha keyboard and junk coerces to `NaN`.
8. `Extensions.tsx:1938-1945` — the "Title" `<label>` is still an orphan (no `htmlFor`), 15 lines
   above the comment documenting that exact fix for the sibling fields.
9. `Settings.tsx:512` — profile load failure says "reopen this tab" with no Retry button.
10. `Community.tsx:315-330` — Discover module cards: selection is border/shadow only, no
    `aria-pressed`.

## VERIFIED NON-ISSUES (checked, real code, do not re-open)
- **Nested `data-theme="parchment"` subtree** (`Community.tsx:1479+`, also WikiReader): correct.
  It uses raw `var(--color-*)` semantic tokens, all redefined under `[data-theme='parchment']`
  (`src/styles/tokens/colors.css:148`). The legacy alias bridge (`--bg`,`--fg`,`--card`…) IS still
  on plain `:root` (`colors.css:~324`) and WOULD mis-resolve — but nothing in this subtree uses it.
  Status-border aliases were already widened to `:root,[data-theme]` (`colors.css:~348`).
- **`T.*` screen-kit map** (`src/app/screen-kit.tsx:34-61`) maps straight to semantic tokens, so it
  is theme-nesting safe.
- **Missing `:focus-visible` on hand-rolled `<button>`s**: a global ring exists at
  `src/styles/tokens/base.css:36`.
- **`repeat(auto-fill,minmax(220px,1fr))`** at `Settings.tsx:3129` / `minmax(210px,1fr)` at `:4343`
  lack the `min(100%, …)` guard used elsewhere, but the content box at 391px is ~335px so they do
  not overflow; `responsive.spec.ts` gates all three routes anyway.
- **`Settings.tsx:3598` `void runAssistantExchange(...)` has no `.catch()`**: not a silent failure.
  `src/ai/mcpBridge.ts:341-348` catches transport errors and `:384-395` catches tool-invoke errors,
  returning `finish('failed')` with a user-visible feed message.
- **AI "Ask" button dead when `blocker` set**: not real — the composer only renders in the
  `blocker === null` branch (`Settings.tsx:3682`).
- **DS `Dialog`** traps and restores focus (`src/ds/components/overlay/Dialog.jsx:86,143`), so
  dialog-based flows in this cluster are fine. Only the inline `ImportControl` swap is exposed.

## Established patterns this cluster should copy
- Radiogroup card set done right: `Settings.tsx:4333-4390` (`SettingsToolPreferences`) —
  `role="radiogroup"` + `radioGroupKeyDown` from screen-kit + roving `tabIndex`.
- Load-failure with Retry done right: `Settings.tsx:656-667`, `:1364-1374`,
  `Community.tsx:914-925` (`EmptyState` + Retry that resets the failed flag).
- Separate `failed` flag from `null`-means-loading — see the comment at `Community.tsx:761-763`.

## e2e coverage notes
`tests/e2e/responsive.spec.ts:14-18` runs overflow checks on `/extensions`, `/community`,
`/settings`. `custom-types.spec.ts` drives Extensions → Object types (uses `Object title`,
`Define type`, `Add field`). `wiki.spec.ts` drives Community → Wiki (`Publish wiki`).
`ai-assistant.spec.ts` touches the Settings AI provider surface. No spec currently touches the
Open5e compendium source picker, the recovery-key dialog, the complexity/tier picker, or
Community → Export's result banner — findings 1, 2, 4, 5 are unguarded by tests.
