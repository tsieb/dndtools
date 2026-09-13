# Component reference

<!-- Generated from the galleryRegistry shared by DsGallery.tsx and scripts/check-prod-bundle.mjs. Do not edit by hand. -->

Run `node scripts/check-prod-bundle.mjs --write-docs` to regenerate; use `--check-docs` to verify coverage and drift.

Start `pnpm dev` and open `http://localhost:5273/#/__ds`. The gallery is DEV-only: both the lazy import and route use `import.meta.env.DEV`. Production build verification rejects the route, gallery chunk and gallery marker.

Choose a component, example and any combination of variant/state controls. Theme (tavern, parchment, high-contrast) and density (comfortable, compact) apply to the specimen and overlays. They are temporary and restore on exit. Hover, press and Tab through real controls for pointer and focus states; open overlays to check Escape and focus return. Reset example restores its selected fixture. Actions use synthetic local state.

Scope: every public component in `src/ds/index.d.ts`; helper functions and constants are not components. Icon names and default condition names are additionally selectable from their live registries. Example props below are merged with the selected axes and example overrides; event handlers and semantic wrappers are supplied by the gallery renderer.

## NpcCard

A character summary with disposition and visibility.

[Source](../../apps/gm-react/src/ds/components/campaign/NpcCard.jsx)

### Variants and states

| Prop          | Values                                              |
| ------------- | --------------------------------------------------- |
| `disposition` | `"friendly"`, `"neutral"`, `"hostile"`, `"unknown"` |
| `dmOnly`      | `false`, `true`                                     |

### Base props

```json
{
	"name": "Mira Vale",
	"role": "Lantern keeper",
	"location": "Coast",
	"hook": "Needs a map.",
	"tags": ["Contact"]
}
```

### Examples

- **Default**: Base props.

## QuestCard

A quest with completed and pending objectives.

[Source](../../apps/gm-react/src/ds/components/campaign/QuestCard.jsx)

### Variants and states

| Prop     | Values                                            |
| -------- | ------------------------------------------------- |
| `status` | `"active"`, `"completed"`, `"failed"`, `"onhold"` |
| `dmOnly` | `false`, `true`                                   |

### Base props

```json
{
	"title": "Find the lantern",
	"hook": "Follow the coastal path.",
	"objectives": [
		{
			"label": "Find the map",
			"done": true
		},
		{
			"label": "Reach the tower",
			"done": false
		}
	],
	"reward": "A safe harbour"
}
```

### Examples

- **Default**: Base props.
- **Empty objectives**: `{"objectives":[]}`

## SessionTimeline

A chronological log with active and completed beats.

[Source](../../apps/gm-react/src/ds/components/campaign/SessionTimeline.jsx)

### Variants and states

Use the examples and native interactions below.

### Base props

```json
{
	"entries": [
		{
			"time": "18:00",
			"title": "Arrival",
			"detail": "The party reaches the coast.",
			"tone": "default",
			"active": true
		},
		{
			"time": "18:00",
			"title": "Arrival",
			"detail": "The party reaches the coast.",
			"tone": "accent",
			"active": false
		},
		{
			"time": "18:00",
			"title": "Arrival",
			"detail": "The party reaches the coast.",
			"tone": "success",
			"active": false
		},
		{
			"time": "18:00",
			"title": "Arrival",
			"detail": "The party reaches the coast.",
			"tone": "warning",
			"active": false
		},
		{
			"time": "18:00",
			"title": "Arrival",
			"detail": "The party reaches the coast.",
			"tone": "error",
			"active": false
		},
		{
			"time": "18:00",
			"title": "Arrival",
			"detail": "The party reaches the coast.",
			"tone": "info",
			"active": false
		}
	]
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"entries":[]}`

## CommandPalette

Search, empty results, disabled commands and keyboard selection.

[Source](../../apps/gm-react/src/ds/components/command/CommandPalette.jsx)

### Variants and states

| Prop         | Values          |
| ------------ | --------------- |
| `showFooter` | `false`, `true` |

### Base props

```json
{
	"commands": [
		{
			"id": "scene",
			"label": "Open example scene",
			"group": "Destinations",
			"icon": "scene"
		},
		{
			"id": "locked",
			"label": "Unavailable example",
			"disabled": true,
			"group": "Actions"
		}
	],
	"recentIds": ["scene"]
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"commands":[]}`

## ConditionBadge

A named condition with optional duration, level and removal.

[Source](../../apps/gm-react/src/ds/components/condition/ConditionBadge.jsx)

### Variants and states

| Prop       | Values                                                   |
| ---------- | -------------------------------------------------------- |
| `tone`     | `"danger"`, `"warning"`, `"good"`, `"info"`, `"neutral"` |
| `compact`  | `false`, `true`                                          |
| `duration` | `null`, `3`                                              |
| `level`    | `null`, `2`                                              |

### Base props

```json
{
	"condition": "prone"
}
```

### Examples

- **Default**: Base props.
- **Without removal**: `{"onRemove":null}`

## ConditionTracker

An empty or populated condition list with an add action.

[Source](../../apps/gm-react/src/ds/components/condition/ConditionTracker.jsx)

### Variants and states

| Prop      | Values          |
| --------- | --------------- |
| `compact` | `false`, `true` |
| `addable` | `false`, `true` |

### Base props

```json
{
	"entries": [
		{
			"key": "prone",
			"duration": 3
		},
		{
			"key": "blessed"
		}
	]
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"entries":[]}`

## SystemProvider

Condition vocabulary supplied by an active game system.

[Source](../../apps/gm-react/src/ds/components/condition/SystemProvider.jsx)

### Variants and states

