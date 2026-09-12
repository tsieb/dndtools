# Supporting primitives

Import these components from `apps/gm-react/src/ds`. All accept children and style overrides;
colors, typography and spacing use the shared semantic tokens. Each has a colocated `.test.tsx`
in the app. The JSX references in this package mirror the app implementations.

| Component | Contract and example | Production screen |
| --- | --- | --- |
| `ListItem` (core) | Row shell inside `ul`/`ol`; the `li` always keeps its listitem role. `selected` paints emphasis. `interactive` renders a native `type="button"` toggle inside the item: `selected` becomes `aria-pressed`, Enter/Space and focus are native, `disabled` disables the button, and `onSelect`/`onClick` fire on activation. The children are the button's accessible name, so use text or inline content only; keep nested controls in noninteractive rows. `<ListItem interactive selected={on} onSelect={toggle}>Row</ListItem>` | ScenesCreator, existing scene rows |
| `TagInput` (forms) | Controlled `value: string[]`, `onChange(tags)`. Enter/comma or blur commits draft; case-insensitive deduplication, optional `maxTags`, empty-draft Backspace and labeled remove buttons. Forward `id`/`aria-label` to the input. `<TagInput value={tags} onChange={setTags} />` | ScenesCreator, create and edit tags |
| `RadioCard` (core) | `value`, `checked`, `disabled`, `onChange(value)`, optional `heading` and `icon`. Use inside a labeled radiogroup with `radioGroupKeyDown` from screen-kit for arrow navigation. Selected card is the tab stop; set `tabIndex={0}` on the first option if none is selected. `<RadioCard value="none" checked={selected} onChange={choose}>…</RadioCard>` | Settings Tools and Experience |
| `Kbd` (core) | Semantic keyboard notation; `tone="neutral"` or `"accent"`. `<Kbd>Ctrl+K</Kbd>` | Settings Accessibility, registered shortcuts |
| `Menu` (core) | Popover wrapper with a labeled inner `role="menu"`; children provide `role="menuitem"` on action buttons. Popover handles opening focus, Escape, outside pointer dismissal and focus return. ArrowUp/Down, Home/End navigate enabled items. The enclosing popover header and close button remain outside the menu. Pass `title`, `onClose`, `triggerRef`, and positioning props. | Board, layout issue selection |
| `Toolbar` (core) | Labeled command row (`ariaLabel`), wrapping layout, optional `dense`/`gap`. Left/Right/Home/End move between enabled commands; native Tab order remains available and editable inputs retain their arrow keys. `<Toolbar ariaLabel="Actions">…</Toolbar>` | Board, layout commands |
| `Callout` (core) | In-flow information with icon, optional title and `info`, `success`, `warning`, `error` tones. Default `role="note"`; use `role="alert"` for a newly reported error. `<Callout tone="error" role="alert">{error}</Callout>` | Board, rejected layout writes |
| `Figure` (data) | Semantic `figure`/`figcaption`; provide `src` and meaningful `alt` for an image, or children for an illustration. Optional `align`, `imgStyle`, `caption`. | ScenesCreator, empty scene illustration |
| `Stepper` (core) | Ordered progress with one `aria-current="step"`. String or `{label}` steps; zero-based `current` clamps to available steps. `orientation`, `size`, `showLines`, `ariaLabel` customize presentation. No navigation behavior. `<Stepper steps={steps} current={step} />` | Extensions SystemBuilder; map import wizard |
| `HelpTip` (core) | Compact in-flow `role="note"` guidance with icon, optional `title`, `info`/`success`/`warning` tone. `<HelpTip>…</HelpTip>` | Settings Tools, usage guidance |
| `FeatureSpotlight` (core) | Named complementary section with `title`, `description`, optional `icon`, children and `actionLabel`/`onAction`. The action renders only when both label and handler exist. | Settings Plugins, link to Extensions |

Screen integrations retain existing translated copy and runtime commands. The primitives do not
introduce storage, onboarding state or new command behavior.
