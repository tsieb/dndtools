# RC-CLD-2.7 run journal

## Scope and approach

Implement a consent-gated push transport, deterministic fake queue and calendar reminder scheduler,
with a device settings surface. No Firebase credentials, external delivery, dispatcher state changes,
additional agents, push or promotion. Headroom tools are not available in this session.

The existing calendar scheduling module is the real-world session source (campaign calendars use
fictional dates). Minimal companion wiring in settings/index.tsx and cloud/googleCalendar.ts is
necessary to make the owned modules reachable. The SAM function uses its own esbuild metadata.
Android already creates the updates channel natively; FCM metadata will reference that channel.

## Validation

Pending implementation and focused checks.

## Implemented

- Pure metadata projection, `PushTransport`, replacement-based fake queue, per-device consent
  reconciliation and due-time delivery seam with a second consent check at send time.
- Device-local preview consent uses a fake-specific key, so it cannot become permission for future
  live delivery. Defaults off; revocation clears previews; storage errors fail closed in the client.
- Successful Google Calendar creation supplies the canonical, bounded calendar payload. No attendee
  addresses, notes or access tokens enter the reminder. Failed creation queues nothing.
- Settings > Account contains the translated Notifications panel. Minimal settings shell/calendar
  wiring and English locale keys are companion edits needed for the owned new surface to function.
- Android FCM metadata selects the existing native updates channel and disables automatic messaging
  initialization. Push capability remains unavailable on every runtime.
- SAM has a disabled minute schedule and independently buildable push handler. Its source and
  transport are injectable. The deployed default source is empty and cannot send.

## Validation results

- Focused cloud tests: 4 files, 13 tests passed (scheduler, client consent, existing calendar payload,
  successful/failed calendar-to-push integration).
- Existing platform capabilities tests: 20 passed.
- Playwright desktop + mobile Chromium: 2 passed. Browser test drives the real settings switch,
  injects calendar metadata at the same client seam, observes the fake queue and revokes consent,
  including reload verification. It does not contact Google or exercise authenticated Calendar UI.
- Cloud-fns and gm-react typechecks passed. Focused ESLint and boundary lint passed.
- SAM template lint passed. SAM build passed with the absolute local esbuild binary directory on
  PATH. Initial builds failed because SAM could not resolve esbuild / used a relative pnpm bin path;
  no product change was needed for that environment issue.
- Initial development failures corrected: wrong shared-module relative path, overly narrow test
  fixture type, wrong settings URL, misuse of SetRow/T and missing translations. Final tests above
  ran after those corrections.
- Optional `pnpm verify:ui` could not start: its script requires the `playwright` package directly,
  which is not resolvable in this installation (the installed `@playwright/test` e2e runner works).
  No pass is claimed for that unrelated whole-app script.

## Delivery boundary

This build only previews reminders in memory for the current app session. RC-CLD-2.3 integration
must provide authenticated calendar/consent persistence, a durable idempotent transport and Firebase
credentials before enabling the deployed trigger. Existing preview consent must not authorize live
notifications. No deployment, Firebase calls, native device test, push or promotion was performed.