Use the examples and native interactions below.

### Base props

```json
{
	"conditions": [
		{
			"key": "inspired",
			"label": "Inspired",
			"severity": "boon"
		}
	]
}
```

### Examples

- **Default**: Base props.
- **Empty catalog**: `{"conditions":[]}`
- **Default catalog**: `{"conditions":null}`

## Avatar

Initials or a portrait with a status ring.

[Source](../../apps/gm-react/src/ds/components/core/Avatar.jsx)

### Variants and states

| Prop   | Values                                   |
| ------ | ---------------------------------------- |
| `size` | `"sm"`, `"md"`, `"lg"`, `"xl"`           |
| `ring` | `null`, `"active"`, `"turn"`, `"danger"` |

### Base props

```json
{
	"name": "Mira Vale"
}
```

### Examples

- **Default**: Base props.
- **Unnamed**: `{"name":""}`
- **Image**: `{"src":"/icon.svg"}`

## BrandMark

Lamplight mark, decorative or named.

[Source](../../apps/gm-react/src/ds/components/core/Brand.jsx)

### Variants and states

| Prop    | Values                |
| ------- | --------------------- |
| `size`  | `24`, `30`, `48`      |
| `title` | `null`, `"Lamplight"` |

### Base props

```json
{}
```

### Examples

- **Default**: Base props.

## BrandWordmark

Lamplight wordmark.

[Source](../../apps/gm-react/src/ds/components/core/Brand.jsx)

### Variants and states

| Prop   | Values           |
| ------ | ---------------- |
| `size` | `15`, `24`, `32` |

### Base props

```json
{}
```

### Examples

- **Default**: Base props.

## BrandLockup

Combined mark and wordmark.

[Source](../../apps/gm-react/src/ds/components/core/Brand.jsx)

### Variants and states

Use the examples and native interactions below.

### Base props

```json
{}
```

### Examples

- **Default**: Base props.
- **Large**: `{"markSize":48,"wordSize":24}`

## Breadcrumb

Nested navigation with optional collapsed ancestors.

[Source](../../apps/gm-react/src/ds/components/core/Breadcrumb.jsx)

### Variants and states

| Prop         | Values           |
| ------------ | ---------------- |
| `maxVisible` | `null`, `2`, `3` |

### Base props

```json
{
	"items": [
		{
			"id": "0",
			"label": "World"
		},
		{
			"id": "1",
			"label": "Coast"
		},
		{
			"id": "2",
			"label": "Town"
		},
		{
			"id": "3",
			"label": "Inn"
		}
	]
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"items":[]}`
- **Unavailable ancestor**: `{"items":[{"id":"world","label":"World","unavailable":true},{"id":"inn","label":"Inn"}]}`

## Button

An action with native or focusable disabled states.

[Source](../../apps/gm-react/src/ds/components/core/Button.jsx)

### Variants and states

| Prop            | Values                                                        |
| --------------- | ------------------------------------------------------------- |
| `variant`       | `"primary"`, `"secondary"`, `"ghost"`, `"danger"`, `"accent"` |
| `size`          | `"sm"`, `"md"`, `"lg"`                                        |
| `disabled`      | `false`, `true`                                               |
| `aria-disabled` | `false`, `true`                                               |
| `icon`          | `null`, `"check"`                                             |
| `iconRight`     | `null`, `"chevron-right"`                                     |

### Base props

```json
{
	"children": "Save example"
}
```

### Examples

- **Default**: Base props.

## Callout

Contextual feedback with a semantic status tone.

[Source](../../apps/gm-react/src/ds/components/core/Callout.jsx)

### Variants and states

| Prop   | Values                                        |
| ------ | --------------------------------------------- |
| `tone` | `"success"`, `"warning"`, `"error"`, `"info"` |

### Base props

```json
{
	"title": "Example notice",
	"children": "Your example is ready."
}
```

### Examples

- **Default**: Base props.

## Card

A surface container with optional interactive treatment.

[Source](../../apps/gm-react/src/ds/components/core/Card.jsx)

### Variants and states

| Prop          | Values                                        |
| ------------- | --------------------------------------------- |
| `elevation`   | `"sunken"`, `"flat"`, `"raised"`, `"overlay"` |
| `padding`     | `"none"`, `"sm"`, `"md"`, `"lg"`              |
| `accent`      | `false`, `true`                               |
| `interactive` | `false`, `true`                               |

### Base props

```json
{
	"children": "A quiet place to prepare the next scene."
}
```

### Examples

- **Default**: Base props.

## CardHeader

A panel title with optional actions.

[Source](../../apps/gm-react/src/ds/components/core/Card.jsx)

### Variants and states

| Prop      | Values          |
| --------- | --------------- |
| `eyebrow` | `false`, `true` |

### Base props

```json
{
	"title": "Scene notes"
}
```

### Examples

- **Default**: Base props.

## FeatureSpotlight

An introduction with optional action and supporting content.

[Source](../../apps/gm-react/src/ds/components/core/FeatureSpotlight.jsx)

### Variants and states

| Prop   | Values                 |
| ------ | ---------------------- |
| `icon` | `"sparkles"`, `"info"` |

### Base props

```json
{
	"title": "Try scene notes",
	"description": "Keep a detail close at hand.",
	"actionLabel": "Try example"
}
```

### Examples

- **Default**: Base props.
- **Without action**: `{"actionLabel":null}`

## HelpTip

Short supporting guidance.

[Source](../../apps/gm-react/src/ds/components/core/HelpTip.jsx)

### Variants and states

| Prop   | Values                             |
| ------ | ---------------------------------- |
| `tone` | `"info"`, `"success"`, `"warning"` |

