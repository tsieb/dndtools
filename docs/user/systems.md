# Systems

Choose rules that fit your table. A system package supplies the names, attributes, resources, conditions, dice, and turn model Lamplight uses.

## Choose a system

Open **Extensions → System** as the GM. The gallery shows installed systems, including the built-in 5e and Generic packages. Select a different package and open its switch preview. Read what will be kept, remapped, or dropped before applying the change.

If the preview shows data loss, stop and export your vault before proceeding. The app asks for an acknowledgment before accepting a destructive switch. A rules change can affect existing characters; it is worth making this decision between sessions.

## Make it your own

Use the fork action to begin with an existing system, then edit the copy in the system builder. Built-in packages stay intact. Work through the builder's fields and review the result before saving your custom system.

A system package describes rules as data. It does not guarantee every rule from a published game has been automated. Try the attributes, resources, conditions, and rolls your table relies on before using a new package during play.

## Bring a package to another vault

Systems travel in a **.dndmodule** file. Importing creates a custom package; it does not activate it. Return to the System gallery and review a switch when you are ready. Installing a starter-library sample likewise gives you a package to choose, rather than silently changing the current rules.

## Implementation references

Source review: 2026-09-12, repository baseline `b54cf4c7` (app 0.3.7). These are
local implementation and existing test references, not a claim that device, network,
or release-installation checks were run for this guide.

- [System.tsx](../../apps/gm-react/src/screens/extensions/System.tsx)
- [system-package.ts](../../packages/core/src/state/system-package.ts)
- [system-package.ts](../../packages/core/src/commands/system-package.ts)
- [systems.spec.ts](../../apps/gm-react/tests/e2e/systems.spec.ts)
- [system-package-portability.test.ts](../../packages/core/tests/system-package-portability.test.ts)
