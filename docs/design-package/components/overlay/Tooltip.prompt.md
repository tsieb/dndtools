Small label-on-hover/focus that names an icon-only control or adds a terse hint. Opens on hover and keyboard focus, closes on leave/blur/Escape. Never the only place information lives, and never holds interactive content.

```jsx
<Tooltip label="Push handout to players">
  <IconButton icon="send" label="Push handout" />
</Tooltip>

<Tooltip label="Reveal area to players" placement="bottom">
  <IconButton icon="reveal" label="Reveal" />
</Tooltip>
```

Wrap a single focusable child (it forwards `aria-describedby`). Pair with an icon-only control's own `label` — the tooltip reinforces, it isn't the accessible name. Keep copy to a few words; for a fuller explanation use a `Popover`. Placements: `top` (default), `bottom`, `left`, `right`.
