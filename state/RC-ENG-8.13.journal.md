# RC-ENG-8.13 run journal

## Scope

Move the "Push delivery is unavailable" limit, with its anchor, from the Player app row of
`docs/requirements/FEATURE-GAPS.md` to the Settings row. Acceptance: `pnpm feature-audit` passes;
the Player app row carries no limit outside the RC_ROADMAP §2.1 four. No agents, dispatcher
mutations, push or promotion.

## Source check (code revision `16ef11464`)

- The only renderer of the push copy is `apps/gm-react/src/screens/settings/Notifications.tsx:17`
  (`!pushDeliveryAvailable && … t('settings.push.unavailable')`), mounted by
  `apps/gm-react/src/screens/settings/index.tsx:80`.
- `pushDeliveryAvailable` (`apps/gm-react/src/cloud/push.ts:74`) reads
  `platformCapabilities.pushNotifications.available`, hard-coded `false` at
  `apps/gm-react/src/platform/capabilities.ts:164-167`, which holds the cited literal.
- Importers of `cloud/push` in `src/`: `screens/settings/Notifications.tsx` and
  `cloud/googleCalendar.ts`. Nothing under `apps/gm-react/src/screens/play/` imports it.
- The limit stays open: closure is the operator action RC-CLD-2.3 (FCM credentials).

## Change

- Settings row Honest limits: appended `<br>` + the unchanged limit text and anchor
  (`capabilities.ts:167` › `Push reminders are not delivered on this build.`).
- Player app row Honest limits: now empty.
- Both cells fit the existing 802-character column, so no other row was re-padded (2-line diff).

## Validation

- `pnpm feature-audit`: exit 0, "47 declared limits (0 stale) · 0 inventory issues".
- `npx prettier --check docs/requirements/FEATURE-GAPS.md`: clean.

## Note

The anchor cites the capability flag's message in `capabilities.ts`, not the copy users see
(`settings.push.unavailable` in `apps/gm-react/src/i18n/messages/en.ts:158`). The story asked
for the move with its anchor, so the anchor was kept unchanged.
