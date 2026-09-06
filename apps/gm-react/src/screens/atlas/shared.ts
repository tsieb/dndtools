import { type MapLayerQueryEntry, type MapView, type MapViewResult } from '@dndtools/core';

/* The Atlas rails' shared types + the one shared button style. Extracted from Atlas.tsx
 * (RC-STB-2.6) so each rail panel can live in its own file. */

export type { MapLayerQueryEntry, MapView, MapViewResult };

// `padding: 2` around a 12–14px icon made every one of these a ~16px target, under the 24px WCAG
// 2.5.8 minimum. That matters most for the vertically ADJACENT layer-reorder chevrons, where a
// mis-tap does not merely miss — it dispatches the OPPOSITE durable `map.reorder-layer` command.
export const ghostBtn = {
	border: 'none',
	background: 'transparent',
	cursor: 'pointer',
	padding: 2,
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	minWidth: 24,
	minHeight: 24,
} as const;
