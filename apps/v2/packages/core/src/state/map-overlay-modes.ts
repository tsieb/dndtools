/**
 * MAP-014 — combat overlay MODE configuration with DECLARED PREREQUISITE VISUAL STATE.
 *
 * A map's combat presentation is driven by EXPLICIT mode commands, not implicit toggles. Each mode
 * (grid / token / range / area-of-effect / combat) declares the visual prerequisites it requires —
 * e.g. grid-alignment mode requires a VISIBLE GRID. Entering a mode whose prerequisite is unmet either
 * (a) automatically satisfies the prerequisite when `autoSatisfyPrerequisites` is set (the requirement
 * lets the DM "enable grid visibility or block with a reason"), or (b) is BLOCKED with a structured
 * reason. The gate is enforced in the Processing Core, fail-closed, even against a "forced" transition
 * (MAP-014 AC2 — a defect-driven requirement: an internal forced transition must still be validated).
 *
 * This module is pure policy: the overlay settings record, the prerequisite declarations, and the
 * transition validator are deterministic, side-effect-free functions. The command handler composes
 * them; the GUI dispatches explicit set-mode commands and renders the resulting settings.
 */

/** The combat overlay modes a map can be put into. `none` is the default (no combat overlay). */
export type MapOverlayMode = 'none' | 'grid-align' | 'token' | 'range' | 'area-of-effect' | 'combat';

export const MAP_OVERLAY_MODES: readonly MapOverlayMode[] = Object.freeze([
	'none',
	'grid-align',
	'token',
	'range',
	'area-of-effect',
	'combat',
]);

/** The discrete visual prerequisites a mode can require. Each maps to a field on the overlay settings. */
export type MapOverlayPrerequisite = 'grid-visible' | 'tokens-enabled';

/**
 * The durable combat-overlay settings stored on a map. `gridVisible`/`tokensEnabled` are the
 * PREREQUISITE VISUAL STATE flags modes depend on; `gridSize` is the grid cell count across the map
 * width (used by token range/AoE math). `rangeUnit` labels range measurements. These are the explicit
 * state the mode commands read and (when permitted) satisfy.
 */
export interface MapOverlaySettings {
	mode: MapOverlayMode;
	gridVisible: boolean;
	/** Grid cells across the normalized map width. Drives token range/AoE grid math. */
	gridSize: number;
	tokensEnabled: boolean;
	/** Real-world units per grid cell (e.g. 5 feet). Presentation/measurement metadata. */
	unitsPerCell: number;
	revision: number;
	updatedBy: string | null;
	updatedAt: string | null;
}

export const DEFAULT_MAP_OVERLAY_SETTINGS: MapOverlaySettings = Object.freeze({
	mode: 'none',
	gridVisible: false,
	gridSize: 10,
	tokensEnabled: false,
	unitsPerCell: 5,
	revision: 1,
	updatedBy: null,
	updatedAt: null,
});

/**
 * The DECLARED prerequisites for each mode. This is the single source of truth the validator reads;
 * adding a mode means declaring its prerequisites here, never scattering checks across handlers.
 *   - `grid-align` requires a visible grid (MAP-014 AC1).
 *   - `range` and `area-of-effect` require both a visible grid AND tokens enabled (you measure range
 *     from tokens against the grid).
 *   - `combat` requires tokens enabled (combat is token-driven).
 *   - `token` and `none` require nothing.
 */
export const MODE_PREREQUISITES: Readonly<Record<MapOverlayMode, readonly MapOverlayPrerequisite[]>> =
	Object.freeze({
		none: [],
		'grid-align': ['grid-visible'],
		token: [],
		range: ['grid-visible', 'tokens-enabled'],
		'area-of-effect': ['grid-visible', 'tokens-enabled'],
		combat: ['tokens-enabled'],
	});

/** Whether a single prerequisite is satisfied by the current settings. */
function prerequisiteSatisfied(
	settings: MapOverlaySettings,
	prerequisite: MapOverlayPrerequisite,
): boolean {
	switch (prerequisite) {
		case 'grid-visible':
			return settings.gridVisible;
		case 'tokens-enabled':
			return settings.tokensEnabled;
	}
}

/** Apply a single prerequisite to the settings (used by auto-satisfy). */
function satisfyPrerequisite(
	settings: MapOverlaySettings,
	prerequisite: MapOverlayPrerequisite,
): MapOverlaySettings {
	switch (prerequisite) {
		case 'grid-visible':
			return { ...settings, gridVisible: true };
		case 'tokens-enabled':
			return { ...settings, tokensEnabled: true };
	}
}

export type MapOverlayModeError = {
	kind: 'prerequisite-unmet';
	mode: MapOverlayMode;
	/** The prerequisites the mode requires that are NOT satisfied. */
	missing: MapOverlayPrerequisite[];
	message: string;
};

export interface EnterModeInput {
	mode: MapOverlayMode;
	/**
	 * When true, unmet prerequisites are AUTOMATICALLY satisfied (e.g. grid visibility is enabled) as
	 * part of entering the mode (MAP-014 AC1 — "grid visibility is enabled OR the mode transition is
	 * blocked"). When false (or omitted), an unmet prerequisite BLOCKS the transition with a reason.
	 */
	autoSatisfyPrerequisites?: boolean;
}

export interface EnterModeStamp {
	actorId: string;
	now: string;
}

/**
 * MAP-014 — validate + apply a mode transition. The prerequisite gate runs UNCONDITIONALLY: there is
 * no "force" path that bypasses it (MAP-014 AC2). Returns the next settings on success (with any
 * auto-satisfied prerequisites applied) or a structured `prerequisite-unmet` error listing exactly
 * which prerequisites are missing, so the DM sees a reason.
 */
