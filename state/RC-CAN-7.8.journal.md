# RC-CAN-7.8 — Session as a screen

## Session 1 — 2026-10-08

Started on `dispatch/dndtools/82d34add539698b79ec0` at `8dc8b3db` (the `loop/rc` tip, RC-WID-5.5
landed) with a clean tree. No Headroom tools are exposed in this session; command output is read
directly or kept in `/tmp/rc-can78-*.log`. No additional agents.

Inputs read: RC_ROADMAP CAN-7 / WID-5 stories, ADR-041 "Defaults and preservation", SCREENS_PARITY
§3 and §4, the RC-CAN-7.6, RC-WID-5.5 and RC-SES-6.2 journals, `screens/session/*`,
`CommandCenter.tsx`, `command-center.ts`, `widget-package-state.ts`, `parity.ts`, `FlowBoard.tsx`,
`FlowPart.tsx`, `WidgetRenderSlot.tsx`.

### Step 1 — baselines of today's Session (committed first)

`apps/gm-react/src/screens/session/Session.baseline.test.tsx` renders the shipping `/session`
against a real Core seeded by the real demo seed and snapshots the same four serialisations the
Command Center's baselines use (aria, semantic DOM skeleton, heading outline, focus order; the
aria printer also names textboxes, checkboxes and comboboxes, which the console is full of). States:
Standby at desktop, rail and phone; Prep; Live; a live fight (three monsters, one hidden, one
bloodied) at desktop and phone; Recap after a party short rest (the rest timeline, SE-25); player
preview during the fight; a player's own device. 40 snapshots. The conversion is held to them with
the widget-region wrappers unwrapped.

### Step 1b — re-capture with the GM screen provisioned (`fix(core)` first)

The first conversion run matched every aria snapshot but not the DOM: the Stage panel's
per-player projection pickers listed scenes the fixture vault never had. The bespoke console never
provisioned anything, so the fixture had no board; the app creates the board and the home screen on
its first paint of `/`, and the CAN-7.5 captures came from such a vault. The fixture now runs
`command-center.ensure-home` after the demo seed, and the baselines were re-captured on the
UNCHANGED console (the only snapshot change is the board, "Command Center", in the 32 picker lists).

Before that re-capture, `getPlayerViewController` (core, outside Owns) stopped offering default
screens as projection targets: it listed every non-template scene, so the Command Center home
screen (RC-CAN-7.6) was already a target, and the Session screen would have become one. ADR-041
makes them the GM's own consoles; the GM screen's board stays a target. Core test added in
`player-view-control.test.ts`.
