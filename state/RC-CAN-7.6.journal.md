# RC-CAN-7.6 — The Command Center as the default screen

## Session 1 — 2026-10-05

Started on `dispatch/dndtools/be539aeaeef92ebd066d` at `13bfd9e5` with a clean tree. No Headroom
tools are exposed in this session; command output is read directly or kept in `/tmp/rc-can76-*.log`.

Inputs read: RC_ROADMAP CAN-7/WID-5 epics, ADR-041, SCREENS_PARITY §1 and §4, the CAN-7.3, 7.7,
ENG-8.2, WID-5.1, 5.2 and 5.3 journals, `CommandCenter.tsx`, `command-center.ts`,
`widget-package-state.ts`, `templates/Hub.tsx`, `FlowBoard.tsx`, `WidgetRenderSlot.tsx`.

### Step 1 — baselines of today's Command Center (committed first)

`apps/gm-react/src/screens/CommandCenter.baseline.test.tsx` renders the shipping hub against a real
Core seeded by the real demo seed (`seedDemoContent`, no showcase — the content the CAN-7.5 captures
used) and snapshots, per state, four serialisations:

- `aria` — roles, accessible names, heading levels and the text between them, printed the way
  `ariaSnapshot()` prints. The desktop snapshot matches `state/RC-CAN-7.5/aria/aria-home-desktop.yaml`
  line for line apart from the current "New widget" sub-line (the copy changed after the capture).
- `dom` — the semantic DOM skeleton: headings, controls, images, landmarks and every element with a
  role, with their accessibility attributes and text, in document order. `div`/`span` wrappers,
  `style` and `class` are left out on purpose: what the hub looks like is the screenshot review's
  job, and a token or a wrapper moving is not a regression.
- `headings` and `focus order` — the heading outline and every tab stop by role and name.

States: idle at desktop, rail and phone; live on a table scene; live on the GM screen; no scenes;
the intermediate and core experience tiers (Manage loses Permissions, then disappears); an empty
vault; the player and observer variants. 44 snapshots.

After the conversion the same test renders the new hub and compares against these unchanged
snapshots with the widget-region wrappers (`section[data-widget-region]`) unwrapped.