export function enterOverlayMode(
	settings: MapOverlaySettings,
	input: EnterModeInput,
	stamp: EnterModeStamp,
): { settings: MapOverlaySettings } | { error: MapOverlayModeError } {
	const required = MODE_PREREQUISITES[input.mode];
	let working = settings;

	// If auto-satisfy is requested, satisfy each missing prerequisite first; then re-check. This is the
	// "enable grid visibility" branch of AC1.
	if (input.autoSatisfyPrerequisites) {
		for (const prerequisite of required) {
			if (!prerequisiteSatisfied(working, prerequisite)) {
				working = satisfyPrerequisite(working, prerequisite);
			}
		}
	}

	// The gate. Even an internal/forced caller reaches here; there is no bypass (AC2).
	const missing = required.filter((prerequisite) => !prerequisiteSatisfied(working, prerequisite));
	if (missing.length > 0) {
		return {
			error: {
				kind: 'prerequisite-unmet',
				mode: input.mode,
				missing: [...missing],
				message: `Mode "${input.mode}" requires ${missing.join(', ')}. Enable the prerequisite visual state first, or re-issue with auto-satisfy.`,
			},
		};
	}

	return {
		settings: {
			...working,
			mode: input.mode,
			revision: settings.revision + 1,
			updatedBy: stamp.actorId,
			updatedAt: stamp.now,
		},
	};
}

export interface ConfigureOverlayPatch {
	gridVisible?: boolean;
	gridSize?: number;
	tokensEnabled?: boolean;
	unitsPerCell?: number;
}

export type ConfigureOverlayError =
	| { kind: 'invalid-grid-size'; message: string }
	| { kind: 'invalid-units-per-cell'; message: string }
	| { kind: 'prerequisite-unmet'; mode: MapOverlayMode; missing: MapOverlayPrerequisite[]; message: string };

/**
 * MAP-014 — configure the overlay settings (grid visibility/size, tokens, units per cell). When a
 * configuration change would INVALIDATE the current mode's prerequisites (e.g. hiding the grid while
 * in grid-align mode), the change is BLOCKED with the same `prerequisite-unmet` reason — the gate is
 * enforced on configuration too, so you cannot sneak the map into an inconsistent visual state
 * (MAP-014 AC2). Fail-closed on a non-positive grid size / units-per-cell.
 */
export function configureOverlay(
	settings: MapOverlaySettings,
	patch: ConfigureOverlayPatch,
	stamp: EnterModeStamp,
): { settings: MapOverlaySettings } | { error: ConfigureOverlayError } {
	if (patch.gridSize !== undefined && (!Number.isInteger(patch.gridSize) || patch.gridSize <= 0)) {
		return { error: { kind: 'invalid-grid-size', message: 'Grid size must be a positive integer.' } };
	}
	if (
		patch.unitsPerCell !== undefined &&
		(!Number.isFinite(patch.unitsPerCell) || patch.unitsPerCell <= 0)
	) {
		return {
			error: { kind: 'invalid-units-per-cell', message: 'Units per cell must be positive.' },
		};
	}
	const next: MapOverlaySettings = {
		...settings,
		gridVisible: patch.gridVisible ?? settings.gridVisible,
		gridSize: patch.gridSize ?? settings.gridSize,
		tokensEnabled: patch.tokensEnabled ?? settings.tokensEnabled,
		unitsPerCell: patch.unitsPerCell ?? settings.unitsPerCell,
		revision: settings.revision + 1,
		updatedBy: stamp.actorId,
		updatedAt: stamp.now,
	};

	// Re-validate the CURRENT mode against the new settings: a config change must not leave the active
	// mode with an unmet prerequisite (AC2 — validation prevents the inconsistent transition).
	const required = MODE_PREREQUISITES[settings.mode];
	const missing = required.filter((prerequisite) => !prerequisiteSatisfied(next, prerequisite));
	if (missing.length > 0) {
		return {
			error: {
				kind: 'prerequisite-unmet',
				mode: settings.mode,
				missing: [...missing],
				message: `This change would leave mode "${settings.mode}" without ${missing.join(', ')}. Exit the mode first or keep the prerequisite enabled.`,
			},
		};
	}

	return { settings: next };
}

/** Normalize a partial/legacy overlay settings record, filling MAP-014 fields with safe defaults so a
 *  pre-MAP-014 persisted map stays readable without a destructive migration (fail-closed defaults). */
export function normalizeOverlaySettings(
	settings: Partial<MapOverlaySettings> | undefined,
): MapOverlaySettings {
	return {
		mode: settings?.mode ?? DEFAULT_MAP_OVERLAY_SETTINGS.mode,
		gridVisible: settings?.gridVisible ?? DEFAULT_MAP_OVERLAY_SETTINGS.gridVisible,
		gridSize: settings?.gridSize ?? DEFAULT_MAP_OVERLAY_SETTINGS.gridSize,
		tokensEnabled: settings?.tokensEnabled ?? DEFAULT_MAP_OVERLAY_SETTINGS.tokensEnabled,
		unitsPerCell: settings?.unitsPerCell ?? DEFAULT_MAP_OVERLAY_SETTINGS.unitsPerCell,
		revision: settings?.revision ?? DEFAULT_MAP_OVERLAY_SETTINGS.revision,
		updatedBy: settings?.updatedBy ?? null,
		updatedAt: settings?.updatedAt ?? null,
	};
}
