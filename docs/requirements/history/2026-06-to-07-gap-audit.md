# FEATURE-GAPS history — the 2026-06/07 gap audit and its update passes

Archived from `docs/requirements/FEATURE-GAPS.md` on 2026-09-04 (RC-STB-3.3), which is now a
per-surface inventory rather than a reverse-chronological changelog.

**Read this only for provenance.** Nothing below is a current statement about the app. The original
section numbering is preserved so older citations ("FEATURE-GAPS §0★★★★") still resolve here:
§0★★★★★ is the 2026-07-23 cloud-tier pass, §0★★★★ the 2026-07-11 e2e-readiness pass, §0★★★ the
2026-07-10 completion pass, §0★★/§0★/§0/§0b the 2026-06 remediation passes, and §1–§9 the original
2026-06-20 audit of what was then an early build.

Current state: [`../FEATURE-GAPS.md`](../FEATURE-GAPS.md) ·
open gaps by workstream: [`../../planning/RC_ROADMAP.md`](../../planning/RC_ROADMAP.md) §1.3.

---

## 0★★★★★. 2026-07-23 UPDATE — cloud-tier P0 pass: vault privacy modes + recovery keys (ADR-026)

Executes P0 #1 and #3 of the adopted cloud roadmap
([CLOUD_TIER_ROADMAP.md](../../development/CLOUD_TIER_ROADMAP.md)); branch `feat/cloud-tier-p0`.

- **Opt-in vault privacy modes (ADR-026, phase 1).** Per-vault Private (E2EE) vs Cloud-Enhanced
  choice, forced as an explicit undefaulted onboarding step (skip/Escape/back refuse until decided;
  Private additionally requires a typed no-cloud-recovery acknowledgment). Legacy/absent = Private,
  fail closed. Core carries both release-approved records; the Cloud-Enhanced record ships
  `approved: false`, so every server-readable path stays release-blocked until the phase-2 security
  review (`docs/security/vault-privacy-modes-threat-model.md`). Settings → Sync gains a Vault
  privacy mode panel with a type-to-confirm switch dialog. E2E: `onboarding-consent.spec.ts` (both
  profiles).
- **Recovery-key export/import (former declared limitation, now closed).** The E2EE backup keyring
  can be exported as a passphrase-sealed file (PBKDF2-SHA-256 600k → AES-256-GCM,
  `vault-crypto.ts`) and imported on a new device (conservative epoch merge — existing wins, the
  current epoch never rolls backwards). The release-approved recovery declaration flipped
  `unsupported-by-design` → `supported`; the enable-time copy now instructs exporting instead of
  warning that export "is not available yet". Settings → Sync gains a Recovery key panel.
- **Gemini BYO provider** (roadmap de-risk item): already shipped by ADR-025's provider onboarding
  cards — no work needed; recorded here so the roadmap doesn't double-count it.

Still intentionally NOT built (unchanged posture + roadmap blocked-on-external items): payment
processor (simulated checkout, ADR-020), prod-stage bootstrap (operator AWS access), FCM push
(Firebase project), and the Cloud-Enhanced server-readable pipeline itself (phase 2, gated on
security review).

---

## 0★★★★. 2026-07-11 UPDATE — e2e-readiness pass: every deferral closed, all flows under e2e

The last "deliberate deferrals" from §0★★★ are now built, wired, tested, and merged
(branch `feat/full-e2e-readiness`). Every feature reachable in a local-first build is functional.
The only things NOT built are items that require an external service/process explicitly out of
scope: a real **payment processor** (checkout stays SIMULATED by design), **official signed desktop
builds**, and **community-extension discovery/curation** (Extensions → Community marketplace needs a
curation service; it is honestly labeled "not wired — needs a network backend", no dead control —
the real _module_ marketplace publish/discover over app-api DOES work in the Community screen). No
surface presents a fake or dead affordance; every unavailable capability states why in-UI.

**Each former deferral, and what closed it:**

- _Co-DM / Trusted role_ → real `co-dm` base role (ADR-022): `hasDmAuthority` (dm+co-dm) vs
  `isCampaignOwnerRole` (dm-only) split, owner-only seat-gated `permission.assign-role`, elevated
  P2P view-model payload, PlayerView elevated tier unlocked, Settings promote/demote + seat gating.
- _Provider-connected AI transport_ → client-side BYO-key transport (ADR-021): Anthropic Messages
  API / any OpenAI-compatible endpoint, key held device-local (never localStorage/vault/op-log),
  model tool-calls routed through the existing MCP agent pipeline as staged proposals; fail-closed
  with no key.
- _Community wiki hosting_ → app-api `PUT/GET/DELETE /wiki` + public `GET /wikis/{id}` (password/
  unlisted/public), Community publish UI, chrome-less `#/wiki` reader; fail-closed when the account
  backend is unconfigured.
- _Custom vault-object types_ (ADR-023) → DM-authored types in a reserved `custom:` id namespace,
  projected through the SAME `VaultObjectSchema` validate/sync/project path as built-ins; define/
  update/delete reuse the vault-authoring gate; delete refused while instances exist (fail closed).
- _SES-emailed invites_ → best-effort `sendInviteEmail` (SESv2) behind an optional recipient field;
  link + QR remain the primary path and a send failure never fails invite creation.
- _Structured equipment/currency/encumbrance_ (I10 S10.1.3/S10.4.2) → `character-inventory` core
  model + commands, `PlayerEquipment` sheet panel (items, five-coin purse, STR-derived encumbrance).
