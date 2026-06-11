import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { SceneState } from '../state/scene-state';
import type { CommandCenterState } from '../state/command-center-state';
import type { MapState } from '../state/map-state';
import type { SessionState } from '../state/session-state';
import type { VaultContentState } from '../state/content';
import type { PlatformProfileId, WidgetPackageState } from '../state/widget-package-state';
import type { CoreCommand } from '../commands/types';
import { actorCanAuthorScene } from '../permissions/grants';
import {
	listWidgetLibrary,
	resolveAddWidgetCommand,
	type WidgetLibraryEntry,
} from './widget-library';
import { listSessionPhaseActions } from './command-center-live';

/**
 * Global command palette catalog (CMD-008).
 *
 * The palette is just another GUI surface that dispatches the same Processing Core
 * commands the visible Command Center controls dispatch (Contract 1). This query
 * produces actor-filtered action descriptors; {@link resolveCommandAction} turns an
 * available action into the identical `CoreCommand` a button would issue. The
 * catalog never exposes an alternate mutation path and never leaks why an action is
 * unavailable beyond a safe, generic reason.
 */

export type CommandActionGroup = 'home' | 'preset' | 'widget' | 'session' | 'map';

/** A value the palette must collect from the DM before dispatch (e.g. a preset name). */
export interface CommandActionInput {
	field: string;
	label: string;
	placeholder?: string;
}

export type CommandActionAvailability =
	| { status: 'available' }
	| { status: 'unavailable'; reason: string };

export interface CommandAction {
	id: string;
	title: string;
	keywords: string[];
	group: CommandActionGroup;
	availability: CommandActionAvailability;
	/** The Processing Core command type, identical to the visible control's command. */
	commandType: CoreCommand['type'];
	/** Pre-bound payload. Input actions merge the collected field before dispatch. */
	payload: Record<string, unknown>;
	/** Non-null when the palette must collect a value before the command is dispatchable. */
	input: CommandActionInput | null;
}

export type ResolvedCommandAction = CoreCommand extends infer T
	? T extends CoreCommand
		? Omit<T, 'actorId' | 'idempotencyKey'>
		: never
	: never;

/** The state slices the catalog reads. `CoreStateSlice` satisfies this structurally. */
export interface CommandActionStateView {
	scenes: SceneState;
	permissions: PermissionState;
	widgets: WidgetPackageState;
	commandCenter: CommandCenterState;
	/** UX-CMD-011 — session phase / projection / push actions read the live session state. */
	session: SessionState;
	maps: MapState;
	content: VaultContentState;
}

export interface CommandActionContext {
	/** Active platform profile; gates which widgets can be added (CMD-005/CMD-008). */
	profileId: PlatformProfileId;
}

const NO_HOME_REASON = 'Set up the Command Center first.';

function available(): CommandActionAvailability {
	return { status: 'available' };
}

function unavailable(reason: string): CommandActionAvailability {
	return { status: 'unavailable', reason };
}

function addWidgetAction(entry: WidgetLibraryEntry, homeSceneId: string | null): CommandAction {
	const resolved = homeSceneId ? resolveAddWidgetCommand(entry, homeSceneId) : null;
	let availability: CommandActionAvailability;
	if (!homeSceneId) {
		availability = unavailable(NO_HOME_REASON);
	} else if (!entry.availability.available) {
		availability = unavailable(entry.availability.reason);
	} else {
		availability = available();
	}
	return {
		id: `cc.widget.add:${entry.type}`,
		title: `Add ${entry.displayName}`,
		keywords: ['add', 'widget', entry.displayName, entry.type],
		group: 'widget',
		availability,
		commandType: 'scene.add-widget',
		// When resolvable, carry the exact payload the library's Add button uses, so
		// dispatching from the palette is byte-identical to clicking the control.
		payload: resolved?.payload ?? {},
		input: null,
	};
}

/**
 * List Command Center actions for the global command palette, filtered for the
 * actor. Returns an empty list for any non-DM actor so palette actions are hidden
 * entirely rather than leaking that DM-only operations exist (CMD-008 AC2).
 */
