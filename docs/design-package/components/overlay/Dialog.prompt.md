Modal chrome — a scrim plus one centered panel — for confirms and short forms. It is the chrome the system delegates to ("drop it inside a Dialog (desktop) or sheet (mobile)" — MapCreationForm, ImportWizard); you supply the body. Focus traps on open, Escape/backdrop dismiss, body scroll locks, focus returns on close.

```jsx
const [open, setOpen] = React.useState(false);

// Short form
<Dialog open={open} onClose={() => setOpen(false)} title="New map"
  description="Name it and choose who can see it."
  footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
           <Button variant="primary" onClick={save}>Create map</Button></>}>
  <MapCreationForm onCreate={save} />
</Dialog>

// Destructive confirm — forced choice, no stray dismiss
<Dialog open={ending} onClose={() => setEnding(false)} tone="danger" dismissible={false}
  title="End session?" description="Players are dropped back to the lobby. This can't be undone."
  footer={<><Button variant="ghost" onClick={() => setEnding(false)}>Keep running</Button>
           <Button variant="danger" icon="close" onClick={end}>End session</Button></>}>
  Three players are connected.
</Dialog>
```

Sizes: `sm` 400 (confirms) · `md` 540 (default) · `lg` 760 (rich forms). Reserve `dismissible={false}` for destructive confirms only. On touch/mobile, prefer `Sheet` for the same content. Tones (`danger`/`warning`/`success`/`info`) set the header mark + accent; the icon shape carries severity in grayscale.