- _Audio presets + scene packages_ (I11 Epic 11.3) → built-in atmosphere library + `audio.apply/
save/delete-preset`, Audio Presets tab.
- _Atmosphere scene cards_ (I11 Epic 11.2) → `scene_card` type + queue/transitions, chrome-less
  `#/display`, player-push banner, scene history.

**Comprehensive e2e:** 20 Playwright specs / **156 tests** on desktop + mobile profiles drive every
feature and previously-uncovered surface through the real UI against the live Core (ai-assistant,
co-dm, wiki, scene-cards, audio-presets, equipment, custom-types, command-palette, backup-restore,
upgrade, join, knowledge, campaign, graph, plus the prior collab/sync/canvas/permissions/isolation
guards). Writing them surfaced and FIXED four real degraded-behavior bugs (mobile main+sidebar grids
never collapsed; the `Field` required-`*` polluted the control's accessible name; a redundant
"Push to players" affordance; a faction reload-persistence race). Zero-degradation is enforced: the
e2e/verify dev servers are forced local-first (VITE\_\* blanked in both playwright.config and the
validate harness) so no test can reach live cloud, asserted by `isolation-guard.spec.ts`.

**Gates (this pass):** core 3306 · app 147 · cloud 169 · tooling 41 · 156 e2e (both profiles) ·
typecheck ✓ · build ✓ (prod `__rt` guard: absent from 44 assets) · eslint 0 errors · boundary +
a11y gates ✓ · **`pnpm validate` 22 pass / 0 fail / 2 warn** (warns = repo-wide Prettier
non-uniformity [documented, not adopted] + this ledger's historical stub prose).

---

## 0★★★. 2026-07-10 UPDATE — feature-completion pass: the honest-stubs list is closed

The completion pass (branch `feat/completion-pass`, ADR-014 amendment + ADR-020) took the
"honest stubs remaining" list from §0★★ to done, under five fixed product decisions:
**(A)** real AWS backends (marketplace/invites/account/devices) with real server-side entitlements
and a clearly-labeled **simulated** checkout — no payment processor; **(B)** a content-addressed
asset-byte store (IndexedDB `assetBlobs`, Dexie v3 additive); **(C)** live Open5e v2 + bundled SRD
5.1 fallback; **(D)** generic JSON character import (D&D Beyond export shape + native); **(E)**
vault sources = File System Access local folder + Google Docs OAuth (PKCE, fail-closed until
`VITE_GOOGLE_CLIENT_ID`).

**Each former stub, and what closed it:**

- _Community publish/discover_ → real marketplace over `infra/app-api` (S3 payloads, DynamoDB
  listings, Cognito-scoped ownership); install runs the existing fail-closed package review flow.
- _Billing/account/devices_ → app-api entitlements (`simulated: true` in the API contract),
  Cognito profile/device list/revoke/global sign-out, export-my-data, delete-account; Settings
  renders labeled local states when unconfigured/signed out. Invites are server-minted TTL join
  links redeemed at the chrome-less `#/join` screen.
- _AI-provider config_ → Settings AI tab drives the durable core `mcp.*` slice (bindings,
  policies, staged-proposal approve/reject, audit trail); provider transport honestly absent.
- _Map raster preview_ → real bytes in the asset store; MapBuilder/Atlas render rasters, players
  get them ONLY through the projection-gated resolver (`app/projectedMap.ts`).
- _Generation panel + fog brush/polygon_ → `map.generate-layers` dispatched; fog is a
  rect|polygon|stroke union with optional feather (legacy rect ops preprocess on replay).
- _D&D Beyond import_ → reviewable JSON import plan (`app/charImport/`) with a field-level
  unmapped report; nothing dispatches unconfirmed.
- _PC custom attacks / DM-only fields_ → attacks survive finalize; post-create editing via
  `character.update-attacks`; sharing via `character.set-sharing`; skills/saves/passive-perception
  panels on `Character.proficiencies`; player-side PC switcher.
- _Campaign-system switch apply_ → `previewSystemSwitch` dry-run dialog gating
  `widget.package.switch-system` (destructive drops need explicit acknowledgment).
- _Invite transport_ → the app-api invite links above (SES email deliberately not built).

**Also landed:** audio local-file import + output-device routing (`setSinkId`, feature-detected) +
real ambience mixer + automation tab (AUDIO-005 UI) · full-vault backup/restore (fail-closed
validate → confirm → authoritative restore) · content export downloads (.md / .json bundle) with
real per-type scope · Open5e/SRD compendium tab (monsters → roster, spells → vault, CC-BY
attribution in-UI) · quest threads / recap authoring / scene delete+undo · presence side-channel
(raise-hand/ready → host-stamped `session.set-presence`, DM roster; `PLAYER_REQUESTABLE_PREFIXES`
untouched) · live widget bodies, real StatusDot, experience-tier gating via `FEATURE_GATES` ·
theme preset persistence · connected vault sources (local folder + Google Docs) with core-gated
write-back (CONTENT-012) · `runtime/mockCampaign.ts` DELETED (feature-audit enforces zero
importers).

**Honest remaining (deliberate deferrals, labeled in-UI where surfaced):** Co-DM/Trusted role ·
real payment processor (checkout stays simulated by design) · SES-emailed invites (links/QR only) ·
provider-connected AI transport (MCP registry is real; nothing can connect yet) · custom
vault-object types (no core command; registry renders read-only) · community wiki hosting (honest
preview; real eligibility counts) · Google OAuth requires one-time manual GCP setup
(`docs/runbooks/google-oauth-setup.md`).

**Gates (this pass):** core 3203 · app 107 · cloud/net 136 · typecheck ✓ · build ✓ · eslint 0
errors · full `pnpm validate` run recorded in the validation report.

---

## 0★★. 2026-07-04 UPDATE — completion pass (latest): every surface functional

A 10-agent completion wave (disjoint file ownership) + a lead-driven chrome/hygiene pass closed the
remaining functional and design-fidelity gaps against the online prototype (design project B) and
`@dndtools/core`. Commit `feat/gm-react-completion`.

_2026-07-05 adversarial-review fix pass (37-agent find→2-refuter-verify workflow; 7 confirmed + 5
lead-verified findings, all fixed):_ fresh-vault choice now truly suppresses demo maps
(`loadCoreState` no longer substitutes the demo map state before the guard could run — verified
headless: fresh boot = 0 maps/chars/notes/scenes); choosing the sample after a prior "start fresh"
clears the choice key and re-seeds (was a permanent silent no-op); the ready-step checklist
shortcuts route through `finish()` (tier/vault/invites were silently discarded); onboarding step
changes focus the content region instead of parking focus on "Skip setup", and the vault/experience
radiogroups follow the ARIA pattern (roving tabindex + arrows); MapBuilder gained the app's Tab
focus trap, its Delete/Backspace shortcut is inert behind open dialogs, and Escape in a label field
blurs the field instead of closing the builder; demo-seed backfills the per-PC owner grants on
pre-existing vaults (own-absence guard, like factions/wikilinks); Session combat rows and
Extensions SRD cards no longer swallow Enter/Space from nested buttons; CharBuilder's
Name/Alignment/Owned-by/Subclass fields have accessible names.

**New surfaces (were missing or fabricated):**

- **Onboarding** (`src/app/Onboarding.tsx`) — the prototype's 5-step first-run overlay, core-wired:
  vault step shows the real seeded counts and "Start fresh" genuinely wipes (`resetCoreStorage()` +
  a `dndtools:react:vault-choice` seed guard in `SceneRuntime.load()`); experience step drives the
  same feature-tier convention Settings uses (live `visibleFeatures()` reveals); ready checklist is
  computed from the vault. Settings → "Replay setup" re-opens it for real.
- **MapBuilder** (`src/app/MapBuilder.tsx`) + Atlas — engine-free SVG geometry renderer (grid,
  ordered layers, fog composed from the durable MAP-012 op log at DM/player opacities, POIs, tokens)
  and a full-screen builder overlay: drag-drawn fog rects (`map.append-fog` with the REAL region),
  click-placed POIs, token create/move/delete, layer visibility/opacity/lock/reorder, and a real
  import wizard (`previewMapImport` → `map.import-asset`/`map.commit-import`, metadata-only per
  ADR-014 and labeled as such).
- **CharBuilder** (`src/app/CharBuilder.tsx`) + Characters — the prototype's guided 6-step wizard
  running the REAL core draft flow (create-draft → per-owner update-draft-step → finalize-draft →
  set-combat → owner capability grant); NPC/monster/sidekick land through one enriched
  `character.quick-create`.
- **EncounterBuilder** (`src/app/EncounterBuilder.tsx`) + Session — encounter composition over the
  real actor-filtered roster (quick-add foes, per-combatant initiative, challenge meter) dispatching
  `encounter.build` → `combat.start`; the same dialog reinforces mid-combat
  (`combat.add-combatants`), plus roster ops (remove/reorder/set-visibility), a condition picker
  over the CONDITIONS catalog, and the DM campaign-date panel (`session.set-campaign-date`).

**Now genuinely functional (was stub/partial):** canvas keyboard operation (roving tabindex per
core focus order; arrows/Shift+arrows/Delete commit one op per press) and live Dice/Timer widget
bodies via `widget.dispatch-command`; scene metadata editing (`scene.update-metadata`,
`scene.set-focus-order`); Player staged level-up (CHAR-009) + personal quests/highlights journal +
party marching order/shared stash; `/play` dice as the player actor into the shared session log;
⌘K palette backed by `searchVaultForActor` (notes/objects/POIs/handouts/rolls + maps); Audio
add-source form + an app-lifetime `<audio>` playback driver reconciling `session.audioPlayback`
(mounted at shell level); Extensions Plugins tab on real `widget.package.*` dispatches; Campaign
factions as a core `content.*` vault-object subtype (additive core change, 3183 tests green);
Upgrade change-plan dialog whose device-local choice Settings reads back.

**Chrome:** responsive shell — full sidebar ≥1025px, DS `NavRail` at 641–1024px, DS `BottomTabBar`

- "More" `Sheet` ≤640px (same IA, presentation-only). Settings truthfulness — real shortcut list,
  LIVE player-safety leak checks (re-reads the world as each player actor), honest migration dry-run
  dialog with the apply action disabled.

**Hygiene:** route-level code-splitting (16 lazy chunks; boot bundle −363 kB); tavern
`--color-text-tertiary` raised to `#9d8d75` (≥4.5:1 AA on raised surfaces) in BOTH apps with
`scripts/token-contrast-lint.ts` extended to gm-react + a tertiary-on-raised pair (122 checks);
demo-seed audio is now a generated silent data-URI WAV (the fake host errored on every page);
`pnpm verify:react[:routes|:roundtrip|:canvas|:ui]` aliases.

**Honest stubs remaining (labeled in-UI, no core backing):** Community publish/wiki/discover ·
billing/account/devices · AI-provider config · map raster preview (metadata-only import, ADR-014) ·
MapBuilder generation panel + fog brush/polygon sub-tools · D&D Beyond character import · PC custom
attacks / post-creation dm-only fields · campaign-system switch apply · invite transport (emails
stay device-local, labeled).

**Gates (all green, this pass):** `typecheck` (react + core + gm svelte) ✓ · `build` ✓ ·
`verify-routes` 16/16 · `verify-roundtrip` 11/11 · `verify-canvas` 13/13 · **`verify-ui` 10/10** —
now incl. Onboarding 5-step walkthrough, CharBuilder wizard (asserts `character.finalize-draft`),
encounter launch (asserts `combat.start`), canvas keyboard move (asserts `scene.move-widget`), and
builder POI place (asserts `map.poi.create`). Core suite 3183/3183 · eslint + boundary + both
contrast lints ✓. All gate pages pre-set `dndtools:react:onboarded` (the overlay would cover every
surface); the onboarding case runs without it by design.

---

## 0★. 2026-06-24 UPDATE — deep code-review + fix pass

A 5-agent read-only deep review (runtime/wiring · canvas+live-play · content+platform · shell/cross-cutting · UX/a11y) was run against the whole app; the lead then applied every fix serially. All findings were verified against the real `@dndtools/core` command/query schemas.

**P1 (broken-feature) fixed:**

- **Demo PCs never seeded** — the demo seeded 3 PCs via `character.quick-create`, but its `kind` enum excludes `'pc'`, so every PC was silently rejected and the party/`/play` surfaces seeded with ZERO player characters. Now seeded through the **real guided draft flow** (`create-draft` → 3× `update-draft-step` identity/abilities[valid 27-pt buy]/class → `finalize-draft`, dispatched as the owning player, then DM `set-combat`). Result: 3 real `kind:'pc'` characters with classes/backgrounds/HP/AC (verified in a fresh DB).
- **Dice panel inverted** — showed the OLDEST roll as "last result" (`rolls[0]`); now reads the tail and shows the per-die breakdown.
- **Board "Restore safe point" was structurally dead** — `snapshot-auto-save` was never dispatched, so restore always rejected. Now a safe point is captured on entering edit mode + before applying a preset, and the button only renders once one exists (round-trip gated in `verify-ui`).
- **No error boundary / swallowed load failure** — a rejected lazy chunk or any render throw blanked the app; a thrown Dexie load stuck it on "Loading…" forever. Added an `ErrorBoundary` with reload, a load-error retry screen, and a global `unhandledrejection`→toast (PLAT-018 re-throw net).
- **Reduced motion not honored** — 6 hardcoded transition durations bypassed the duration tokens; now tokenized, plus a global `[data-motion='reduced']` rule that also stops looping animations.

**P2 fixed (selection):** disabled illegal session-workflow transitions (Session Seg + ProjectionControl, via `allowedTransitionsFrom`); blank advancement "Save choices" disabled; Session now-playing shows the track title not a uuid; Player level/class read from core not mock; Settings→Plugins redirects to the live Extensions registry (was parallel mock); Settings/Upgrade silent no-op buttons now give honest feedback; theme `color-scheme` syncs on live switch; a11y — Seg `radiogroup`, `aria-current` nav, skip-link + `<main>` target, `Panel` titles → `<h2>`, ViewAsControl Escape/focus, Session combatant + Campaign cards + Extensions row keyboard-operable, Graph search label + player-view guard; dead `Button` import and `SECTIONS` export removed.

**Deferred (documented, not regressions):** canvas keyboard nav (large, tracked in §0b inspector work); `--color-text-tertiary` on raised surfaces measures 3.79:1 (a token-color decision better made with the designer across all 3 themes); full IconButton/Seg density-token wiring (36→44px is a global layout cascade — doc comment + Settings copy corrected to be honest instead); mobile/responsive shell + the <1200px density floor (product decisions, faithful to the prototype).

**Gates (all green):** `typecheck` ✓ · `build` ✓ · 16/16 routes 0-console-error · `verify-roundtrip` 11/11 · `verify-canvas` 13/13 · **`verify-ui` 6/6** — now incl. **Seed · 3 PCs via draft flow** (`hp=[24,31,42]`) and **Board · safe-point round-trip**.

---

## 0. 2026-06-23 UPDATE — wiring remediation pass (SUPERSEDES the §1 verdict below)

A coordinated multi-agent pass closed the bulk of the C1 "two data realities" gap. The verdict below
(written 2026-06-20: "3 of 15 wired, ~20% functional") is **historical** — kept for the record. The
current state:

**Now functionally wired to the Processing Core (read + dispatch, verified):**
`/` CommandCenter, `/board`, `/scene/:id`, `/scenes`, **`/session`** (combat `combat.start/advance-turn/apply-resource`, dice `dice.roll`, handouts `session.deliver/revoke/acknowledge-handout`, lifecycle `session.set-workflow`, active-map `session.set-active-map`/`project-active-map`, now-playing `session.audio.*`), **`/characters`** (`character.quick-create`/`edit-field`/`set-combat`/advancement, `combat.start`), **`/atlas`** (`map.create`/`create-layer`/`set-layer-visibility`/`reorder-layer`/`create-poi`/`append-fog`), **`/knowledge`** (`content.create-item`/`update-item`/`set-item-visibility`/`remove-item`/`commit-import`), **`/campaign`** (read-only world model: characters/content/calendar), **`/audio`** (`audio.*` library + transport + scene-link), **`/graph`** (real graph/backlinks/health reads), **`/player`** (real sheet/resources), **`/settings`** (Appearance persisted + Players/Permissions `grant.*`/`player-group.*`, Sync, Complexity). Plus two NEW surfaces: **`/play`** (`PlayerView` — standalone chrome-less player companion) and **`/upgrade`** (`Upgrade` — plans/pricing).

**Honest stubs (no Core backing — labeled in-UI):** Community publish/wiki/discover, billing/account/subscription, AI-provider config, the map **pixel renderer** (ADR-014 — data/control layer is wired, painting is a stylized placeholder). _(2026-07-04: Extensions install/enable/disable/remove/upgrade are now real `widget.package._`dispatches — only the community marketplace fetch remains a stub; Campaign factions are now a core`content._` vault-object subtype.)_

**Verified this pass:** `typecheck` ✓ · `build` ✓ · 16/16 routes mount with 0 console errors · `verify-roundtrip` 11/11 · `verify-canvas` 13/13 · **UI-driven** (real button click → core op-log grew → survives reload): Characters New-character, Atlas New-map, Session Go-live, Knowledge New-note.

**Known empty-states out of the box (not bugs — features work, demo data is just unseeded):** ~~Session now-playing audio + handouts, Campaign timeline/backlinks~~ — **mostly closed (2026-06-23, see §0b)**. Remaining: Knowledge backlinks (needs `[[wikilinked]]` notes), and delivered handouts (intentionally unseeded — see §0b).

---

## 0b. 2026-06-23 UPDATE — deferred canvas design built + demo-seed enriched

The two items left open in §0 are now done.

**Deferred canvas work — BUILT (ported from prototype `inspector.jsx` + `widgets.jsx`):**

- **Per-type widget-body templates** — `src/app/widget-bodies.tsx` renders each widget's representative body on the scene canvas from its REAL `configuration` (note heading/body, dice formulas, timer `durationSeconds` as `mm:ss`, character HP/AC + ability chips, initiative round/turn, audio loop state, map dot-grid, quick-ref/prep row counts). Wired into `SceneBoardCanvas.WidgetFrame`, replacing the generic description block.
- **Tiered Inspector** — `SceneEditor.Inspector` is now data-driven: it renders the selected widget definition's declared `configFields` (`WidgetDefinition.configFields` — the core's own customization surface) as live controls (text/textarea/number/toggle/select/color), each round-tripped through `scene.configure-widget`. Text/number commit on blur (one op per edit, never per keystroke); toggles/selects commit immediately. Binding-backed content (map/character) shows a locked note; the tier badge distinguishes system vs template/custom. A `title` override now flows through `board-helpers` so a renamed widget shows its new title. **Verified UI-driven:** edit → persists in core → canvas body reflects it → survives reload.

