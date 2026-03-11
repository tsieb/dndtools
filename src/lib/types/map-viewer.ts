export type MapViewerMode =
	| 'view'
	| 'poi_edit'
	| 'fog_paint'
	| 'route_edit'
	| 'grid_align'
	| 'combat'
	| 'layer_manage';

export interface MapViewerModeDefinition {
	id: Exclude<MapViewerMode, 'view'>;
	label: string;
	hint: string;
	shortcut: string;
	icon: 'pin' | 'eye-off' | 'map' | 'square' | 'hexagon' | 'list';
}

export const MAP_VIEWER_MODES: readonly MapViewerModeDefinition[] = [
	{
		id: 'poi_edit',
		label: 'POI Edit',
		hint: 'Click the map to place a point of interest.',
		shortcut: 'P',
		icon: 'pin',
	},
	{
		id: 'fog_paint',
		label: 'Fog Paint',
		hint: 'Paint reveal and re-fog regions on the map.',
		shortcut: 'F',
		icon: 'eye-off',
	},
	{
		id: 'route_edit',
		label: 'Route Edit',
		hint: 'Click to place route waypoints and build travel paths.',
		shortcut: 'R',
		icon: 'map',
	},
	{
		id: 'grid_align',
		label: 'Grid Align',
		hint: 'Drag grid handles to align and size map cells.',
		shortcut: 'G',
		icon: 'square',
	},
	{
		id: 'combat',
		label: 'Combat',
		hint: 'Place tokens, inspect ranges, and position templates.',
		shortcut: 'C',
		icon: 'hexagon',
	},
	{
		id: 'layer_manage',
		label: 'Layer Manage',
		hint: 'Organize map layers and player visibility settings.',
		shortcut: 'L',
		icon: 'list',
	},
] as const;

export function isMapViewerMode(value: string): value is MapViewerMode {
	return value === 'view' || MAP_VIEWER_MODES.some((mode) => mode.id === value);
}

export function mapViewerModeLabel(mode: MapViewerMode): string {
	if (mode === 'view') return 'View';
	return MAP_VIEWER_MODES.find((entry) => entry.id === mode)?.label ?? 'View';
}

export function mapViewerModeHint(mode: MapViewerMode): string {
	if (mode === 'view') return 'Navigate the map and inspect points of interest.';
	return (
		MAP_VIEWER_MODES.find((entry) => entry.id === mode)?.hint ??
		'Navigate the map and inspect points of interest.'
	);
}

export function mapViewerModeShortcut(mode: MapViewerMode): string {
	if (mode === 'view') return 'V';
	return MAP_VIEWER_MODES.find((entry) => entry.id === mode)?.shortcut ?? 'V';
}
