# RC-CLD-2.7 run journal

## Scope and approach

Implement a consent-gated push transport, deterministic fake queue and calendar reminder scheduler,
with a device settings surface. No Firebase credentials, external delivery, dispatcher state changes,
additional agents, push or promotion. Headroom tools are not available in this session.

The existing calendar scheduling module is the real-world session source (campaign calendars use
fictional dates). Minimal companion wiring in settings/index.tsx and cloud/googleCalendar.ts is
necessary to make the owned modules reachable. The SAM function uses its own esbuild metadata.
Android already creates the updates channel natively; FCM metadata will reference that channel.

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

## Operator scope retry — 2026-09-20

The current branch still contains candidate `b5abebec`; the worktree was clean on entry.
The 2026-09-18 operator brief explicitly adds the two previously fenced integration files to
ownership. Preserve their existing minimal edits:

- `apps/gm-react/src/cloud/googleCalendar.ts`: reuse the already validated Calendar payload and
  record only its id, title, start and reminder lead after successful event creation. This connects
  reminders to the actual session calendar without copying notes, attendees or credentials.
- `apps/gm-react/src/screens/settings/index.tsx`: import the new Notifications panel and render it
  under Account. This makes the consent surface reachable without changing routing or other tabs.

No additional product wiring is necessary for the ownership retry. Added a deterministic scheduled
handler contract covering consenting versus nonconsenting devices, repeated ticks, cancellation and
revocation. Freeze the contract clock so the fixture cannot silently expire and make consent tests
pass for the wrong reason. Earlier results above are historical.

Fresh retry validation:

- Focused cloud tests: 4 files, 14 tests passed.
- Push Playwright e2e: 2 passed (desktop and mobile Chromium), including opt-in, queued preview,
  revocation and persisted opt-out after reload.
- Cloud-fns and gm-react typechecks: exit 0.
- Focused ESLint, boundary lint, SAM template lint and `git diff --check`: exit 0.
- No new product changes, ownership/control-state edits, deployment or remote operations. The
  operator still owns the full gate and independent review; this retry does not claim either ran.

## Integration rebase repair — 2026-09-20

Rebased the two candidate commits onto the operator-specified integration commit
`2d9f566d194d10e597c8001015b7e8be31811d59`. The sole conflict was adjacent additions at the
start of `apps/gm-react/src/i18n/messages/en.ts`: upstream map-coach keys and candidate push keys.
Kept both blocks verbatim. A direct comparison after removing only the push block proves the
remaining catalog exactly equals the integration catalog. The automatic SAM merge preserves the
integration template and adds only the disabled PushReminderFn resource.

Rewritten commits are `e35565bd` (implementation) and `004053c3` (scheduler contract). A range-diff
against the original two commits shows only the locale insertion context changed; the scheduler
contract commit is unchanged. The integration SHA is an ancestor of the repaired branch.

Fresh checks on the rebased candidate:

- Focused cloud tests: 4 files, 14 tests passed.
- Push e2e: desktop and mobile Chromium both passed (2 tests).
- Cloud-fns and gm-react typechecks: exit 0.
- Focused ESLint, boundary lint, English catalog Prettier check, SAM template lint and diff
  whitespace checks: exit 0.

No product behavior was changed for the conflict repair. Full operator gates and independent
review remain external to this run. No push, promotion, additional agent or dispatcher-state edit.