**Demo-seed enriched (`src/runtime/demo-seed.ts`) — seeded through the REAL core dispatch path (persists to IndexedDB, survives reload like user content), NOT frontend mock:**

- **Campaign calendar + dated notes** → `content.define-calendar` ("Reckoning of Saltreach", 6 months) + 3 dated notes (`dateFields`) → the Campaign **Timeline** tab now renders 3 ordered, calendar-formatted entries (was empty).
- **Now-playing audio** → `audio.configure-source` (web-stream, declared cache ⇒ playback-enabled, no asset bytes needed) + `session.audio.play` → the Audio **now-playing** strip shows the playing track (was "Nothing playing"). The strip now resolves the source's display name instead of a raw id.
- Each new category has its own emptiness guard added to the early-return, so an existing vault backfills the new content; the swallowing `catch` is supplemented with a DEV warn so a mis-shaped datum surfaces.
- **Delivered handouts deliberately NOT seeded:** `session.deliver-handout` requires an `active` Session workflow; forcing the vault "live" on first load (no players connected) would be incoherent and would flip the Session "Go live" gate. An empty delivered-handout list with no live session is correct domain behaviour.

**Verified this pass:** `typecheck:react` ✓ · `build:react` ✓ · 16/16 routes (0 console errors) · `verify-ui` 4/4 (incl. Session **Go-live still passes** — the seed did not force an active session) · `verify-canvas` 13/13 · feature assertions (calendar/dated-notes/audio-track all landed in core state; inspector edit persists+reflects across reload) ✓.

