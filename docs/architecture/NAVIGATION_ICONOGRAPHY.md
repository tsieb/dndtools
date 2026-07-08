# Navigation Iconography

The navigation section icons are part of the single icon vocabulary and are drawn through the same
`Icon` component as every other glyph.

- **Canonical icon reference:** [`../reference/ICON_VOCABULARY.md`](../reference/ICON_VOCABULARY.md)
- **Icon component + registry:** `apps/gm-react/src/ds/components/core/Icon.jsx` (Lucide via
  `lucide-react`)
- **Navigation source of truth (which icon each section uses):** `apps/gm-react/src/app/nav.ts`

Each nav entry in `nav.ts` carries an `icon` semantic name (e.g. `home`, `session-bolt`,
`characters-person`, `atlas-map`, `campaign-scroll`, `knowledge-book`, `settings-gear`) which resolves
to a distinct Lucide glyph through `ICON_REGISTRY`. Section icons are mutually exclusive — no two
sections share a glyph. See [NAVIGATION_CONTRACT.md](NAVIGATION_CONTRACT.md) for the navigation model.
