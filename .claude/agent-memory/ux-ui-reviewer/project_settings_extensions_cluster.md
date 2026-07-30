---
name: settings-extensions-community-cluster
description: UX audit state for gm-react Settings/Extensions/Community — the whole 2026-07-30 backlog is now FIXED; keeps the verified non-issues + established patterns so future passes stop re-checking them.
metadata:
  type: project
---

Audit state for `src/screens/{Settings,Extensions,Community}.tsx`.
**Status as of run #8 (2026-07-30, @329bcc58): the entire 10-item STILL-OPEN backlog is CLOSED.**
Runs #6/#7 landed all of them. Re-verified by grep this pass — do not re-report any of it.

**Why:** this cluster was repeatedly skipped (its reviewer died on API 529s) and accumulated a
backlog no other pass covered. That debt is now paid; treat these three files as low-yield and
spend the budget on the siblings in [[audio-upgrade-scenes-creator-cluster]].

## FIXED (do not re-report) — closed runs #6–#7
1. Open5e source-picker dead-end (`docsError` never cleared, Cancel inside the `{docs &&}` branch).
2. `Community.tsx` `runExport` stale green "Downloaded" banner.
3. Settings AI provider preset: hard-`disabled` card whose own explanatory onClick was dead code
   → now the DS soft-disable (`aria-disabled`) pattern.
4. Recovery-key passphrase mismatch had no inline error (WCAG 3.3.1).
5. `COMPLEXITY_LEVELS` tier picker → now a real `role="radiogroup"` (`Settings.tsx:367-384`).
6. `ImportControl` inline "Import again" confirm dropped focus to `<body>`.
7. Custom-object `number` fields rendered a plain `<Input>` (alpha keyboard on phones).
8. Orphan "Title" `<label>` (no `htmlFor`).
9. Profile-load failure had no Retry.
10. Community Discover module cards had no `aria-pressed` (`Community.tsx:322`).
Also earlier: `Extensions.tsx` clipped finding note, phone overflow, `def.fields` orphan labels.
Hard-coded colors: clean. Only literal is `Settings.tsx:1553` `#fff`, a deliberate QR quiet zone.

## VERIFIED NON-ISSUES (checked against real code, do not re-open)
- **Nested `data-theme="parchment"` subtree** (`Community.tsx:1479+`, WikiReader): correct. Uses raw
  `var(--color-*)` semantic tokens, all redefined under `[data-theme='parchment']`
  (`styles/tokens/colors.css:148`). The legacy alias bridge (`--bg`,`--fg`,`--card`…) IS still on
  plain `:root` and WOULD mis-resolve — but nothing in this subtree uses it.
- **`T.*` screen-kit map** (`src/app/screen-kit.tsx:34-61`) maps straight to semantic tokens →
  theme-nesting safe.
- **Missing `:focus-visible` on hand-rolled `<button>`s**: global ring at `styles/tokens/base.css:36`.
- **`repeat(auto-fill,minmax(220px,1fr))`** at `Settings.tsx:3129` / `minmax(210px,1fr)` at `:4343`
  lack the `min(100%,…)` guard, but the 391px content box is ~335px so they don't overflow, and
  `responsive.spec.ts` gates all three routes.
- **`Settings.tsx:3598 void runAssistantExchange(...)` with no `.catch()`**: not silent —
  `src/ai/mcpBridge.ts:341-348` / `:384-395` catch and `finish('failed')` with a feed message.
- **AI "Ask" dead when `blocker` set**: composer only renders in the `blocker === null` branch (:3682).
- **DS `Dialog`** traps + restores focus (`ds/components/overlay/Dialog.jsx:86,143`).
- **`Panel title="Tracks &amp; sources"`-style entities in JSX attributes**: esbuild DECODES them
  (verified by running `esbuild.transform`). Never report these as literal-`&amp;` bugs.

## Established patterns this cluster should copy
- Radiogroup done right: `Settings.tsx:4398-4433` (`SettingsToolPreferences`) — `role="radiogroup"`
  + shared `radioGroupKeyDown` from screen-kit + roving `tabIndex`. `Seg` in screen-kit (:147+) is
  the compact variant and already has full Arrow/Home/End + roving tabIndex.
- Load-failure with Retry: `Settings.tsx:656-667`, `:1364-1374`, `Community.tsx:914-925`.
- Separate a `failed` flag from `null`-means-loading — comment at `Community.tsx:761-763`.

## e2e coverage notes
`responsive.spec.ts:14-18` overflow-checks `/extensions`, `/community`, `/settings`.
`custom-types.spec.ts` drives Extensions → Object types (`Object title`, `Define type`, `Add field`).
`wiki.spec.ts` drives Community → Wiki (`Publish wiki`). `ai-assistant.spec.ts` touches Settings AI.
Still unguarded by any spec: the Open5e source picker, the recovery-key dialog, the tier picker,
Community → Export's result banner.

See also [[audio-upgrade-scenes-creator-cluster]], [[onboarding-viewas-cluster]], [[ds-layer-audit]].