**Still deferred:** onboarding flow; the seven legacy modals; Knowledge `[[backlinks]]` demo data; the map pixel renderer (ADR-014). App remains uncommitted (untracked worktree).

---

## 1. Verdict (HISTORICAL — 2026-06-20, superseded by §0)

**Not yet a usable tool.** The architecture is real and sound — but only **3 of 15 screens** are
functionally wired to the Processing Core. The other 12 render **static mock data** (`mockCampaign`)
with handlers that are no-ops or local-only component state. The two halves of the app read from two
different, disconnected data worlds, so **the app cannot hold a coherent campaign across screens**:
content you create on a wired screen never appears on the others, and everything the mock screens
show is fabricated and unsaveable.

As a _design prototype_ (its stated purpose) it is strong: it builds, typechecks, every route mounts
clean, and the visual framework is cohesive. As an _actual usable tool_ it is roughly **20%
functional** — a real spine (runtime + IndexedDB persistence + scene/board canvas) wrapped in a
non-functional skin.

### What is genuinely functional (verified)

| Area                                         | Status                | Evidence                                                                                                        |
| -------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Core runtime + IndexedDB persistence         | ✅ Real               | `SceneRuntime` → `dispatchCommand` → `persistFullState`; round-trip gate **11/11**                              |
| `/board` — spatial widget board              | ✅ Wired              | `Board.tsx` dispatches `command-center.ensure-home`, `scene.move/resize-widget`, presets; canvas gate **13/13** |
| `/scene/:id` — scene canvas editor           | ✅ Wired              | `SceneEditor.tsx` dispatches `scene.add-widget`/move/resize; survives reload                                    |
| `/scenes` — scene list/create                | ✅ Wired              | `ScenesCreator.tsx` dispatches `scene.create`; lifecycle "Saved" affordance real                                |
| Settings → Appearance (theme/density/motion) | ✅ Wired + persistent | `Settings.tsx:37-39` writes `localStorage`; `index.html:14-48` restores before first paint                      |
| Route navigation (sidebar/topbar)            | ✅ Wired              | `react-router`; all links resolve                                                                               |
| Build / typecheck / boot                     | ✅ Green              | `pnpm build:react` ✓, `typecheck:react` ✓ (exit 0)                                                              |
| All 15 routes mount without errors           | ✅ Verified           | Smoke test 15/15, incl. unknown `/scene/:id` degrades gracefully                                                |

