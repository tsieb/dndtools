# Icon Vocabulary

This document defines the canonical icon for every domain concept in the application.
All icons are sourced from [Lucide Icons](https://lucide.dev/) via the `@lucide/svelte` package
and rendered through `src/lib/ui/common/Icon.svelte`.

## Usage

```svelte
<script>
	import Icon from '$lib/ui/common/Icon.svelte';
</script>

<Icon name="search" size="md" />
```

**Props:**

| Prop          | Type                           | Default  | Description                                                  |
| ------------- | ------------------------------ | -------- | ------------------------------------------------------------ |
| `name`        | `IconName`                     | required | Canonical icon name from the vocabulary below                |
| `size`        | `'xs' \| 'sm' \| 'md' \| 'lg'` | `'md'`   | xs=12px, sm=16px, md=20px, lg=24px                           |
| `color`       | `string`                       | —        | CSS color value; inherits `currentColor` when omitted        |
| `strokeWidth` | `number`                       | `2`      | SVG stroke-width override                                    |
| `class`       | `string`                       | —        | Extra CSS classes forwarded to the SVG (e.g. `animate-spin`) |

All icons render with `aria-hidden="true"` by default. When an icon is the sole accessible
label for an interactive element, the parent must supply `aria-label`.

---

## Domain Icon Vocabulary

No two domain concepts share an icon. Every use of a domain concept in the application
must use the canonical icon name below.

### Knowledge & Notes

| Concept           | Icon name   | Lucide icon | Notes                                           |
| ----------------- | ----------- | ----------- | ----------------------------------------------- |
| note / document   | `file-text` | FileText    | Generic document, MCP changes indicator         |
| folder            | —           | —           | Folder tree uses text labels; no icon needed    |
| tag / hashtag     | —           | —           | Tag pills use text; no dedicated icon           |
| wikilink          | —           | —           | Rendered inline in markdown; no standalone icon |
| pin (pinned note) | `pin`       | Pin         | Used for pin action and pinned state indicator  |
| export / download | `download`  | Download    | Note export action                              |
| delete / trash    | `trash`     | Trash2      | Destructive delete action                       |

### Navigation & Browse

| Concept                 | Icon name       | Lucide icon  | Notes                                          |
| ----------------------- | --------------- | ------------ | ---------------------------------------------- |
| browse / list view      | `list`          | List         | Knowledge panel Browse tab                     |
| recent / history        | `clock`         | Clock        | Knowledge panel Recent tab                     |
| saved / pinned searches | `bookmark`      | Bookmark     | Knowledge panel Saved tab                      |
| search                  | `search`        | Search       | Search input adornment, command palette button |
| back                    | `chevron-left`  | ChevronLeft  | Back navigation                                |
| forward                 | `chevron-right` | ChevronRight | Forward navigation                             |
| sidebar / local panel   | `panel-left`    | PanelLeft    | Toggle local navigation panel                  |
| overflow / more actions | `ellipsis`      | Ellipsis     | Three-dot horizontal overflow menu             |
| hamburger / menu        | `menu`          | Menu         | Top-level sidebar toggle                       |

### Primary Sections

| Concept           | Icon name  | Lucide icon | Notes                    |
| ----------------- | ---------- | ----------- | ------------------------ |
| Knowledge section | `book`     | BookOpen    | Primary nav section icon |
| Atlas section     | `map`      | Map         | Primary nav section icon |
| Session section   | `hexagon`  | Hexagon     | Primary nav section icon |
| Campaign section  | `flag`     | Flag        | Primary nav section icon |
| Settings section  | `settings` | Settings    | Primary nav section icon |

### Status & Feedback

| Concept           | Icon name        | Lucide icon   | Notes                                 |
| ----------------- | ---------------- | ------------- | ------------------------------------- |
| warning / alert   | `triangle-alert` | TriangleAlert | Vault health badge, migration warning |
| success / check   | `check`          | Check         | Backup confirmation, success state    |
| loading / spinner | `loader`         | LoaderCircle  | Use with `class="animate-spin"`       |

### Actions (General)

| Concept          | Icon name | Lucide icon | Notes                                  |
| ---------------- | --------- | ----------- | -------------------------------------- |
| copy / duplicate | `copy`    | Copy        | Generic copy action                    |
| star / favourite | `star`    | Star        | Available for future favourite feature |

### Window Chrome (Desktop only)

These icons are used exclusively in the `DesktopTitlebar` component for OS window controls.
They are not part of the domain vocabulary and must not be used for other purposes.

| Control                   | Icon name | Lucide icon |
| ------------------------- | --------- | ----------- |
| Minimize window           | `minus`   | Minus       |
| Maximize / Restore window | `square`  | Square      |
| Close window              | `x`       | X           |

---

## Constraints

1. **Single source of truth** — All icons come from `@lucide/svelte` via the `Icon` component.
   No inline SVG markup in component files.
2. **Registered icons only** — The `Icon` component's lookup table (`ICON_MAP` in
   `src/lib/ui/common/Icon.svelte`) is the authoritative registry. Adding a new icon
   requires updating both this vocabulary document and `ICON_MAP`.
3. **No sharing** — Two distinct domain concepts must not use the same icon name.
4. **Bundle budget** — The icon subset must stay under 8KB gzipped. Check bundle size
   before adding new icons.
5. **Accessibility** — Icons are decorative by default (`aria-hidden="true"`). Interactive
   elements that contain only an icon must set `aria-label` on the parent element.
6. **Session dice exception** — Session die-face controls use dedicated SVG assets under
   `static/icons/dice/` to render labeled polyhedral faces (`d4` through `d100`).

---

## Adding a New Icon

1. Confirm the Lucide icon name at [lucide.dev/icons](https://lucide.dev/icons).
2. Add the import to `src/lib/ui/common/Icon.svelte` using the individual icon path:
   ```ts
   import NewIcon from '@lucide/svelte/icons/new-icon-name';
   ```
3. Add the entry to `ICON_MAP` in `Icon.svelte`.
4. Export the updated `IconName` type (union is derived automatically via `satisfies`).
5. Add the concept → icon mapping to this document.
