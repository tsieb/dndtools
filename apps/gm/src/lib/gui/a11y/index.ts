/**
 * Accessible interaction primitives (UX-A11Y-interaction-primitives-and-help-compliance) plus the
 * spatial / live-region / no-leak engines (UX-A11Y-spatial-live-region-and-leakage).
 *
 * One reusable implementation of each cross-surface a11y pattern — focus trap, roving tabindex,
 * keyboard matchers, drag alternatives, redundant-entry, colour-independent state, and the live
 * announcer — so surfaces consume these instead of re-implementing the ARIA wiring (UX-A11Y-012
 * "no bespoke implementations"). Svelte widget components (`Dialog`, `Tabs`, `Disclosure`,
 * `StateBadge`, `LiveRegion`, `SceneOutline`) live alongside and build on these utilities.
 *
 * The spatial/live-region/no-leak engines are the foundation later route/canvas/map/session epics
 * consume: the visibility BOUNDARY (`visibility-boundary` — the no-leak contract), the canvas keyboard
 * model (`canvas-keyboard`), the Scene Outline model (`scene-outline`), the map accessibility summary
 * (`map-summary`), and the graduated combat announcer (`combat-announcer`). Every one computes its
 * actor-facing ARIA output by filtering through the visibility boundary so DM-only content never
 * reaches a player/observer channel (UX-A11Y-008).
 */

export * from './focus-trap';
export * from './roving-tabindex';
export * from './keyboard';
export * from './drag-alternative';
export * from './redundant-entry';
export * from './state-indicator';
export * from './visibility-boundary';
export * from './canvas-keyboard';
export * from './scene-outline';
export * from './map-summary';
export * from './combat-announcer';
export { LiveAnnouncer, provideLiveAnnouncer, useLiveAnnouncer, type Politeness } from './live-announcer.svelte';