### Method

Ran against the live dev server (`pnpm dev:react`, port 5273):
`typecheck:react` (PASS) · `build:react` (PASS) · `verify-roundtrip.mjs` (11/11) ·
`verify-canvas.mjs` (13/13) · a 15-route headless smoke test (15/15 mount, 0 page errors). Then
static cross-reference of every `src/screens/*.tsx` for `useRuntime`/`dispatch`/`mockCampaign`/no-op
handlers, and comparison of the live-play surfaces against the (now archived) Svelte wiring
reference in `archive/gm-svelte/src`.

**Verification basis (be precise about it).** The two shipped gate scripts dispatch commands via the
DEV `window.__rt` handle, _not_ by clicking the UI — so on their own they prove the _Core_ accepts a
command, not that a _button_ fires it. The "✅ Functional" rating for the 3 canvas screens therefore
rests on **code-reading** (their handlers genuinely call `runtime.dispatch`, unlike the mock screens'
`onClick={() => {}}`) **plus** one **UI-driven** check I ran for this audit: on `/board`, clicking
_Edit layout → Add → a widget entry_ drove the home-scene widget count 7→8 and it survived reload, 0
errors. That makes `/board` end-to-end verified; `/scene/:id` and `/scenes` are verified by the same
code pattern but were not individually click-tested. The 12 "Mock" ratings rest on the inverse
evidence (no `dispatch`, no-op handlers).

