Crafted action button — use for any clickable action; reserve `primary` (gold) for the single most important action in a region, `secondary` for everything else, `ghost` for low-emphasis/toolbar actions, `danger` for destructive confirms.

```jsx
<Button variant="primary" icon="add">New note</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost" icon="more" aria-label="More" />
<Button variant="danger" icon="close">End session</Button>
```

Sizes: `sm` (dense toolbars), `md` (default), `lg` (hero CTAs). Leading/trailing icons via `icon` / `iconRight` (semantic Icon names). Min height follows the active `--density-button-height` token (44px on touch profiles).
