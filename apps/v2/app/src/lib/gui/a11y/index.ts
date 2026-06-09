/**
 * Accessible interaction primitives (UX-A11Y-interaction-primitives-and-help-compliance).
 *
 * One reusable implementation of each cross-surface a11y pattern — focus trap, roving tabindex,
 * keyboard matchers, drag alternatives, redundant-entry, colour-independent state, and the live
 * announcer — so surfaces consume these instead of re-implementing the ARIA wiring (UX-A11Y-012
 * "no bespoke implementations"). Svelte widget components (`Dialog`, `Tabs`, `Disclosure`,
 * `StateBadge`, `LiveRegion`) live alongside and build on these utilities.
 */

export * from './focus-trap';
export * from './roving-tabindex';
export * from './keyboard';
export * from './drag-alternative';
export * from './redundant-entry';
export * from './state-indicator';
export { LiveAnnouncer, provideLiveAnnouncer, useLiveAnnouncer, type Politeness } from './live-announcer.svelte';
