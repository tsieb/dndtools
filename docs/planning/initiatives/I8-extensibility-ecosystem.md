# Initiative 8 — Extensibility & Ecosystem

## Status: NOT STARTED

**Outcome:** DND Tools is a platform, not just an application. Campaign systems,
content types, and integrations are modular. A plugin author can add a new object type,
a toolbar action, or a content source without modifying core code. The community can
share and discover extensions.

---

## Epic 8.1 — Plugin Architecture & Sandbox

**Goal:** Plugins extend the app with new capabilities without compromising security or
stability. Each plugin declares what it needs and is sandboxed to what it declared.

**Stories:**

- **S8.1.1 — Plugin manifest schema and capability declaration**
  Define `plugin.manifest.json`: id, name, version, author, entryPoint, and capabilities
  list (`object_types`, `toolbar_actions`, `render_hooks`, `command_contributions`,
  `mcp_tools`). Capabilities are enumerated, not open-ended. The manifest is validated
  on install against a JSON Schema.

- **S8.1.2 — Plugin sandbox via Web Worker + Comlink**
  Execute plugin code in a dedicated Web Worker. Expose a restricted plugin API via
  Comlink: `vault.read(noteId)`, `vault.search(query)`, `editor.insertSnippet(text)`,
  `ui.registerCommand(def)`, `objects.register(typeDef)`. Vault writes require the
  `write_access` capability and route through the staged MCP write model.

- **S8.1.3 — Plugin registry UI (install, configure, disable)**
  Add Settings → Plugins: list of installed plugins with name, version, author,
  capability badges, and enable/disable/remove controls. Plugin install accepts a
  folder path (local development) or a future registry URL. Plugin settings panels are
  rendered from plugin-declared configuration schemas.

- **S8.1.4 — Plugin lifecycle hooks**
  Support hooks: `onNoteCreate(note)`, `onNoteSave(note, diff)`, `onRender(content)` →
  transformed content, `onExport(notes)` → modified export. Hooks are async and
  time-limited (5s timeout with graceful skip). Multiple plugins can register the
  same hook; execution order is deterministic (install order).

- **S8.1.5 — Plugin developer SDK and example plugin**
  Publish a `@dndtools/plugin-sdk` package with TypeScript types for the plugin API,
  a CLI scaffold command (`pnpm create dndtools-plugin`), and an example plugin
  demonstrating object type registration, toolbar action, and render hook. Document
  in `docs/PLUGIN_SDK.md`.

---

## Epic 8.2 — Campaign System Modules

**Goal:** The D&D 5e object types, condition lists, and CR tables are one campaign
system module among many. Swapping systems is a vault setting, not a code change.

**Stories:**

- **S8.2.1 — Campaign system module interface**
  Define a `CampaignSystemModule` interface: `id`, `name`, `objectSchemas` (map of
  type → Zod schema), `conditionsList`, `challengeRatingTable`, `defaultTemplates`,
  and `displayNames`. Modules are loaded at vault open from `settings.json` or from a
  plugin.

- **S8.2.2 — D&D 5e as first campaign system module**
  Refactor the current hardcoded 5e assumptions (condition list, CR table, stat block
  fields, character class names) into a `systems/dnd5e.ts` module. All code that reads
  system-specific data must go through the `CampaignSystemModule` interface.

- **S8.2.3 — Generic / narrative system module**
  Add a minimal `systems/generic.ts` for system-agnostic campaigns: no stat blocks,
  no CR, simple character sheets with freeform fields. This is the fallback for
  non-mechanical or narrative-first campaigns.

- **S8.2.4 — Campaign system selector in vault settings**
  Add Settings → Vault → Campaign System: a dropdown of available modules (built-in +
  plugin-provided). Switching systems migrates existing objects to the new schema with
  a dry-run preview. The current system is stored in `.vault/settings.json`.

---

## Epic 8.3 — Custom Object Types & Schema Registry

**Goal:** Users can define their own object types for campaign-specific entities (e.g.,
"Ship", "Deity", "Faction Treaty") without writing code.

**Stories:**

- **S8.3.1 — Custom object type definition UI**
  Add Settings → Object Types → New Type. Users define: type name, icon, fields (each
  with name, label, type, required/optional). Field types: text, number, boolean,
  tag-list, note-reference, relationship. The definition is saved to `.vault/object-
types.json`.

- **S8.3.2 — JSON Schema-backed field definitions**
  Custom type definitions compile to JSON Schema for runtime validation. The structured
  editor renders custom types using a generic form renderer driven by the schema. MCP
  tools accept custom objects and validate them against their schema before writing.

- **S8.3.3 — Schema registry for sharing custom types**
  Users can export their custom type definitions as a shareable `.dndtools-types.json`
  file. Another user imports the file to add those types to their vault. The registry
  also supports publishing to a future community type directory.

---

## Epic 8.4 — External Compendium Integrations

**Goal:** DMs can pull monster stats, spells, items, and lore directly from external
sources into their vault without copy-pasting.

**Stories:**

- **S8.4.1 — Open5e API integration**
  Add a compendium search panel (accessible via command palette: `> compendium`)
  querying the public Open5e API for monsters, spells, items, and conditions. Results
  can be imported as vault objects (stat_block for monsters, item for equipment) or as
  plain notes. Import is offline-safe: imported content is stored locally.

- **S8.4.2 — Compendium import-to-object workflow**
  Importing a compendium entry: maps API fields to vault object schema, shows a preview
  of the object that will be created, and offers field-by-field editing before saving.
  Import creates the object and a linked note. Subsequent imports of the same entry
  offer a "re-sync" option to update the local object.

