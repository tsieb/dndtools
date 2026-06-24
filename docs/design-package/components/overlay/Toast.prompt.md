Transient confirmation — the system's plain-state voice as a surface that speaks a fact and leaves ("Saved", "Projection queued", "Pushed to 3 players"). Never blocks the DM mid-session. Status maps to a distinct icon shape so severity reads in grayscale.

Mount the viewport once near the app root, then call `Toaster` from anywhere — no ref plumbing:

```jsx
// App root, once:
<ToastViewport placement="top-right" />

// Anywhere — event handlers, async callbacks:
Toaster.success('Saved');
Toaster.info('Projection queued', { message: 'Players see it when you reveal.' });
Toaster.error('Lost connection to 1 player', { action: 'Retry', onAction: reconnect });
Toaster.show({ status: 'success', title: 'Handout pushed', message: 'Visible to 3 players.' });
```

`success`/`info` auto-dismiss at 4.5s, `error` at 7s; pass `duration: 0` to keep until dismissed, or `duration` to tune. Placements: `top-right` (desktop default), `bottom-center` (mobile). For a persistent in-page banner or a blocking decision, use a `Badge`/inline alert or a `Dialog` instead — toasts are for fire-and-forget confirmations. The `Toast` row is exported on its own for static demos and bespoke placements.