---

## 1.5 Remediation progress (live)

> Updated as gaps are filled. Each ✅ was verified **UI-driven** (real click in Playwright → core
> state changed → survived reload), not just typecheck-green.

| Gap                                                 | Status         | Verified by                                        |
| --------------------------------------------------- | -------------- | -------------------------------------------------- |
| C3 — Home wired to core                             | ✅ Filled      | home renders real scenes/party/counts              |
| H2 — `/board` reachable + scene rows → `/scene/:id` | ✅ Filled      | sidebar scene row opens `/scene/:id`; Board in nav |
| H3 — ⌘K command palette                             | ✅ Filled      | ⌘K opens palette → navigates to a scene            |
| H4 — View-as / preview                              | ✅ Filled      | Preview as Player → write rejected read-only       |
| H5 — Projection / live session                      | ✅ Filled      | Go live → `session.workflow=active` + persists     |
| M1 — Global Toaster                                 | ✅ Filled      | `ToastViewport` mounted; actions confirm           |
| L1 — Real nav counts                                | ✅ Filled      | sidebar/library counts derive from core            |
| C1 — Coherent campaign (mock→core)                  | 🟡 In progress | home/chrome now coherent; per-screen ongoing       |
| C2 — Session live-play                              | ⬜ Next        | —                                                  |
| M2–M9 screens                                       | ⬜ Pending     | —                                                  |

## 2. Severity scale

Anchored to the goal — _"an actual usable tool"_ — not to visual polish.

- **🔴 Critical** — breaks the product premise. The app misleads the user about its own state, or its
  central job (running a live session) does not work at all.
- **🟠 High** — a major workflow is entirely unreachable or non-functional (creation, the live
  session controls, the command palette, preview/projection).
- **🟡 Medium** — a screen is browse-only: it shows data but cannot edit/persist it, or feedback is
  missing.
- **🔵 Low** — cosmetic / hygiene / accuracy nits that don't block use but mislead or add debt.

---

## 3. 🔴 Critical gaps

### C1 — Two disconnected data realities (no coherent campaign)

The 12 visual screens render **static `mockCampaign` globals** (`DNDData`, `DNDHub`, `DNDPlayer`, …),
while the runtime seeds **different** demo content into the real Core that only the 3 wired screens
read. These never meet. Concretely:

- Create a scene in `/scenes` (real) → it does **not** appear in the Command Center home tiles
  (`CommandCenter.tsx` reads `DNDData`/`DNDHub` mock — `CommandCenter.tsx:6`).
- The canvas gate proves `content.create-item` round-trips through Core, yet the **Knowledge** screen
  that should show notes reads mock and its editor is a no-op (`Knowledge.tsx:97-98,162-165`).
- The sidebar Scenes library lists `DNDHub.scenes` (mock) — a different set from the real scenes in
  `/scenes`.

**Impact:** nothing the user does on a real surface is reflected anywhere else; everything the mock
surfaces show is fiction. This is more disqualifying than any single button. **Fix:** point the
visual screens at `useRuntime()` + the actor-filtered Core queries (the README §"Porting a screen"
already specifies exactly this), deleting the `mockCampaign` reads.

### C2 — The live-play surface (Session) is entirely mock

