import type { ActorId, SceneId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import { actorCanAuthorScene } from '../permissions/grants';
import {
	isWidgetLibraryListed,
	resolveWidgetConfig,
	widgetSupportsSurface,
	type PlatformProfileId,
	type WidgetBindingDefinition,
	type WidgetDefinition,
	type WidgetPackageRecord,
	type WidgetPackageState,
	type WidgetSurface,
} from '../state/widget-package-state';

/**
 * Quick-access widget library for the Command Center (CMD-005).
 *
 * The Processing Core owns which widget types exist, what bindings they require,
 * and whether they can run on the active platform profile. The GUI renders the
 * returned entries and dispatches the resolved `scene.add-widget` command; it never
 * decides availability or invents layout coordinates itself (Contract 1).
 */

/** A binding requirement surfaced to the DM as part of a library preview. */
export interface WidgetLibraryBinding {
	id: string;
	label: string;
	entityTypes: string[];
	mode: WidgetBindingDefinition['mode'];
	requiredCapability: WidgetBindingDefinition['requiredCapability'];
}

export type WidgetLibraryAvailability =
	| { available: true }
	| { available: false; reason: string };

export interface WidgetLibraryEntry {
	type: string;
	version: string;
	displayName: string;
	author: string;
	category?: string;
	description?: string;
	icon?: string;
	packageId: string;
	packageDisplayName: string;
	supportedProfiles: PlatformProfileId[];
	defaultSize: { width: number; height: number };
	minSize: { width: number; height: number };
	requiredBindings: WidgetLibraryBinding[];
	optionalBindings: WidgetLibraryBinding[];
	/** The widget's `configField` defaults, seeded into a freshly-placed instance. */
	defaultConfiguration: Record<string, unknown>;
	availability: WidgetLibraryAvailability;
}

export interface WidgetLibraryQuery {
	/** The active platform profile; decides per-widget profile support (CMD-005 AC2). */
	profileId: PlatformProfileId;
	/** Case-insensitive substring filter over name, type, and binding labels. */
	filter?: string;
	/** When false, profile-/package-unavailable entries are omitted. Default true. */
	includeUnavailable?: boolean;
}

/** Default canvas position a library/palette add drops a new widget at. */
export const DEFAULT_LIBRARY_WIDGET_POSITION = Object.freeze({ x: 24, y: 24 });

function toLibraryBinding(definition: WidgetBindingDefinition): WidgetLibraryBinding {
	return {
		id: definition.id,
		label: definition.label,
		entityTypes: [...definition.entityTypes],
		mode: definition.mode,
		requiredCapability: definition.requiredCapability,
	};
}

function profileLabel(profileId: PlatformProfileId): string {
	switch (profileId) {
		case 'desktop':
			return 'desktop';
		case 'tablet':
			return 'tablet';
		case 'mobile':
			return 'mobile';
		case 'web':
			return 'web';
	}
}

function availabilityFor(
	record: WidgetPackageRecord,
	definition: WidgetDefinition,
	profileId: PlatformProfileId,
): WidgetLibraryAvailability {
	if (!record.enabled) {
		return {
			available: false,
			reason: `The ${record.package.displayName} package is disabled.`,
		};
	}
	if (!definition.supportedProfiles.includes(profileId)) {
		return {
			available: false,
			reason: `Not available on the ${profileLabel(profileId)} profile.`,
		};
	}
	return { available: true };
}

function matchesFilter(entry: WidgetLibraryEntry, needle: string): boolean {
	if (!needle) return true;
	const haystack = [
		entry.type,
		entry.displayName,
		entry.packageDisplayName,
		...entry.requiredBindings.flatMap((b) => [b.label, ...b.entityTypes]),
		...entry.optionalBindings.flatMap((b) => [b.label, ...b.entityTypes]),
	]
		.join(' ')
		.toLowerCase();
	return haystack.includes(needle);
}

/**
 * List the widget types the DM can add to the Command Center, filtered and
 * profile-evaluated. Returns an empty list for any actor who cannot author Scenes,
 * so the library fails closed for players/observers (CMD-005 is DM-only).
 */
export function listWidgetLibrary(
	widgets: WidgetPackageState,
	permission: PermissionState,
	actorId: ActorId,
	query: WidgetLibraryQuery,
): WidgetLibraryEntry[] {
	const actor = permission.actors[actorId];
	if (!actorCanAuthorScene(actor)) return [];

	const includeUnavailable = query.includeUnavailable ?? true;
	const needle = (query.filter ?? '').trim().toLowerCase();

	const entries: WidgetLibraryEntry[] = [];
	for (const record of Object.values(widgets.packages)) {
		// A removed package's widgets are gone — they are never addable, so they do
		// not appear in the library at all (rather than as an unavailable row).
		if (record.removedAt) continue;
		for (const definition of record.package.widgets) {
			// Only scene-surface, library-listed widgets are addable to a scene. Command Center
			// widgets (surface 'command-center', libraryListed:false) never appear here (CMD-005).
			if (!widgetSupportsSurface(definition, 'scene') || !isWidgetLibraryListed(definition)) {
				continue;
			}
			const entry: WidgetLibraryEntry = {
				type: definition.type,
				version: definition.version,
				displayName: definition.displayName,
				author: definition.author,
				category: definition.category,
				description: definition.description,
				icon: definition.icon,
				packageId: record.package.id,
				packageDisplayName: record.package.displayName,
				supportedProfiles: [...definition.supportedProfiles],
				defaultSize: { ...definition.defaultSize },
				minSize: { ...definition.minSize },
				requiredBindings: definition.requiredBindings.map(toLibraryBinding),
				optionalBindings: definition.optionalBindings.map(toLibraryBinding),
				defaultConfiguration: resolveWidgetConfig(definition, {}),
				availability: availabilityFor(record, definition, query.profileId),
			};
			if (!includeUnavailable && !entry.availability.available) continue;
			if (!matchesFilter(entry, needle)) continue;
			entries.push(entry);
		}
	}

	entries.sort(
		(a, b) => a.displayName.localeCompare(b.displayName) || a.type.localeCompare(b.type),
	);
	return entries;
}

export interface ResolvedAddWidgetCommand {
	type: 'scene.add-widget';
	payload: {
		sceneId: SceneId;
		widget: {
			type: string;
			version: string;
			layout: { x: number; y: number; w: number; h: number };
			configuration: Record<string, unknown>;
			localState: Record<string, unknown>;
			binding: null;
		};
	};
}

/**
 * Resolve a library entry to a dispatch-ready `scene.add-widget` command for a
 * target Scene. Returns `null` for any unavailable entry, so a widget that is
 * unsupported on the current platform profile cannot be added (CMD-005 AC2). The
 * widget is created unbound; the DM binds a data source through the widget
 * lifecycle afterward.
 */
export function resolveAddWidgetCommand(
	entry: WidgetLibraryEntry,
	sceneId: SceneId,
	position: { x: number; y: number } = DEFAULT_LIBRARY_WIDGET_POSITION,
): ResolvedAddWidgetCommand | null {
	if (!entry.availability.available) return null;
	return {
		type: 'scene.add-widget',
		payload: {
			sceneId,
			widget: {
				type: entry.type,
				version: entry.version,
				layout: {
					x: position.x,
					y: position.y,
					w: entry.defaultSize.width,
					h: entry.defaultSize.height,
				},
				// Seed the widget's declared config defaults so a freshly placed widget renders
				// with its "system defaults" before the DM customizes anything.
				configuration: { ...entry.defaultConfiguration },
				localState: {},
				binding: null,
			},
		},
	};
}

/**
 * List every widget definition available on a given surface (e.g. `command-center`), from enabled,
 * non-removed packages. Unlike {@link listWidgetLibrary} this is not capability-gated or
 * library-listed-filtered — the caller's surface is already access-gated upstream (the DM home).
 */
export function listWidgetsForSurface(
	widgets: WidgetPackageState,
	surface: WidgetSurface,
): WidgetDefinition[] {
	const out: WidgetDefinition[] = [];
	for (const record of Object.values(widgets.packages)) {
		if (record.removedAt || !record.enabled) continue;
		for (const definition of record.package.widgets) {
			if (widgetSupportsSurface(definition, surface)) out.push(definition);
		}
	}
	return out;
}
