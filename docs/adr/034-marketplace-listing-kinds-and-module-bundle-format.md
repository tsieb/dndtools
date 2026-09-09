# ADR-034: Marketplace Listing Kinds and the `.dndmodule` Bundle Format

- Status: Accepted
- Date: 2026-09-07
- Deciders: Engineering
- Consulted: Product, Security
- Supersedes: N/A
- Amended by: its own RC-SYS-3.4 section below (2026-09-08) — "a system package travels as a module,
  and an imported one is re-homed into the `custom:` namespace".
- Amends: ADR-020 — ADR-020 shipped a marketplace whose only publishable thing was a bare
  widget-package definition, so a listing could not say what it was and an install had exactly one
  destination (`widget.package.install`). This ADR gives a listing a **kind** and gives the payload
  an **envelope**; ADR-020's trust posture (owner sub never echoed, payloads plaintext in S3, the
  core owns the install review) is unchanged.

## Context

The RC roadmap's community workstream needs the marketplace to carry four different things: widget
packages, system packages, scene packages, and campaign **content modules**. Three problems blocked
that:

1. A listing row had no kind. Discovery could not filter (RC-CLD-4.2), and the install screen had to
   guess from the payload's shape.
2. A bare payload has no room for a manifest (licence, target systems, authored date) or for assets.
   A campaign module is notes _plus_ maps.
3. Content already has a portable form — the `content.export` command's `dndtools-content-export`
   bundle, which the Export screen downloads and the Knowledge import reads. Publishing content
   through a second, parallel path would have meant two content formats and two review flows, and
   the export path is where the visibility filter and the secret/absolute-path scrub live.

## Decision

**A listing declares one of four kinds** — `widget-package`, `system-package`, `scene-package`,
`content-module` — and the server derives that kind from the payload it actually validated, never
from an unchecked client claim (`packages/cloud-fns/src/app-api/handler.ts`, `resolveListingKind`).
A `kind` field that disagrees with the payload is a 400.

**The wire format is `.dndmodule`**: a JSON envelope `{ format, schemaVersion, manifest, payload,
assets[] }` defined once in the core (`packages/core/src/schemas/module-bundle.ts`,
`packages/core/src/state/module-bundle.ts`) and imported by both the client and the Lambda, so the
server validates a publish against the exact schema the client installs from. The manifest names the
kind; the payload is then validated against **that kind's own canonical schema**
(`widgetPackageDefinitionSchema`, `systemPackageSchema`, and the two payload formats declared here).
Assets are inline base64 under a media-type allow-list that excludes SVG and HTML, because a
marketplace asset is untrusted and those are scriptable documents.

**A content module extends `content.export`.** Its payload _is_ the `dndtools-content-export` bundle,
byte for byte. Publishing one dispatches `content.export` in `portable` mode — the visibility-filtered,
secret-scrubbed projection — so DM-only content cannot be published by accident. Installing one
dispatches `content.commit-import` with policy `skip`: the same transactional, resumable review the
Knowledge screen runs, and the non-destructive policy, so an installed module never overwrites a DM's
own note.

**Install runs a review, per kind.** The Discover screen resolves a fetched payload to an install
_plan_ (`apps/gm-react/src/screens/community/moduleInstall.ts`) and shows what would land — the kind,
the id, the count, and for a content module the note paths — before dispatching. A kind with no
installer in this release (`scene-package`) resolves to `unsupported` and the screen says why instead
of offering a button that could only fail.

**A module is also a file.** The bundle is the marketplace's unit, but the marketplace needs a cloud
account, and a local-only build has none. Community → Export therefore saves a content module as a
`.dndmodule` file and installs one back (`apps/gm-react/src/screens/community/ModuleFile.tsx`),
through the _same_ format, the same install plan and the same review dialog — the command a plan
dispatches lives in one place (`installPlanCommand`) so the two entry points cannot drift into two
different review flows. This is also what makes the publish/install round trip testable end to end:
the e2e server blanks every cloud coordinate by design, so the cloud path is unreachable from a spec.