### Base props

```json
{
	"title": "Tip",
	"children": "Use the keyboard to move between controls."
}
```

### Examples

- **Default**: Base props.

## Icon

The complete shipped icon vocabulary; choose a name below.

[Source](../../apps/gm-react/src/ds/components/core/Icon.jsx)

### Variants and states

| Prop    | Values                                    |
| ------- | ----------------------------------------- |
| `size`  | `"micro"`, `"sm"`, `"md"`, `"lg"`, `"xl"` |
| `label` | `null`, `"Example icon"`                  |

### Base props

```json
{
	"name": "check",
	"label": "Example icon"
}
```

### Examples

- **Default**: Base props.

## IconButton

An icon action with an accessible label.

[Source](../../apps/gm-react/src/ds/components/core/IconButton.jsx)

### Variants and states

| Prop            | Values                             |
| --------------- | ---------------------------------- |
| `variant`       | `"ghost"`, `"outline"`, `"accent"` |
| `size`          | `"sm"`, `"md"`, `"lg"`             |
| `disabled`      | `false`, `true`                    |
| `aria-disabled` | `false`, `true`                    |

### Base props

```json
{
	"icon": "edit",
	"label": "Edit example"
}
```

### Examples

- **Default**: Base props.

## Kbd

A keyboard shortcut token.

[Source](../../apps/gm-react/src/ds/components/core/Kbd.jsx)

### Variants and states

| Prop   | Values                  |
| ------ | ----------------------- |
| `tone` | `"neutral"`, `"accent"` |

### Base props

```json
{
	"children": "Ctrl K"
}
```

### Examples

- **Default**: Base props.

## ListItem

A semantic list row; interactive rows use a native toggle.

[Source](../../apps/gm-react/src/ds/components/core/ListItem.jsx)

### Variants and states

| Prop          | Values          |
| ------------- | --------------- |
| `selected`    | `false`, `true` |
| `interactive` | `false`, `true` |
| `disabled`    | `false`, `true` |

### Base props

```json
{
	"children": "Lantern room"
}
```

### Examples

- **Default**: Base props.

## Menu

An in-flow menu; use arrow keys, Home and End.

[Source](../../apps/gm-react/src/ds/components/core/Menu.jsx)

### Variants and states

| Prop   | Values          |
| ------ | --------------- |
| `open` | `false`, `true` |

### Base props

```json
{
	"title": "Scene actions"
}
```

### Examples

- **Default**: Base props.

## Popover

Open the example to inspect focus, dismissal and focus return.

[Source](../../apps/gm-react/src/ds/components/core/Popover.jsx)

### Variants and states

| Prop        | Values                          |
| ----------- | ------------------------------- |
| `placement` | `"top"`, `"bottom"`, `"center"` |

### Base props

```json
{
	"title": "Example details",
	"description": "Review this local example.",
	"children": "Example content. No vault data is changed."
}
```

### Examples

- **Default**: Base props.
- **Anchored**: `{"anchor":{"x":160,"y":160}}`

## RadioCard

A radio choice with a heading and supporting text.

[Source](../../apps/gm-react/src/ds/components/core/RadioCard.jsx)

### Variants and states

| Prop       | Values            |
| ---------- | ----------------- |
| `checked`  | `false`, `true`   |
| `disabled` | `false`, `true`   |
| `icon`     | `null`, `"check"` |

### Base props

```json
{
	"value": "room",
	"heading": "Lantern room",
	"children": "A small room for a quiet conversation."
}
```

### Examples

- **Default**: Base props.

## Stepper

Completed, active and upcoming steps.

[Source](../../apps/gm-react/src/ds/components/core/Stepper.jsx)

### Variants and states

| Prop          | Values                       |
| ------------- | ---------------------------- |
| `current`     | `0`, `1`, `2`, `3`           |
| `size`        | `"sm"`, `"md"`, `"lg"`       |
| `orientation` | `"horizontal"`, `"vertical"` |
| `showLines`   | `false`, `true`              |

### Base props

```json
{
	"steps": ["Choose", "Preview", "Confirm"]
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"steps":[]}`

## Tabs

Keyboard selectable tabs with a corresponding panel.

[Source](../../apps/gm-react/src/ds/components/core/Tabs.jsx)

### Variants and states

Use the examples and native interactions below.

### Base props

```json
{
	"tabs": [
		{
			"id": "scenes",
			"label": "Scenes",
			"icon": "scene"
		},
		{
			"id": "notes",
			"label": "Notes",
			"icon": "note"
		}
	],
	"value": "scenes"
}
```

### Examples

- **Default**: Base props.
- **Disabled tab**: `{"tabs":[{"id":"scenes","label":"Scenes","icon":"scene"},{"id":"notes","label":"Notes","icon":"note"},{"id":"locked","label":"Unavailable","disabled":true}]}`
- **Empty**: `{"tabs":[]}`

## Toolbar

A group of related actions with roving keyboard focus.

[Source](../../apps/gm-react/src/ds/components/core/Toolbar.jsx)

### Variants and states

| Prop    | Values          |
| ------- | --------------- |
| `dense` | `false`, `true` |

### Base props

```json
{}
```

### Examples

- **Default**: Base props.

## AbilityScore

An ability score and its derived modifier.

[Source](../../apps/gm-react/src/ds/components/creature/AbilityScore.jsx)

### Variants and states

| Prop    | Values                  |
| ------- | ----------------------- |
| `size`  | `"sm"`, `"md"`, `"lg"`  |
| `tone`  | `"default"`, `"accent"` |
| `score` | `8`, `10`, `14`         |

### Base props

