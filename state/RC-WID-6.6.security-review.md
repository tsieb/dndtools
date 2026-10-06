# RC-WID-6.6 — `/security-review` report

Scope: the RC-WID-6.6 changes on `dispatch/dndtools/1bd426555e9aaf9e5591` over base `fe996760`: the
fork path (`widget.package.fork`, `evaluateWidgetPackageForkTrust`, `authoring.forkedFrom`),
`scene.repoint-widget`, the builder's kept drafts and the tile/Inspector "Edit widget" flow. The
skill first ran on commit `d1f2e0b2`. It was re-checked against the attempt-2 changes (re-point onto a
switched-off fork; drafts held for the document instead of device preferences; the two out-of-claim
files reverted). The dispatcher brief forbids extra agents, so the skill's discovery and
false-positive sub-task phases ran inline.

**Result: no HIGH or MEDIUM vulnerability at confidence ≥ 8.**

## Checked

### `widget.package.fork` (`packages/core/src/commands/widget-package.ts`)

- **Who.** DM authority only (`requireDm`; a co-DM passes, as for install). The dispatch observer gate
  refuses observers before any reducer runs, and a player is refused (`widget-fork.test.ts`).
- **What the caller controls.** Only the source package id and widget type, and optionally the
  copy's slug ids and display name. The definition, assets and migrations come from the core's
  own state, never from the payload. The candidate then goes through the same install schema,
  `validateWidgetPackageDefinition` and `normalizeDefinition` an install does.
- **Trust is not laundered.**
  - Nothing about the source's trust carries over. `recordFromPackage` starts every host permission
    `denied`; a source with `clipboard: approved` gives a copy with `clipboard: denied` (tested).
  - Author trust is granted only when the RC-WID-6.2 rule clears the copy itself. That means
    template-only, no code or stylesheet asset, no host permission, no network destination, and a
    `trusted-after-review` verdict, which also excludes player-visible writes.
  - Two source states keep the copy on the review path whatever it contains. A **denied** source
    (`fork.source-denied`), so a copy is not a way around the DM's "no". A **generated** source
    nobody has trusted (`fork.source-generated`): relabelling the copy `user-authored` would
    otherwise have bypassed the summary's "generated packages require review" rule.
  - Torchlight's copy (custom code) is `unreviewed`, off, and every permission is denied (tested).
- **No hijack of another package's tiles.** The fork ids must be slugs. A package id that exists
  (live or removed) is refused, and so is a widget type any record declares, because placed
  instances resolve their package by type.
- **Built-in renderers.** A widget drawn by a `builtin` renderer cannot be copied.
- **System widgets** (attempt 3). `author: 'system'` widgets are refused too, which only narrows
  what can be copied. The reason is correctness: their hand-written body is keyed by type. It is
  not a security control.

### `authoring.forkedFrom` (`schemas/commands.ts`, install and upgrade)

- It is a strict sub-object, and it is provenance only: no code path grants trust or permissions
  from it.
- Its one reader is `scene.repoint-widget`'s lineage check. Forging it needs
  `widget.package.install`, which is DM-only, and the DM can already place and remove any widget,
  so a forged value gives no new authority.
- The MCP propose schema has no `authoring` field, so a model cannot set it.

### `scene.repoint-widget` (`packages/core/src/commands/scene.ts`)

- DM-only.
- It accepts only the fork lineage (onto a copy whose `forkedFrom` names the tile's type and package,
  or back to the widget a copy came from), so it cannot turn a tile into an unrelated widget or
  bypass `scene.add-widget`'s checks.
- The target's configuration schema must accept the instance's configuration. The binding is kept
  as is, so no new data source is reached.
- Attempt 2 lets the target be switched off. A tile on a switched-off package reads
  `disabled` in the scene query, exactly as a tile whose package is disabled after placement does,
  so the change exposes nothing and runs no code (tested).

### Kept drafts (`draft.ts`, `WidgetBuilder.tsx`)

- Drafts are held in memory for the life of the document. They never go to the vault, sync or
  storage.
- The serialized value is parsed defensively: wrong shapes fall back to defaults, and malformed JSON
  reads as no draft.
- A resumed draft's code still runs only in the builder preview's sandbox, with every permission
  denied, and saving it goes through the core's install/upgrade validation.

### Reading a starter's own files (`readPackageCustomCode`)

- These are string transforms on markup that ends up inside the opaque-origin sandbox frame
  (`default-src 'none'`). No host DOM sink is involved and no privilege changes.

### The "Edit widget" event fence (`useEditWidget`)

- It only stops React propagation of key, wheel and context-menu events from the portalled
  builder into the canvas. That is a correctness concern (canvas shortcuts), not a security one.

## Noted, not reported (pre-existing, out of scope)

- `widget.package.upgrade` sets `enabled: !failed` whatever the trust state.
  - Saving an `unreviewed` fork in the builder therefore turns it on. Its code then runs sandboxed
    with every host permission denied: the same posture as the Extensions switch, which already
    enables any package that is not denied.
  - The same rule re-enables a `denied` package when it is upgraded.
  - Both predate RC-WID-6.6. Turning on unreviewed packages is RC-WID-6.7's area (the
    enable/review wording); the denied-package case deserves its own story.