- **S8.4.3 — Extension interface for additional compendium sources**
  Define a `CompendiumSource` plugin interface: `search(query)`, `get(id)`,
  `mapToVaultObject(entry)`. Any plugin can register a compendium source. The built-in
  Open5e integration is itself implemented as a `CompendiumSource`. Document the
  interface in `docs/PLUGIN_SDK.md` under "Compendium Sources".

---

## Epic 8.5 — Theme & Design System

**Goal:** The visual design system is token-complete, customizable, and documented.
Users can choose from curated themes and power users can override any token.

**Stories:**

- **S8.5.1 — Consolidated design token system**
  Audit and consolidate all CSS custom properties in `src/app.css` into a semantic
  token hierarchy: color roles (surface, content, accent, danger), spacing scale,
  typography scale, border radius scale, shadow scale. No component references a raw
  value — everything goes through tokens.

- **S8.5.2 — Built-in theme pack**
  Ship 4 built-in themes: Default Dark (current), Default Light, Parchment (warm sepia
  reading-oriented), and High Contrast (WCAG AAA for accessibility). Theme selection
  is in Settings → Appearance. Themes are implemented as CSS custom property overrides.

- **S8.5.3 — User-defined theme tokens**
  Add a Settings → Appearance → Custom Theme panel where users override any token
  value via a key/value editor with live preview. Custom theme is stored in
  `settings.json`. Provide an "Export theme" / "Import theme" JSON function for
  sharing.

- **S8.5.4 — Layout density and typography options**
  Add: layout density (compact / comfortable / spacious) controlling spacing scale
  multiplier; font family selector (System UI / Serif / Monospace / Custom); and base
  font size control. These are stored in settings and applied as root CSS variable
  overrides. Critical for mobile where spacious layout wastes precious vertical space.

---

## Epic 8.6 — Developer API, Webhooks & External Tool Integration

**Goal:** Third-party tools, automation scripts, and community integrations can
subscribe to vault events and interact with vault data through a documented, versioned
API — without requiring a full plugin installation.

**Stories:**

- **S8.6.1 — Local REST API for vault operations**
  When running in desktop mode, expose an opt-in local REST API on a configurable
  localhost port. Endpoints mirror the MCP tool surface: `GET /notes`, `POST /notes`,
  `PUT /notes/{id}`, `GET /search`, `GET /objects`, etc. API is versioned (`/v1/`).
  Auth uses a locally-generated API key stored in settings. Document the full API in
  `docs/API.md`. This enables power-user scripts, Alfred/Raycast integrations, and
  community tools.

- **S8.6.2 — Webhook event subscriptions**
  Add a webhook system that fires HTTP POST callbacks on vault events: `note.created`,
  `note.updated`, `note.deleted`, `object.created`, `session.started`, `mcp.approved`.
  Webhook endpoints are configured in Settings → Integrations → Webhooks. Each
  webhook fires with a signed payload (HMAC-SHA256 using the API key). Add retry with
  exponential backoff for failed deliveries. Webhook delivery log is browsable in
  Settings.

- **S8.6.3 — Zapier / Make / n8n integration template**
  Publish a Zapier integration (or Make module) with triggers and actions built on
  the webhook and REST API. Provide starter templates for common automations: "new
  session note → send Discord message", "new NPC object → add to Notion tracker",
  "session start → start Google Meet". Document these integrations in
  `docs/INTEGRATIONS.md`.

- **S8.6.4 — CLI companion tool**
  Build a `dndtools` CLI (`npm install -g @dndtools/cli`) wrapping the local REST API.
  Commands: `dndtools note list`, `dndtools note create --template <name>`,
  `dndtools search "<query>"`, `dndtools export --format zip`. The CLI enables
  scripting and automation from the terminal. CI-friendly: exits with correct codes,
  outputs JSON by default with `--pretty` flag. Publish to npm with docs.

---

## Epic 8.7 — Internationalization & Localization Platform

**Goal:** All user-facing strings are externalized, the app ships in at minimum 5
languages, and the localization pipeline enables community contributions. The global
TTRPG community should not be gated behind English.

**Stories:**

- **S8.7.1 — String externalization and i18n framework integration**
  Adopt `@inlang/paraglide-js` (or equivalent Svelte-native i18n library). Extract
  all hardcoded user-facing strings across `src/` into message files under
  `src/lib/i18n/messages/`. Enforce no hardcoded strings via a lint rule. Add CI
  check that new strings have message keys. Launch with English as the only locale
  but with full extraction complete.

- **S8.7.2 — Locale-aware formatting for dates, numbers, and units**
  Wrap all `Date` formatting, number display (HP numbers, CR fractions, distances),
  and unit labels (feet/meters toggle) in locale-aware formatter functions from
  `Intl.NumberFormat` and `Intl.DateTimeFormat`. All in-world calendar dates use
  the custom formatter from I3.E7. No raw `toLocaleDateString()` calls outside
  designated formatter modules.

- **S8.7.3 — RTL layout compatibility**
  Add RTL layout support for Arabic, Hebrew, and other RTL locales. CSS uses logical
  properties (`margin-inline-start` not `margin-left`) throughout. Test RTL layout
  in all primary routes using Chrome's RTL emulation flag. The graph view, board
  layout, and editor toolbar adapt correctly. Add an RTL smoke test to the
  accessibility E2E suite.

- **S8.7.4 — Community translation workflow**
  Set up a Weblate (or Crowdin) project for community-contributed translations.
  Add a language selector to Settings → Appearance. Priority locales: Spanish,
  French, German, Brazilian Portuguese, Japanese. Each locale ships when it reaches
  90% string coverage. Add a locale status badge in the Settings language selector
  showing translation completeness for each language.

---

---