**Backwards compatibility is by omission.** Listings published before this ADR have no `kind` column
and are read as `widget-package`, which is what they are; a bare (unbundled) widget-package payload
is still accepted on publish. The module payload cap rises from 256 KiB to 512 KiB to fit a manifest
and inline assets.

### Amendment (RC-SYS-3.4, 2026-09-08) — system packages travel, and land under a new id

The `system-package` kind was declared and validated here but had no producer and no consumer: a
listing of that kind could be published, but nothing in the app could write one out, and an install
would have handed `system.define` an id it must refuse. Two pure core helpers close the trip
(`packages/core/src/commands/system-package.ts`): `exportSystemPackageBundle` projects an installed
package into a bundle whose manifest is the package's own facts (display name, summary, version — a
system needs no publishing form, unlike a content module), and `importSystemPackageFromBundle` reads
one back.

**An imported system package is always re-homed into the `custom:` namespace, under a free id.** It
is not a preference: authoring is confined to `custom:` (ADR-023's rule applied to systems), and the
built-in packages ship with the **build** and are re-seeded from code on every load, so an install
that kept `builtin:dnd5e` would either be refused by `system.define` or silently reverted at the next
hydrate. An id the vault already holds is suffixed rather than replaced, so installing a system
**adds** one and never overwrites the DM's own. The install review names the id the package will
really land under before anything is written.

No trust review is added, because a system package is **data**: a vocabulary, attributes, resources,
conditions and formulas, evaluated by the core's own bounded formula evaluator. It carries no code
and requests no host permission, so the widget-package permission model has nothing to grant. It
installs through the same `installPlanCommand` router, the same review dialog, and — like a fork — it
does **not** become the campaign's active system; selecting stays the separate, dry-run-gated
decision RC-SYS-1.3 defines.

Discovery gained the listing-kind filter this ADR's first consequence promised (Community › Discover,
"Kind"), so a DM can narrow the shelf to System packages instead of reading past widget packages and
note bundles.

## Consequences

- Discovery can filter on kind (RC-CLD-4.2) without reading payloads out of S3.
- One format and one validator for four kinds; a new kind is a schema plus an install route.
- The core is the single definition of what a module is; the Lambda cannot drift from the client.
- `scene-package` is publishable and browsable before it is installable. That is deliberate and
  stated in-UI; the scene importer is a separate story.
- Content modules inherit the export path's privacy guarantees rather than restating them.
- A module can be shared by hand, with no account, and the file path is where the round trip is
  exercised in e2e (`apps/gm-react/tests/e2e/module-file.spec.ts`).
- RC-SYS-3.4: a game system is shareable as a file, and an imported one can never shadow a built-in
  or overwrite a DM's own — the cost is that its id changes on import, which the review states.

## Rejected Alternatives

| Alternative                                        | Why Rejected                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A zip archive with a manifest file                 | Needs a zip reader in a Lambda and in the browser for no gain; a bundle is small, and JSON round-trips through the existing S3 path. |
| One listing kind, sniffed from the payload's shape | Exactly what forced the guessing this ADR removes, and it makes filtering impossible without fetching every payload.                 |
| A second content format for published modules      | Two formats and two review flows for one kind of content; the export path is where the visibility filter and the scrub already are.  |
| Trust the client's declared `kind`                 | A listing could then claim to be something its contents are not, and the install screen would review the wrong thing.                |
| Assets as separate S3 objects                      | Multi-object publishes need their own transactionality and lifecycle; inline base64 keeps a module one versioned object.             |

## References

- Story RC-CLD-4.1 (`docs/planning/RC_ROADMAP.md`).
- Amends ADR-020 (app-api backend); composes ADR-002 (a publisher proposes, the DM disposes).
- Tests: `packages/core/tests/module-bundle.test.ts`,
  `packages/cloud-fns/src/app-api/handler.test.ts` (`marketplace`),
  `apps/gm-react/src/screens/community/moduleInstall.test.ts`,
  `apps/gm-react/tests/e2e/module-file.spec.ts` (publish/install of a content module).