```json
{
	"label": "STR",
	"score": 14
}
```

### Examples

- **Default**: Base props.
- **Explicit modifier**: `{"modifier":"+4"}`

## StatBlock

A creature reference, including optional live health and extra actions.

[Source](../../apps/gm-react/src/ds/components/creature/StatBlock.jsx)

### Variants and states

| Prop     | Values          |
| -------- | --------------- |
| `dmOnly` | `false`, `true` |

### Base props

```json
{
	"name": "Lantern keeper",
	"meta": "Medium humanoid",
	"ac": 14,
	"hp": 20,
	"speed": "30 ft.",
	"abilities": {
		"str": 12,
		"dex": 14,
		"con": 12,
		"int": 10,
		"wis": 14,
		"cha": 12
	},
	"traits": [
		{
			"name": "Watchful",
			"text": "Keeps an eye on the door."
		}
	],
	"actions": [
		{
			"name": "Staff",
			"text": "A simple melee attack."
		}
	]
}
```

### Examples

- **Default**: Base props.
- **Live**: `{"live":{"current":12,"max":20,"conditions":["prone"]}}`
- **All sections**: `{"bonusActions":[{"name":"Step","text":"Move aside."}],"reactions":[{"name":"Guard","text":"Raise a shield."}],"legendaryActions":[{"name":"Observe","text":"Look around."}],"legendaryIntro":"One action per round."}`

## DataTable

A populated or empty table with sorting and density controls.

[Source](../../apps/gm-react/src/ds/components/data/DataTable.jsx)

### Variants and states

| Prop    | Values                                                              |
| ------- | ------------------------------------------------------------------- |
| `dense` | `false`, `true`                                                     |
| `zebra` | `false`, `true`                                                     |
| `sort`  | `null`, `{"key":"name","dir":"asc"}`, `{"key":"name","dir":"desc"}` |

### Base props

```json
{
	"columns": [
		{
			"key": "name",
			"header": "Name",
			"sortable": true
		},
		{
			"key": "count",
			"header": "Count",
			"mono": true,
			"align": "right"
		}
	],
	"rows": [
		{
			"name": "Lantern",
			"count": 3
		},
		{
			"name": "Map",
			"count": 1
		}
	],
	"ariaLabel": "Example supplies"
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"rows":[]}`

## DefinitionList

Label and value pairs.

[Source](../../apps/gm-react/src/ds/components/data/DefinitionList.jsx)

### Variants and states

| Prop     | Values                |
| -------- | --------------------- |
| `layout` | `"rows"`, `"stacked"` |

### Base props

```json
{
	"items": [
		{
			"label": "Place",
			"value": "Lantern room"
		},
		{
			"label": "Guests",
			"value": 3
		}
	]
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"items":[]}`

## Figure

An image or custom figure with a caption.

[Source](../../apps/gm-react/src/ds/components/data/Figure.jsx)

### Variants and states

| Prop    | Values                          |
| ------- | ------------------------------- |
| `align` | `"left"`, `"center"`, `"right"` |

### Base props

```json
{
	"alt": "Lamplight mark",
	"caption": "An example figure.",
	"src": "/icon.svg"
}
```

### Examples

- **Default**: Base props.
- **Custom content**: `{"src":null,"children":"Map preview"}`

## Stat

A metric with signed trend and optional unit.

[Source](../../apps/gm-react/src/ds/components/data/Stat.jsx)

### Variants and states

| Prop     | Values                  |
| -------- | ----------------------- |
| `tone`   | `"default"`, `"accent"` |
| `delta`  | `null`, `-3`, `0`, `3`  |
| `invert` | `false`, `true`         |
| `icon`   | `null`, `"check"`       |

### Base props

```json
{
	"label": "Supplies",
	"value": 24,
	"unit": "items",
	"deltaLabel": "since last session"
}
```

### Examples

- **Default**: Base props.

## DiceResult

Roll readouts for every supported resolution model.

[Source](../../apps/gm-react/src/ds/components/domain/DiceResult.jsx)

### Variants and states

| Prop   | Values                        |
| ------ | ----------------------------- |
| `crit` | `null`, `"success"`, `"fail"` |

### Base props

```json
{
	"total": 17,
	"rolls": [14],
	"modifier": 3
}
```

### Examples

- **Default**: Base props.
- **Dice pool**: `{"model":"dice-pool","notation":"2d6","dice":[{"sides":6,"value":6,"success":true},{"sides":6,"value":2,"success":false}],"successes":1,"successThreshold":5}`
- **Strong hit**: `{"model":"2d6-pbta","total":10,"rolls":[6,4],"modifier":0,"tier":"strong"}`
- **Partial hit**: `{"model":"2d6-pbta","total":8,"rolls":[4,4],"modifier":0,"tier":"partial"}`
- **Miss**: `{"model":"2d6-pbta","total":4,"rolls":[2,2],"modifier":0,"tier":"miss"}`
- **Custom**: `{"model":"custom"}`

## HPBar

Health at full, wounded, critical and zero values.

[Source](../../apps/gm-react/src/ds/components/domain/HPBar.jsx)

### Variants and states

| Prop       | Values                 |
| ---------- | ---------------------- |
| `current`  | `20`, `12`, `4`, `0`   |
| `size`     | `"sm"`, `"md"`, `"lg"` |
| `showText` | `false`, `true`        |

### Base props

```json
{
	"max": 20,
	"label": "Health"
}
```

### Examples

- **Default**: Base props.

## InitiativeRow

A turn row with health, conditions and action economy.

[Source](../../apps/gm-react/src/ds/components/domain/InitiativeRow.jsx)

### Variants and states

