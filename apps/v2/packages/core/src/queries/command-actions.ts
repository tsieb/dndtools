import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { SceneState } from '../state/scene-state';
import type { CommandCenterState } from '../state/command-center-state';
import type { PlatformProfileId, WidgetPackageState } from '../state/widget-package-state';
import type { CoreCommand } from '../commands/types';
import { actorCanAuthorScene } from '../permissions/grants';
import {
	listWidgetLibrary,
	resolveAddWidgetCommand,
	type WidgetLibraryEntry,
} from './widget-library';

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

export type CommandActionGroup = 'home' | 'preset' | 'widget';

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

/** The state slices the catalog reads. `CoreStateSlice` satisfies this structurally. */
export interface CommandActionStateView {
	scenes: SceneState;
	permissions: PermissionState;
	widgets: WidgetPackageState;
	commandCenter: CommandCenterState;
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

function addWidgetAction(
	entry: WidgetLibraryEntry,
	homeSceneId: string | null,
): CommandAction {
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
): { type: CoreCommand['type']; payload: Record<string, unknown> } | null {
	if (action.availability.status !== 'available') return null;
	let payload = { ...action.payload };
	if (action.input) {
		const value = input[action.input.field]?.trim();
		if (!value) return null;
		payload = { ...payload, [action.input.field]: value };
	}
	return { type: action.commandType, payload };
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
