---
name: beta-readiness-audit
description: Beta-readiness UX audit of gm-react (2026-07-14) — first-run/core-loop/failure-UX findings, and the recurring structural gotchas worth re-checking on every future pass
metadata:
  type: project
---

First beta-readiness (not spec-conformance) UX audit of `apps/gm-react`, 2026-07-14, against a
large uncommitted working tree. Findings that are STRUCTURAL and likely to recur:

**How to apply:** re-check these classes on any future gm-react UX pass — they are systemic, not
one-off bugs.

1. **HashRouter vs raw `window.location` navigation.** The app is HashRouter (required for the
   Electron `file://` build). Any `window.location.assign('/route')` / `href = '/route'` silently
   drops the `#` and produces a NON-hash path. Consequences differ per profile and all are bad:
   vite dev SPA-fallbacks to `/` (wrong destination, looks "almost fine" — this is why it survives
   dev testing); deployed CloudFront has **no `CustomErrorResponses`** in `infra/web-hosting/template.yaml`,
   so the path 403/404s and ejects the user from the app; Electron's `will-navigate` guard
   (`electron/main.cjs:376`) blocks it, so the click does nothing and any `wiping`/pending UI state
   freezes forever. Correct pattern when a reload is genuinely needed: set `window.location.hash`
   THEN `reload()`. Grep `location.assign|location.href *=` on every pass.

2. **Two surfaces read the same core list with different filters.** `CommandCenter` filters the
   Command Center backing scene out of the Scenes list (`s.id !== homeSceneId`); `ScenesCreator`
   filters only `!isTemplate`, so it leaks the internal scene AND offers "Delete Command Center".
   Pattern: when a core read-model list is consumed by 2+ screens, check the filters agree.

3. **Actor-filtered read-model copy leaks into the DM's own empty states.** Strings like "No maps
   are visible to you" / "The bound map isn't available to you" are player-safety phrasing shown to
   a DM with an empty vault (Atlas, Board widgets). Empty-because-nothing-exists and
   empty-because-permission-hides-it need DIFFERENT copy.

4. **Focus-on-open lands on the dismiss/skip control.** `Onboarding.tsx` places focus on the first
   focusable in the panel, which is "Skip setup" — so Enter on first load permanently skips
   onboarding (writes `onboarded=skipped`). Their own code comment warns about this hazard but only
   fixed it for step CHANGES, not initial open. Check first-focusable identity, not just "is focus trapped".

5. **Player-facing routes are excluded from the responsive gate.** `tests/e2e/responsive.spec.ts`
   covers 11 DM routes and measures `#main-content`, which only exists inside `AppShell` — so
   `/play`, `/join`, `/wiki` (mounted OUTSIDE the shell, and the ONLY routes players use on phones)
   are structurally unable to be covered by that helper. Real clipped controls exist there.

6. **Emoji icons in core widget definitions** (`packages/core/src/state/widget-package-state.ts`
   ~547–777: ⏱ 🎲 🗺 ⚔️ 🎵 📖 🗂) violate the design system's Lucide-only rule and are read aloud by
   screen readers. They surface on the GM Screen (`/board`) — the DM's primary board.

**Genuine strengths (don't "fix" these):** empty states across Characters/Campaign/Knowledge/Graph/
Audio/Session are good — explanatory copy + wired CTA. A real demo seed exists
(`src/runtime/demo-seed.ts`, gated by `dndtools:react:vault-choice=fresh`). There IS an
`ErrorBoundary` + a vault-load FailScreen in `App.tsx`. Global `:focus-visible` ring exists with no
`outline:none` violations. No horizontal overflow on any DM route at 393px (the historical
`.app-main` gotcha is NOT currently reproducing).

**Product-level gap:** there is NO multi-campaign concept anywhere (zero hits for
`campaignId`/`createCampaign`). The vault IS the single campaign. The sidebar "campaign chip" looks
like a switcher but just routes home. DMs commonly run >1 campaign — this needs an explicit beta
message. See [[completion-pass-ux-patterns]].
