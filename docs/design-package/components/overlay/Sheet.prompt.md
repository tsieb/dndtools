Edge-anchored overlay — the touch-first sibling of Dialog. `bottom` is the mobile default (a grab-handle slab that rises from the foot); `right`/`left` are tablet/desktop drawers for filters, an inspector, or a wizard. Same trap/dismiss/scroll-lock contract as Dialog.

```jsx
const [open, setOpen] = React.useState(false);

// Mobile: same form as a desktop Dialog, but as a bottom sheet
<Sheet open={open} onClose={() => setOpen(false)} side="bottom" title="Push handout"
  footer={<Button variant="primary" style={{ flex: 1 }} onClick={push}>Push to players</Button>}>
  <HandoutPicker />
</Sheet>

// Desktop secondary flow as a right drawer
<Sheet open={importing} onClose={() => setImporting(false)} side="right" size={520}
  title="Import map" description="Nothing is written until you commit.">
  <ImportWizard onCancel={() => setImporting(false)} />
</Sheet>
```

Pick `bottom` for the comfortable/touch density, `right`/`left` for desktop side panels. `dismissible={false}` for forced choices. For a small centered confirm on desktop, use `Dialog` instead.