`Session.tsx` is the product's whole premise — "the live scene: combat, dice, maps, what players
see." It has **`useRuntime=0`, `dispatch=0`**, 21 `onClick`s of which **6 are explicit no-ops**
(`Session.tsx:199,252,407,414,455,463`). Combat, initiative, dice, handouts, add-widget — all
render from mock and do nothing.
The Core fully supports this (`combat.start`, `combat.advance-turn`, `combat.hp`, `dice.roll`,
`encounter.build`, `session.deliver-handout`, … exist in `packages/core`), and the **Svelte app
wires it through 9 GUI components** (`CombatTracker.svelte`, `DiceTools.svelte`,
`EncounterBuilder.svelte`, `CharacterRoster.svelte`, …). The React port wires none.
**Impact:** you cannot run a session. **Fix:** wire `Session.tsx` to the combat/dice/session command
families, using the Svelte components as the spec.

### C3 — The home screen shows fabricated state

`CommandCenter.tsx` (`/`, the launcher hub) is documented in README as a "core-wired … surface," but
it has **`useRuntime=0`, `dispatch=0`** and reads `DNDData`/`DNDEdit`/`DNDGaps`/`DNDHub` mock
(`CommandCenter.tsx:6`). The "resume the live scene," scene tiles, prep gaps, and counts are all
fake. Its only real behavior is route navigation.
**Impact:** the first screen the user sees presents invented campaign status as if real — actively
misleading. **Fix:** wire to `resolveCommandCenterHome` / `listScenesForActor` (the README names
these), drop the mock.

### C4 — 11 of 15 screens cannot persist anything

Every section screen except the 3 canvas surfaces is browse-only against mock data; their edit
controls are no-ops or `useState` that resets on reload. A user who "edits" a character, toggles a
plugin, writes a note, or changes a permission loses it instantly and silently. (Detailed per-screen
in §6.) **Impact:** the app _looks_ editable everywhere but is editable almost nowhere.

---

## 4. 🟠 High gaps

### H1 — All creation flows are dead ends

"New character/map/note/widget/scene" buttons either navigate to a screen that can't create, or are
no-ops:

- `CommandCenter` quick actions just `navigate()` (`CommandCenter.tsx:129-133`) to screens with no
  create capability.
- `Characters.tsx:179,182,242,245` (New/Edit/Import/Start combat) — all `onClick={() => {}}`.
- `Knowledge.tsx:162,165` (Import/New note) — no-op.
- `Atlas.tsx:55,58,95` (Edit/New map/Reveal) — no-op.
  Only `/scenes` (`scene.create`) actually creates anything.

### H2 — `/board` and `/scene/:id` are unreachable from the UI

The genuinely-functional `/board` is **not linked from any screen or nav group** — reachable only by
typing the URL. `/scene/:id` is reachable only via `ScenesCreator` rows. The sidebar Scenes library
rows all `onOpen={() => go('session')}` → the **mock** `/session`, never the real `/scene/:id`
(`AppShell.tsx:309`). **Impact:** the app's best, working surfaces are hidden behind a dead navigation
seam. **Fix:** add `/board` to the IA; route sidebar scene rows to `/scene/:id`.

### H3 — ⌘K command palette is a no-op

The topbar/sidebar search affordance is `onClick={() => {}}` (`AppShell.tsx:252`), and there is no
keyboard handler for ⌘K anywhere. A `CommandPalette` DS component exists
(`src/ds/components/command/CommandPalette.jsx`) but is never mounted. **Impact:** the primary
navigation/action accelerator advertised in the topbar does nothing.

### H4 — "View as" / Preview is implemented in the runtime but unreachable