export function listCommandActions(
	state: CommandActionStateView,
	actorId: ActorId,
	context: CommandActionContext,
): CommandAction[] {
	const actor = state.permissions.actors[actorId];
	if (!actorCanAuthorScene(actor)) return [];

	const homeSceneId = state.commandCenter.homeSceneId;
	const homeConfigured = !!homeSceneId && !!state.scenes.scenes[homeSceneId];

	const actions: CommandAction[] = [];

	// Save the current Command Center layout as a named preset (mirrors the visible
	// "Save preset" form, which dispatches command-center.save-preset).
	actions.push({
		id: 'cc.preset.save',
		title: 'Save Command Center preset',
		keywords: ['save', 'preset', 'layout', 'snapshot', 'command center'],
		group: 'preset',
		availability: homeConfigured ? available() : unavailable(NO_HOME_REASON),
		commandType: 'command-center.save-preset',
		payload: {},
		input: { field: 'name', label: 'Preset name', placeholder: 'Combat Night' },
	});

	// Apply each saved preset (mirrors the visible per-preset "Apply" button, which
	// dispatches command-center.apply-preset with the same presetId).
	const presets = Object.values(state.commandCenter.presets).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	for (const preset of presets) {
		actions.push({
			id: `cc.preset.apply:${preset.id}`,
			title: `Apply preset: ${preset.name}`,
			keywords: ['apply', 'restore', 'preset', preset.name],
			group: 'preset',
			availability: homeConfigured ? available() : unavailable(NO_HOME_REASON),
			commandType: 'command-center.apply-preset',
			payload: { presetId: preset.id },
			input: null,
		});
	}

	// Add any library widget to the Command Center (mirrors the widget library's Add
	// button, which dispatches scene.add-widget). Profile-unsupported widgets are
	// shown disabled with the same reason the library reports (CMD-005 AC2).
	const library = listWidgetLibrary(state.widgets, state.permissions, actorId, {
		profileId: context.profileId,
		includeUnavailable: true,
	});
	for (const entry of library) {
		actions.push(addWidgetAction(entry, homeSceneId));
	}

	// UX-CMD-010 / UX-CMD-011 — session phase transitions. Mirrors the Phase badge
	// popover: only the VALID transitions from the current workflow appear (invalid
	// ones are absent, not disabled), and each dispatches the same session.set-workflow
	// command the visible control issues. listSessionPhaseActions is already DM-gated.
	const liveSceneId = state.session.activeSceneId ?? homeSceneId;
	for (const phase of listSessionPhaseActions(state, actorId)) {
		const carriesScene =
			phase.targetWorkflow === 'active' ||
			phase.targetWorkflow === 'prep' ||
			phase.targetWorkflow === 'paused' ||
			phase.targetWorkflow === 'ending';
		actions.push({
			id: phase.id,
			title: phase.label,
			keywords: ['session', 'phase', phase.label, phase.targetWorkflow],
			group: 'session',
			availability: available(),
			commandType: 'session.set-workflow',
			payload: carriesScene
				? { workflow: phase.targetWorkflow, activeSceneId: liveSceneId }
				: { workflow: phase.targetWorkflow },
			input: null,
		});
	}

	// UX-CMD-007 / UX-CMD-011 — active-map controls. "Set active map: <name>" per vault
	// map (the same session.set-active-map the Change-map control dispatches), and
	// "Project active map to players" (the same session.project-active-map the embed's
	// toggle dispatches). Unavailable reasons are generic/non-leaking by construction:
	// they describe the DM's own session state, never hidden content.
	const sessionActive = state.session.workflow === 'active';
	const vaultMaps = Object.values(state.maps.maps).sort((a, b) => a.name.localeCompare(b.name));
	for (const map of vaultMaps) {
		actions.push({
			id: `cc.map.set-active:${map.id}`,
			title: `Set active map: ${map.name}`,
			keywords: ['map', 'active', 'change', map.name],
			group: 'map',
			availability: available(),
			commandType: 'session.set-active-map',
			payload: { mapId: map.id, regionId: map.defaultRegionId },
			input: null,
		});
	}
	const playerIds = Object.values(state.permissions.actors)
		.filter((participant) => participant.role === 'player')
		.map((participant) => participant.id)
		.sort();
	actions.push({
		id: 'cc.map.project',
		title: 'Project active map to players',
		keywords: ['map', 'project', 'players', 'projection', 'show'],
		group: 'map',
		availability: !state.session.activeMap
			? unavailable('No active map selected.')
			: !sessionActive
				? unavailable('Session is not active.')
				: playerIds.length === 0
					? unavailable('No connected players.')
					: available(),
		commandType: 'session.project-active-map',
		payload: { playerActorIds: playerIds, connectionState: 'connected' },
		input: null,
	});

	// UX-CMD-006 push parity note: "Push to players: [content name]" is CONTEXTUAL per the
	// UX-CMD-011 spec — it is NOT enumerated per vault item here, because the command registry
	// also feeds the quick switcher, and per-item commands would surface entity titles in command
	// mode (SRCH-005). The palette instead carries a single "Push handout to players…" navigation
	// entry (see command-availability.ts) that opens the same confirmed push flow.

	return actions;
}

/**
 * Resolve an action to the dispatch-ready Processing Core command, identical to the
 * one the matching visible control issues. Returns `null` when the action is
 * unavailable or a required input value is missing, so the palette can never
 * dispatch a command a disabled control could not.
 */
export function resolveCommandAction(
	action: CommandAction,
	input: Record<string, string> = {},
): ResolvedCommandAction | null {
	if (action.availability.status !== 'available') return null;
	let payload = { ...action.payload };
	if (action.input) {
		const value = input[action.input.field]?.trim();
		if (!value) return null;
		payload = { ...payload, [action.input.field]: value };
	}
	return { type: action.commandType, payload } as ResolvedCommandAction;
}

/** Filter actions by a case-insensitive query over titles and keywords. */
export function searchCommandActions(actions: CommandAction[], query: string): CommandAction[] {
	const q = query.trim().toLowerCase();
	if (!q) return actions;
	return actions.filter(
		(action) =>
			action.title.toLowerCase().includes(q) ||
			action.keywords.some((keyword) => keyword.toLowerCase().includes(q)),
	);
}