| Prop          | Values                                                |
| ------------- | ----------------------------------------------------- |
| `active`      | `false`, `true`                                       |
| `dmOnly`      | `false`, `true`                                       |
| `turnModel`   | `"initiative"`, `"popcorn"`, `"side-based"`, `"none"` |
| `actionsUsed` | `0`, `1`, `3`                                         |

### Base props

```json
{
	"name": "Mira",
	"initiative": 17,
	"current": 12,
	"max": 20,
	"conditions": ["prone"],
	"actionsPerTurn": 3
}
```

### Examples

- **Default**: Base props.

## StatPill

A compact statistic.

[Source](../../apps/gm-react/src/ds/components/domain/StatPill.jsx)

### Variants and states

| Prop    | Values                                                       |
| ------- | ------------------------------------------------------------ |
| `tone`  | `"default"`, `"accent"`, `"success"`, `"warning"`, `"error"` |
| `mono`  | `false`, `true`                                              |
| `align` | `"left"`, `"center"`                                         |

### Base props

```json
{
	"label": "AC",
	"value": 16
}
```

### Examples

- **Default**: Base props.

## Badge

A short status label.

[Source](../../apps/gm-react/src/ds/components/feedback/Badge.jsx)

### Variants and states

| Prop     | Values                                                                 |
| -------- | ---------------------------------------------------------------------- |
| `status` | `"success"`, `"warning"`, `"error"`, `"info"`, `"accent"`, `"neutral"` |
| `icon`   | `null`, `"check"`                                                      |

### Base props

```json
{
	"children": "Example status"
}
```

### Examples

- **Default**: Base props.

## Chip

A tag, selected filter or removable token.

[Source](../../apps/gm-react/src/ds/components/feedback/Chip.jsx)

### Variants and states

| Prop       | Values                                        |
| ---------- | --------------------------------------------- |
| `tone`     | `"neutral"`, `"accent"`, `"danger"`, `"info"` |
| `selected` | `false`, `true`                               |
| `icon`     | `null`, `"tag"`                               |

### Base props

```json
{
	"children": "Lantern"
}
```

### Examples

- **Default**: Base props.
- **Static**: `{"onRemove":null,"onClick":null}`
- **Removable**: `{"onClick":null}`

## StatusDot

A reinforcing status cue with a visible label.

[Source](../../apps/gm-react/src/ds/components/feedback/StatusDot.jsx)

### Variants and states

| Prop     | Values                                                               |
| -------- | -------------------------------------------------------------------- |
| `status` | `"live"`, `"idle"`, `"warning"`, `"error"`, `"syncing"`, `"pending"` |
| `pulse`  | `false`, `true`                                                      |

### Base props

```json
{
	"label": "Connection status"
}
```

### Examples

- **Default**: Base props.

## VisibilityChip

Safety labels for private and player-visible content.

[Source](../../apps/gm-react/src/ds/components/feedback/VisibilityChip.jsx)

### Variants and states

| Prop      | Values                                                                          |
| --------- | ------------------------------------------------------------------------------- |
| `level`   | `"dm-only"`, `"players"`, `"hidden"`, `"mixed"`, `"player-visible"`, `"shared"` |
| `compact` | `false`, `true`                                                                 |

### Base props

```json
{}
```

### Examples

- **Default**: Base props.

## Checkbox

A labelled binary control.

[Source](../../apps/gm-react/src/ds/components/forms/Checkbox.jsx)

### Variants and states

| Prop       | Values          |
| ---------- | --------------- |
| `checked`  | `false`, `true` |
| `disabled` | `false`, `true` |

### Base props

```json
{
	"label": "Enable example"
}
```

### Examples

- **Default**: Base props.

## Field

A label, control, help and validation message.

[Source](../../apps/gm-react/src/ds/components/forms/Field.jsx)

### Variants and states

| Prop       | Values                          |
| ---------- | ------------------------------- |
| `required` | `false`, `true`                 |
| `error`    | `null`, `"Enter a scene name."` |

### Base props

```json
{
	"label": "Scene name",
	"help": "Choose a memorable name."
}
```

### Examples

- **Default**: Base props.

## Input

A labelled form control with validation and unavailable states.

[Source](../../apps/gm-react/src/ds/components/forms/Input.jsx)

### Variants and states

| Prop       | Values             |
| ---------- | ------------------ |
| `invalid`  | `false`, `true`    |
| `disabled` | `false`, `true`    |
| `readOnly` | `false`, `true`    |
| `icon`     | `null`, `"search"` |

### Base props

```json
{
	"aria-label": "Example Input",
	"placeholder": "Enter a scene name"
}
```

### Examples

- **Default**: Base props.
- **Filled**: `{"defaultValue":"Lantern room"}`

## Textarea

A labelled form control with validation and unavailable states.

[Source](../../apps/gm-react/src/ds/components/forms/Input.jsx)

### Variants and states

| Prop       | Values          |
| ---------- | --------------- |
| `invalid`  | `false`, `true` |
| `disabled` | `false`, `true` |
| `readOnly` | `false`, `true` |

### Base props

```json
{
	"aria-label": "Example Textarea",
	"placeholder": "Enter a scene name"
}
```

### Examples

- **Default**: Base props.
- **Filled**: `{"defaultValue":"Lantern room"}`

## SegmentedControl

A compact single-choice group.

[Source](../../apps/gm-react/src/ds/components/forms/SegmentedControl.jsx)

### Variants and states

| Prop        | Values          |
| ----------- | --------------- |
| `size`      | `"sm"`, `"md"`  |
| `fullWidth` | `false`, `true` |

### Base props