`SceneRuntime` ships `setActiveActor`, `enterPreview`, `exitPreview`, `actors`, and read-only
enforcement (verified by the round-trip gate's preview-rejection check). **No UI exposes any of it** —
the AppShell has no actor switcher and no preview toggle. **Impact:** the player-safe preview model,
a headline design principle, cannot be used.

### H5 — Projection (Project/Stop) is a fake local toggle

The topbar projection pill is `useState(true)` flipped by the button (`AppShell.tsx:391,484`); it
dispatches nothing and drives no real player view. **Impact:** "what players see" — core to a GM tool
— is purely decorative.

### H6 — All interaction-gated overlays are no-op launchers

Per PROTOTYPE.md §4 (Deferred): the 7 modals (newScene, addWidget, condPick, changePlan,
importWizard, migration, buildSystem), the full-screen scene creator, the onboarding flow, and the
Atlas map-builder are wired as no-op launchers. Their authentic source is documented but unbuilt.
**Impact:** every "advanced" entry point opens nothing.

---

## 5. 🟡 Medium gaps

| ID  | Gap                                                                                                                                                                                                            | Evidence                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| M1  | **No global Toaster** — every action that should confirm/undo is silent                                                                                                                                        | PROTOTYPE.md §4; `Community.tsx:9`, `Player.tsx:10` |
| M2  | **Settings: only Appearance persists.** Account, Subscription, Players, Permissions, Vault, Sync, AI, Plugins, Systems are local `useState` over mock — toggles work visually, reset on reload, affect nothing | `Settings.tsx:93-95,419,448,479`                    |
| M3  | **Settings → Complexity** is local `useState('standard')`, not persisted and drives nothing                                                                                                                    | `Settings.tsx:51`                                   |
| M4  | **Knowledge** editor / "push to players" / share are no-ops despite Core `content.*` working                                                                                                                   | `Knowledge.tsx:97-98,127`                           |
| M5  | **Characters** sheet is mock (the full MaraSheet renders but edits nothing); no draft/creation wiring                                                                                                          | `Characters.tsx` (`useRuntime=0`)                   |
| M6  | **Audio** soundboard/scene-link no-ops though Core has full `audio.*` + `session.audio-*` state                                                                                                                | `Audio.tsx:229`                                     |
| M7  | **Player** sheet/resources/level-up/journal are mock and unsaveable                                                                                                                                            | `Player.tsx` (`useRuntime=0`)                       |
| M8  | **Graph / Campaign / Community / Extensions** are static renders of mock; no real graph/query/install/publish                                                                                                  | resp. `useRuntime=0`, 10 no-ops in `Extensions.tsx` |
| M9  | **Atlas** map list, layers, fog, POIs are mock; no map mutations though Core `maps.*` exists                                                                                                                   | `Atlas.tsx` (`useRuntime=0`)                        |

## 6. Per-screen functional status

| Screen                     | Route         | Wired to Core? |     Persists?      | No-op buttons | Net status                                   |
| -------------------------- | ------------- | :------------: | :----------------: | :-----------: | -------------------------------------------- |
| Board                      | `/board`      |       ✅       |         ✅         |       0       | **Functional** (but unreachable in-app — H2) |
| SceneEditor                | `/scene/:id`  |       ✅       |         ✅         |       0       | **Functional**                               |
| ScenesCreator              | `/scenes`     |       ✅       |         ✅         |       0       | **Functional**                               |
| Settings (Appearance only) | `/settings`   |   ⚠ partial    | ✅ appearance only |       —       | **Partial** (M2/M3)                          |
| CommandCenter              | `/`           |       ❌       |         ❌         | 0 (nav-only)  | **Mock** (C3)                                |
| Session                    | `/session`    |       ❌       |         ❌         |       6       | **Mock** (C2)                                |
| Characters                 | `/characters` |       ❌       |         ❌         |       4       | **Mock**                                     |
| Atlas                      | `/atlas`      |       ❌       |         ❌         |       3       | **Mock**                                     |
| Campaign                   | `/campaign`   |       ❌       |         ❌         |       0       | **Mock**                                     |
| Knowledge                  | `/knowledge`  |       ❌       |         ❌         |       5       | **Mock**                                     |
| Graph                      | `/graph`      |       ❌       |         ❌         |       0       | **Mock**                                     |
| Audio                      | `/audio`      |       ❌       |         ❌         |       1       | **Mock**                                     |
| Extensions                 | `/extensions` |       ❌       |         ❌         |      10       | **Mock**                                     |
| Community                  | `/community`  |       ❌       |         ❌         |       0       | **Mock**                                     |
| Player                     | `/player`     |       ❌       |         ❌         |       0       | **Mock**                                     |

## 7. 🔵 Low gaps

- **L1** — Sidebar nav counts are hardcoded strings (`"4 PCs · 23 NPCs"`, `"12 maps"`, `"38 notes"`)
  in `nav.ts`; they don't reflect real or mock state and will be wrong the moment data changes.
- **L2** — Single **1.47 MB** JS bundle (gzip 386 KB), no code-splitting (build warns >500 KB).
- **L3** — `src/runtime/mockCampaign.ts` is `@ts-nocheck`; mock data shapes are untyped.
- **L4** — `Section` titles/subtitles and library counts duplicated between `nav.ts` and screens.

---

## 8. Docs vs. reality

The in-repo docs describe the _design intent_ and partly mask the wiring reality:

- **README** lists `CommandCenter.tsx` among "Core-wired canvas/data surfaces." It is **not** wired
  (`useRuntime=0`) — see C3.
- **PROTOTYPE.md §5** says "The visual reskin left the core wiring intact (both round-trip gates stay
  green)." True but easy to over-read: the gates only exercise the **3 wired screens** plus one
  Knowledge `content.create-item` dispatched _directly through the runtime in the test_, not through
  the Knowledge UI. Green gates ≠ a wired app.
- **PROTOTYPE.md §1** calls the app "a complete, functional prototype of the GM app." Accurate for
  _visual_ completeness; for _functional_ completeness it is 3/15 screens. The "Deferred" and "Known
  fidelity caveats" subsections are honest about individual pieces but the cumulative effect (most of
  the app is non-functional) isn't stated up front.

This document is intended to be the missing up-front statement.

---

## 9. Suggested remediation order

To get from "design prototype" to "usable tool," in dependency order:

1. **C1/C3 first** — wire `CommandCenter` to real Core queries and delete the mock seam, so the home
   reflects reality. This unlocks the coherent-campaign property everything else depends on.
2. **H2** — add `/board` to the IA and route sidebar scene rows to `/scene/:id` (cheap, big payoff:
   surfaces the working canvas).
3. **C2** — wire `Session` combat/dice/initiative/handouts to the Core command families (largest
   single effort; port from the Svelte GUI components named in §C2).
4. **M-series** — convert the browse-only screens (Characters, Knowledge, Atlas, Audio, Player) from
   `mockCampaign` reads to `useRuntime()` reads + dispatch, one screen at a time per the README's
   per-screen porting contract.
5. **H4/H5** — expose the runtime's existing view-as/preview and a real projection path in the
   AppShell.
6. **M1** — add a global Toaster so actions confirm.
7. **H3/H6** — build the ⌘K palette and the deferred modals/onboarding.
8. **L-series** — derive nav counts from state; code-split the bundle; type the mock/fixtures.

Each item is independently shippable and each gate (`typecheck:react`, `verify-roundtrip`,
`verify-canvas`) should stay green throughout.
