# ADR-038: iOS Reach Is the Installable Web App; the Capacitor iOS Shell Is Deferred

- Status: Accepted
- Date: 2026-09-08
- Deciders: Engineering
- Consulted: Product, Security, QA
- Supersedes: N/A
- Amends: ADR-006 (which enumerated three runtime kinds; a fourth, `ios`, is added without a
  fourth shell)

## Context

ADR-006 committed to one React renderer behind three shells: browser, Electron, and a tracked
Capacitor Android project at `apps/gm-react/android`. iOS was left open. RC1 has to close it one
way or the other, because "iOS later" is currently doing real damage: an iPhone or iPad running
Lamplight in Safari is classified as a generic `web` runtime, so the app tells that person things
that are not true on their device — for example that notifications are simply "unavailable in this
browser", when in fact they work as soon as the app is added to the Home Screen.

Two things about a Capacitor iOS shell are easy to underestimate.

The first is that it is not `npx cap add ios`. Android's value is not the WebView wrapper, it is
the native seam: a Keystore-backed secret store, a share/save chooser, notification channels, a
share target, and lifecycle/Back handling, all reached through custom Capacitor plugins registered
in `apps/gm-react/src/platform/capabilities.ts`. Each of those is Kotlin. An iOS shell that carried
none of them would be a browser with an app icon; an iOS shell worth shipping means writing every
one of them again in Swift, plus a Local Network entitlement conversation for anything resembling
LAN discovery.

The second is that iOS is the only platform where shipping is gated on things engineering cannot
produce: an Apple Developer Program membership, macOS hardware or paid macOS CI runners to build,
sign and notarize, and App Store review. PLT already ends in two externally blocked lanes —
desktop code signing (RC-PLT-1.1) and the Play internal track (RC-PLT-2.3). A third one, with the
strictest reviewer of the three, would make RC1's completion depend on an account that does not
exist yet. App Review would also arrive holding opinions about the AI provider surface and about
web billing (ADR-027), which is a product-policy conversation, not a build problem.

Meanwhile the iOS user story is nearly served already. RC-PLT-2.1 makes the app installable from
`lamplight.click` with an offline shell; the remote-play transport is WebRTC over a signaling
server, so an iOS player joins a table from Safari today with no shell whatsoever.

## Decision

**Reject a Capacitor iOS shell for RC1.** No `ios/` project is added, no iOS target enters the
release workflow, and no simulator smoke is added to CI — a simulator job needs a macOS runner and
would only be testing the same WebKit the browser already covers.

iOS reach for RC1 is the installable web app (RC-PLT-2.1): Safari, "Add to Home Screen", the
service worker's offline shell, and Web Push once installed.

`RuntimeKind` still gains `'ios'` now (`apps/gm-react/src/platform/capabilities.ts`), because the
platform, not the shell, is what capability decisions branch on:

- iOS is detected once at startup from the user agent (`detectIosWebKit`), including the iPadOS 13+
  desktop agent, which is an iPad exactly when it reports touch points. Bridge detection wins over
  the agent test in both directions, so Electron on macOS is never mistaken for an iPad, and a
  future Capacitor `ios` platform reports `'ios'` rather than falling through to `'web'`.
- Capabilities for `'ios'` are WebKit's, honestly stated: no durable secret store, no native share
  sheet, no automatic nearby-table discovery, no native window management. Only the notification
  copy is iOS-specific, because only there does the truthful message name an action the person can
  take — add Lamplight to the Home Screen.
- The widget platform profile for `'ios'` is `mobile`, matching Android, so a DM on an iPhone is
  not offered widgets that cannot run where they are sitting.

Quick Map mode stays Android-only. It is bound to the native shell's touch/lifecycle behaviour in
the screens that branch on `'android'`, and half-applying it to Safari would be worse than the
current desktop workspace. It moves with a shell, if a shell ever lands.

## Consequences

### Positive

- RC1 stops depending on an Apple account, a Mac, and App Review.
- The dishonest-capability bug is fixed now rather than with the hypothetical shell: iOS users get
  fallback copy that matches their device.
- The seam a future shell needs already exists. Adopting one becomes "implement the Swift plugins
  and flip `nativeBridgeAvailable`", not "add a fourth branch to every capability check".
- No second vault format or second storage model is introduced, per ADR-006.

### Negative

- No App Store presence, and therefore no store discovery on the largest tablet platform for
  virtual tabletops.
- iOS secrets stay session-only: WebKit has no Keystore equivalent reachable from a web app, so an
  iOS DM re-enters an AI provider key each session.
- No native share-target import on iOS, so `.dndmodule` files arrive through the file picker only
  (RC-PLT-2.2's Android share target has no iOS twin).
- Notifications require the person to install the app first, which is a step Android does not have.
- One user-agent test now exists in the app, and user-agent tests age badly. It is confined to a
  single exported function with tests over real agent strings.

## Rejected Alternatives

| Alternative                        | Why Rejected                                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacitor iOS shell for RC1        | Needs an Apple Developer account, macOS build hardware, App Review, and a Swift reimplementation of every Android native plugin. None of it is available in this cycle. |
| Native SwiftUI iOS app             | A second renderer and a second command path against the same vault — precisely the duplication ADR-006 exists to prevent.                                               |
| React Native                       | Replaces the shared renderer for one platform's benefit; worse than Capacitor on every axis that matters here.                                                          |
| Scaffold `ios/` now, ship it later | An unbuildable, untested directory rots and lies about readiness. The decision, not the folder, is the artifact worth keeping.                                          |
| Leave iOS as the `web` runtime     | Keeps shipping wrong fallback copy to iOS users and leaves a future shell with nothing to map onto.                                                                     |

## Migration Impact

- `RuntimeKind` widens to `'web' | 'electron' | 'android' | 'ios'`. Every site that classified a
  runtime by asking whether it was `'web'` now asks whether it is `'electron'`, so iOS is grouped
  with the browsers it actually is: product-analytics platform cohort
  (`apps/gm-react/src/cloud/telemetry.ts`, `useAnalytics.ts`) and remote-play device kind
  (`apps/gm-react/src/net/SessionClient.ts`).
- No persisted shape changes; no `schemaVersion` bump. `RuntimeSignals` gains `iosWebKit`, which is
  computed at startup and never stored.
- Revisit triggers, any of which reopens this ADR: an Apple Developer membership plus approved
  macOS CI budget exists; iOS users demand two or more of durable secret storage, share-target
  import, or background live-session notifications; or the desktop-signing and Play lanes are both
  green so a third store lane no longer blocks a release.

## Rollback Plan

- Trigger: a decision to ship on the App Store after all.
- Steps: `npx cap add ios` inside `apps/gm-react`, implement Swift twins of the Android plugins,
  set `nativeBridgeAvailable` for a native `ios` platform, and add a macOS simulator job. The
  `'ios'` runtime kind and its detection stay exactly as they are.
- Risk: none to data. The renderer, vault, and command path are unchanged either way.

## Verification and Evidence

- `apps/gm-react/src/platform/capabilities.ts` — `RuntimeKind`, `detectIosWebKit`,
  `detectRuntimeKind`, `capabilitiesForRuntime`, `widgetProfileForRuntime`.
- `apps/gm-react/src/platform/capabilities.test.ts` — "reports iPhone and iPad WebKit as its own
  runtime kind with Home Screen notification copy", "lets a real bridge outrank the iOS agent test
  in either direction", "recognizes iPhone agents and touch-capable iPadOS desktop agents, not real
  Macs".
- `docs/architecture/ARCHITECTURE.md` §2.4 and ADR-006 record the four runtime kinds and the three
  shells.