```json
{
	"options": [
		{
			"value": "scenes",
			"label": "Scenes"
		},
		{
			"value": "notes",
			"label": "Notes"
		},
		{
			"value": "locked",
			"label": "Unavailable",
			"disabled": true
		}
	],
	"value": "scenes",
	"ariaLabel": "Example view"
}
```

### Examples

- **Default**: Base props.

## Select

A labelled form control with validation and unavailable states.

[Source](../../apps/gm-react/src/ds/components/forms/Select.jsx)

### Variants and states

| Prop       | Values          |
| ---------- | --------------- |
| `invalid`  | `false`, `true` |
| `disabled` | `false`, `true` |

### Base props

```json
{
	"aria-label": "Example Select",
	"options": [
		{
			"value": "scenes",
			"label": "Scenes"
		},
		{
			"value": "notes",
			"label": "Notes"
		},
		{
			"value": "locked",
			"label": "Unavailable",
			"disabled": true
		}
	],
	"defaultValue": "scenes"
}
```

### Examples

- **Default**: Base props.
- **Filled**: `{"defaultValue":"scenes"}`

## Slider

A bounded numeric control with optional steppers and stops.

[Source](../../apps/gm-react/src/ds/components/forms/Slider.jsx)

### Variants and states

| Prop       | Values                     |
| ---------- | -------------------------- |
| `steppers` | `false`, `true`            |
| `disabled` | `false`, `true`            |
| `stops`    | `null`, `[0,25,50,75,100]` |
| `value`    | `0`, `40`, `100`           |

### Base props

```json
{
	"label": "Example volume",
	"value": 40
}
```

### Examples

- **Default**: Base props.

## Switch

A labelled binary control.

[Source](../../apps/gm-react/src/ds/components/forms/Switch.jsx)

### Variants and states

| Prop       | Values          |
| ---------- | --------------- |
| `checked`  | `false`, `true` |
| `disabled` | `false`, `true` |

### Base props

```json
{
	"label": "Enable example"
}
```

### Examples

- **Default**: Base props.

## TagInput

Add and remove tags with keyboard or pointer.

[Source](../../apps/gm-react/src/ds/components/forms/TagInput.jsx)

### Variants and states

| Prop       | Values          |
| ---------- | --------------- |
| `disabled` | `false`, `true` |
| `maxTags`  | `2`, `5`        |

### Base props

```json
{
	"value": ["Lantern", "Coast"],
	"aria-label": "Example tags"
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"value":[]}`

## FogControls

Fog modes, shapes, feathering and synchronization feedback.

[Source](../../apps/gm-react/src/ds/components/map/FogControls.jsx)

### Variants and states

| Prop         | Values                                        |
| ------------ | --------------------------------------------- |
| `mode`       | `"reveal"`, `"conceal"`                       |
| `shape`      | `"brush"`, `"rect"`, `"polygon"`              |
| `feather`    | `false`, `true`                               |
| `syncStatus` | `"synced"`, `"syncing"`, `"queued"`, `"idle"` |

### Base props

```json
{}
```

### Examples

- **Default**: Base props.

## GenerationPanel

Map generation configuration, progress and review.

[Source](../../apps/gm-react/src/ds/components/map/GenerationPanel.jsx)

### Variants and states

| Prop       | Values                   |
| ---------- | ------------------------ |
| `progress` | `null`, `0`, `50`, `100` |

### Base props

```json
{}
```

### Examples

- **Default**: Base props.

## ImportWizard

Interactive selection, preview and completion of a sample import.

[Source](../../apps/gm-react/src/ds/components/map/ImportWizard.jsx)

### Variants and states

Use the examples and native interactions below.

### Base props

```json
{}
```

### Examples

- **Default**: Base props.
- **Preview**: `{"step":1}`
- **Complete**: `{"step":2}`

## LayerPanel

An editable or read-only stack of map layers.

[Source](../../apps/gm-react/src/ds/components/map/LayerPanel.jsx)

### Variants and states

| Prop       | Values          |
| ---------- | --------------- |
| `readOnly` | `false`, `true` |

### Base props

```json
{
	"layers": [
		{
			"id": "coast",
			"name": "Coast",
			"type": "base",
			"visibility": "dm-only",
			"opacity": 100
		},
		{
			"id": "notes",
			"name": "Notes",
			"type": "dm",
			"visibility": "dm-only",
			"opacity": 100
		}
	]
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"layers":[]}`

## LayerRow

Layer display, visibility, opacity, lock, selection and rename controls.

[Source](../../apps/gm-react/src/ds/components/map/LayerRow.jsx)

### Variants and states

| Prop       | Values          |
| ---------- | --------------- |
| `readOnly` | `false`, `true` |
| `dimmed`   | `false`, `true` |
| `selected` | `false`, `true` |

### Base props

```json
{
	"layer": {
		"id": "coast",
		"name": "Coast",
		"type": "base",
		"visibility": "dm-only",
		"opacity": 100
	}
}
```

### Examples

- **Default**: Base props.
- **Player visible**: `{"layer":{"id":"coast","name":"Coast","type":"base","visibility":"players","opacity":100}}`
- **Shared**: `{"layer":{"id":"coast","name":"Coast","type":"base","visibility":"shared","opacity":100}}`
- **Hidden and locked**: `{"layer":{"id":"coast","name":"Coast","type":"base","visibility":"dm-only","opacity":40,"dmDisplay":false,"locked":true}}`

## LayerTypeBadge

Every shipped layer category.

[Source](../../apps/gm-react/src/ds/components/map/LayerTypeBadge.jsx)

### Variants and states

| Prop       | Values                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`     | `"base"`, `"height"`, `"political"`, `"climate"`, `"roads"`, `"water"`, `"wshed"`, `"fog"`, `"poi"`, `"dm"`, `"player"`, `"combat"`, `"custom"` |
| `showIcon` | `false`, `true`                                                                                                                                 |
| `compact`  | `false`, `true`                                                                                                                                 |

### Base props

```json
{}
```

### Examples

- **Default**: Base props.

## MapCreationForm

A local map form with validation and submitting state.

[Source](../../apps/gm-react/src/ds/components/map/MapCreationForm.jsx)

### Variants and states

| Prop         | Values          |
| ------------ | --------------- |
| `submitting` | `false`, `true` |

### Base props

```json
{}
```

### Examples

- **Default**: Base props.

## Minimap

A collapsible viewport preview with click-to-jump.

[Source](../../apps/gm-react/src/ds/components/map/Minimap.jsx)

### Variants and states

Use the examples and native interactions below.

### Base props

```json
{}
```

### Examples

- **Default**: Base props.
- **Collapsed**: `{"defaultCollapsed":true}`

## POIMarker

Point-of-interest categories, active state and DM-only cue.

[Source](../../apps/gm-react/src/ds/components/map/POIMarker.jsx)

### Variants and states

| Prop       | Values                                                               |
| ---------- | -------------------------------------------------------------------- |
| `category` | `"location"`, `"quest"`, `"danger"`, `"npc"`, `"treasure"`, `"note"` |
| `active`   | `false`, `true`                                                      |
| `dmOnly`   | `false`, `true`                                                      |

### Base props

```json
{
	"label": "Lantern tower"
}
```

### Examples

- **Default**: Base props.

## POIPopover

Point-of-interest details and visibility actions.

[Source](../../apps/gm-react/src/ds/components/map/POIPopover.jsx)

### Variants and states

| Prop       | Values          |
| ---------- | --------------- |
| `readOnly` | `false`, `true` |

### Base props

```json
{
	"poi": {
		"name": "Lantern tower",
		"category": "location",
		"visibility": "dm-only",
		"notePreview": "A light on the coast."
	}
}
```

### Examples

- **Default**: Base props.

## ToolPalette

Map tools with orientation, history and overflow states.

[Source](../../apps/gm-react/src/ds/components/map/ToolPalette.jsx)

### Variants and states

| Prop          | Values                       |
| ------------- | ---------------------------- |
| `orientation` | `"vertical"`, `"horizontal"` |
| `canUndo`     | `false`, `true`              |
| `canRedo`     | `false`, `true`              |
| `overflow`    | `false`, `true`              |

### Base props

```json
{
	"active": "select"
}
```

### Examples

- **Default**: Base props.

## BottomTabBar

Navigation with an active destination.

[Source](../../apps/gm-react/src/ds/components/navigation/BottomTabBar.jsx)

### Variants and states

| Prop     | Values                |
| -------- | --------------------- |
| `active` | `"scenes"`, `"notes"` |

### Base props

```json
{
	"items": [
		{
			"label": "Scenes",
			"icon": "scene",
			"key": "scenes"
		},
		{
			"label": "Notes",
			"icon": "note",
			"key": "notes"
		}
	],
	"active": "scenes"
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"items":[]}`

## NavItem

An expanded or collapsed navigation action.

[Source](../../apps/gm-react/src/ds/components/navigation/NavItem.jsx)

### Variants and states

| Prop        | Values          |
| ----------- | --------------- |
| `active`    | `false`, `true` |
| `collapsed` | `false`, `true` |
| `badge`     | `null`, `3`     |

### Base props

```json
{
	"icon": "scene",
	"label": "Scenes"
}
```

### Examples

- **Default**: Base props.
- **Link**: `{"as":"a","href":"#/__ds"}`

## NavRail

Navigation with an active destination.

[Source](../../apps/gm-react/src/ds/components/navigation/NavRail.jsx)

### Variants and states

| Prop     | Values                |
| -------- | --------------------- |
| `active` | `"scenes"`, `"notes"` |

### Base props

```json
{
	"items": [
		{
			"label": "Scenes",
			"icon": "scene",
			"key": "scenes"
		},
		{
			"label": "Notes",
			"icon": "note",
			"key": "notes"
		}
	],
	"active": "scenes"
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"items":[]}`

## NavSidebar

Navigation with an active destination.

[Source](../../apps/gm-react/src/ds/components/navigation/NavSidebar.jsx)

### Variants and states

| Prop     | Values                |
| -------- | --------------------- |
| `active` | `"scenes"`, `"notes"` |

### Base props

```json
{
	"items": [
		{
			"label": "Scenes",
			"icon": "scene",
			"key": "scenes"
		},
		{
			"label": "Notes",
			"icon": "note",
			"key": "notes"
		}
	],
	"active": "scenes"
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"items":[]}`

## Dialog

Open the example to inspect focus, dismissal and focus return.

[Source](../../apps/gm-react/src/ds/components/overlay/Dialog.jsx)

### Variants and states

| Prop                  | Values                                                      |
| --------------------- | ----------------------------------------------------------- |
| `dismissible`         | `true`, `false`                                             |
| `size`                | `"sm"`, `"md"`, `"lg"`                                      |
| `tone`                | `"default"`, `"danger"`, `"warning"`, `"success"`, `"info"` |
| `backdropDismissible` | `false`, `true`                                             |

### Base props

```json
{
	"title": "Example details",
	"description": "Review this local example.",
	"children": "Example content. No vault data is changed."
}
```

### Examples

- **Default**: Base props.

## Sheet

Open the example to inspect focus, dismissal and focus return.

[Source](../../apps/gm-react/src/ds/components/overlay/Sheet.jsx)

### Variants and states

| Prop          | Values                          |
| ------------- | ------------------------------- |
| `dismissible` | `true`, `false`                 |
| `side`        | `"bottom"`, `"left"`, `"right"` |

### Base props

```json
{
	"title": "Example details",
	"description": "Review this local example.",
	"children": "Example content. No vault data is changed."
}
```

### Examples

- **Default**: Base props.

## Toast

Dismissible feedback with an optional action.

[Source](../../apps/gm-react/src/ds/components/overlay/Toast.jsx)

### Variants and states

| Prop     | Values                                        |
| -------- | --------------------------------------------- |
| `status` | `"success"`, `"warning"`, `"error"`, `"info"` |
| `live`   | `false`, `true`                               |

### Base props

```json
{
	"title": "Example saved",
	"message": "Your local example is ready.",
	"action": "Undo"
}
```

### Examples

- **Default**: Base props.

## ToastViewport

A live toast queue with hover/focus pause and dismissal.

[Source](../../apps/gm-react/src/ds/components/overlay/Toast.jsx)

### Variants and states

| Prop        | Values                                                             |
| ----------- | ------------------------------------------------------------------ |
| `placement` | `"top-right"`, `"top-center"`, `"bottom-right"`, `"bottom-center"` |

### Base props

```json
{}
```

### Examples

- **Default**: Base props.

## Tooltip

Hover or focus the trigger to inspect the tooltip.

[Source](../../apps/gm-react/src/ds/components/overlay/Tooltip.jsx)

### Variants and states

| Prop        | Values                                   |
| ----------- | ---------------------------------------- |
| `placement` | `"top"`, `"bottom"`, `"left"`, `"right"` |
| `delay`     | `0`, `250`                               |

### Base props

```json
{
	"label": "More about this example"
}
```

### Examples

- **Default**: Base props.

## SpellCard

A spell reference with school, level, ritual and concentration.

[Source](../../apps/gm-react/src/ds/components/spell/SpellCard.jsx)

### Variants and states

| Prop            | Values                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `level`         | `0`, `1`, `3`                                                                                                                    |
| `school`        | `"abjuration"`, `"conjuration"`, `"divination"`, `"enchantment"`, `"evocation"`, `"illusion"`, `"necromancy"`, `"transmutation"` |
| `concentration` | `false`, `true`                                                                                                                  |
| `ritual`        | `false`, `true`                                                                                                                  |

### Base props

```json
{
	"name": "Lantern light",
	"castingTime": "1 action",
	"range": "Touch",
	"components": "V, S",
	"duration": "1 hour",
	"description": "A small light illuminates the way."
}
```

### Examples

- **Default**: Base props.
- **Higher levels**: `{"higherLevels":"The light lasts longer."}`

## SpellSlots

Available and spent spell resources with a read-only view.

[Source](../../apps/gm-react/src/ds/components/spell/SpellSlots.jsx)

### Variants and states

| Prop       | Values          |
| ---------- | --------------- |
| `readOnly` | `false`, `true` |

### Base props

```json
{
	"levels": [
		{
			"level": 1,
			"total": 4,
			"used": 2
		},
		{
			"level": 2,
			"total": 2,
			"used": 2
		}
	]
}
```

### Examples

- **Default**: Base props.
- **Empty**: `{"levels":[]}`

## EmptyState

An empty surface with explanation and optional action.

[Source](../../apps/gm-react/src/ds/components/system/EmptyState.jsx)

### Variants and states

| Prop    | Values          |
| ------- | --------------- |
| `inset` | `false`, `true` |

### Base props

```json
{
	"title": "No scenes yet",
	"description": "Create a scene to begin."
}
```

### Examples

- **Default**: Base props.

## ProgressMeter

Determinate or indeterminate progress, with markers.

[Source](../../apps/gm-react/src/ds/components/system/ProgressMeter.jsx)

### Variants and states

| Prop            | Values                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| `tone`          | `"success"`, `"warning"`, `"error"`, `"info"`, `"accent"`, `"neutral"` |
| `size`          | `"sm"`, `"md"`, `"lg"`                                                 |
| `indeterminate` | `false`, `true`                                                        |
| `value`         | `0`, `40`, `100`                                                       |
| `markers`       | `[]`, `[25,50,75]`                                                     |

### Base props

```json
{
	"value": 40,
	"label": "Example progress"
}
```

### Examples

- **Default**: Base props.

## Skeleton

Loading placeholders for text, avatars and panels.

[Source](../../apps/gm-react/src/ds/components/system/Skeleton.jsx)

### Variants and states

| Prop      | Values                         |
| --------- | ------------------------------ |
| `variant` | `"rect"`, `"text"`, `"circle"` |
| `lines`   | `1`, `3`                       |

### Base props

```json
{
	"width": "100%",
	"height": "var(--space-8)"
}
```

### Examples

- **Default**: Base props.

## SystemPackageCard

Game-system choice with active, current and compact states.

[Source](../../apps/gm-react/src/ds/components/system/SystemPackageCard.jsx)

### Variants and states

| Prop      | Values                                  |
| --------- | --------------------------------------- |
| `tier`    | `"official"`, `"community"`, `"custom"` |
| `active`  | `false`, `true`                         |
| `current` | `false`, `true`                         |
| `compact` | `false`, `true`                         |

### Base props

```json
{
	"name": "Example system",
	"summary": "A local rules vocabulary.",
	"chips": [
		{
			"label": "Fantasy"
		},
		{
			"label": "Dice"
		}
	]
}
```

### Examples

- **Default**: Base props.
