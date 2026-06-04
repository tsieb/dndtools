import type { ActorId } from '../state/ids';
import type { CoreCommand } from '../commands/types';
import { actorCanAuthorScene } from '../permissions/grants';
import {
	listCommandActions,
	type CommandAction,
	type CommandActionAvailability,
	type CommandActionContext,
	type CommandActionInput,
	type CommandActionStateView,
	type ResolvedCommandAction,
} from './command-actions';
import { listNavigationSections } from './navigation';
import { listScenesForActor } from './scene';

/**
 * Unified actor-filtered command availability API (NAV-008, NAV-010).
 *
 * NAV-010 requires navigation and command surfaces to use the *same* actor-filtered
 * command availability API as widgets and visible controls. This module is that
 * API: it merges navigation sections (from {@link listNavigationSections}), scene
 * deep links (from {@link listScenesForActor}, already visibility-filtered), and
 * Processing Core command actions (from {@link listCommandActions}, already permission
 * filtered) into one catalog the command palette renders (NAV-008).
 *
 * Two invariants hold across every surface:
 *
 * 1. Filtering happens in the Processing Core before the GUI sees a command, so a
 *    DM-only or hidden target is absent rather than leaked (Contract 1, Contract 3).
 * 2. A core-command entry resolves to the *identical* {@link CoreCommand} a visible
 *    control dispatches, so both paths share one command type and validation path
 *    (NAV-010 AC2).
 */

export type CommandCategory =
	| 'action'
	| 'navigation'
	| 'settings'
	| 'note'
	| 'scene'
	| 'map'
	| 'widget';

/** A palette entry that navigates to a route. Navigation is not a durable mutation,
 *  so it carries a route rather than a Processing Core command. */
export interface PaletteNavigationCommand {
	kind: 'navigation';
	id: string;
	title: string;
	keywords: string[];
	category: 'navigation' | 'settings' | 'scene';
	availability: CommandActionAvailability;
	route: string;
}

/** A palette entry that dispatches the same Processing Core command a visible control
 *  would dispatch (NAV-010 AC2). */
export interface PaletteCoreCommand {
	kind: 'core-command';
	id: string;
	title: string;
	keywords: string[];
	category: CommandCategory;
	availability: CommandActionAvailability;
	commandType: CoreCommand['type'];
	payload: Record<string, unknown>;
	input: CommandActionInput | null;
}

export type PaletteCommand = PaletteNavigationCommand | PaletteCoreCommand;

export type ResolvedPaletteCommand =
	| { kind: 'navigate'; route: string }
	| { kind: 'dispatch'; command: ResolvedCommandAction };

function categoryForAction(action: CommandAction): CommandCategory {
	return action.group === 'widget' ? 'widget' : 'action';
}

/**
 * Create the "Create Scene" core command. Only offered to actors who can author
 * Scenes, so it is never present for players/observers (fail closed). It resolves to
 * the same `scene.create` command the visible Scene-create form dispatches; the
 * reducer applies defaults for description/tags/visibility (NAV-010 AC2).
 */
function createSceneCommand(): PaletteCoreCommand {
	return {
		kind: 'core-command',
		id: 'scene.create',
		title: 'Create Scene',
		keywords: ['create', 'new', 'scene', 'canvas'],
		category: 'scene',
		availability: { status: 'available' },
		commandType: 'scene.create',
		payload: {},
		input: { field: 'name', label: 'Scene name', placeholder: 'Goblin Ambush' },
	};
}

/**
 * List every command available to an actor for the command palette (NAV-008):
 * navigation, settings, scene, action, and widget commands, filtered by actor
 * visibility and permission. The result is independent of the platform profile for
 * navigation/action commands, so every profile's palette or equivalent menu exposes
 * the same filtering result (NAV-008 AC3); only widget availability varies by
 * profile, exactly as the widget library reports it (CMD-005).
 *
 * Categories `note` and `map` are part of the model but have no concrete commands in
 * this prototype because those domains are not yet implemented.
 */
export function listPaletteCommands(
	state: CommandActionStateView,
	actorId: ActorId,
	context: CommandActionContext,
): PaletteCommand[] {
	const commands: PaletteCommand[] = [];

	// 1. Navigation sections — the same actor-filtered API the primary nav consumes.
	for (const section of listNavigationSections(state.permissions, actorId)) {
		commands.push({
			kind: 'navigation',
			id: `nav.${section.id}`,
			title: `Go to ${section.title}`,
			keywords: ['go', 'navigate', section.title, ...section.keywords],
			category: section.category,
			availability: { status: 'available' },
			route: section.route,
		});
	}

	// 2. Scene deep links — visibility-filtered by listScenesForActor, so a scene that
	//    is not visible to this actor produces no command and cannot leak (NAV-010 AC1).
	for (const scene of listScenesForActor(state.scenes, state.permissions, actorId)) {
		commands.push({
			kind: 'navigation',
			id: `nav.scene:${scene.id}`,
			title: `Open Scene: ${scene.name}`,
			keywords: ['open', 'scene', scene.name, ...scene.tags],
			category: 'scene',
			availability: { status: 'available' },
			route: `/scene/${scene.id}/`,
		});
	}

	// 3. Processing Core command actions — listCommandActions already fails closed for
	//    non-DM actors, so the DM-authoring "Create Scene" command is added under the
	//    same guard.
	if (actorCanAuthorScene(state.permissions.actors[actorId])) {
		commands.push(createSceneCommand());
	}
	for (const action of listCommandActions(state, actorId, context)) {
		commands.push({
			kind: 'core-command',
			id: action.id,
			title: action.title,
			keywords: action.keywords,
			category: categoryForAction(action),
			availability: action.availability,
			commandType: action.commandType,
			payload: action.payload,
			input: action.input,
		});
	}

	return commands;
}

/**
 * Resolve a palette command to a concrete action: a route to navigate to, or the
 * dispatch-ready Processing Core command (identical to the visible control's). Returns
 * `null` when the command is unavailable or a required input is missing, so a disabled
 * palette entry can never dispatch a command a disabled control could not (NAV-008 AC2).
 */
export function resolvePaletteCommand(
	command: PaletteCommand,
	input: Record<string, string> = {},
): ResolvedPaletteCommand | null {
	if (command.availability.status !== 'available') return null;
	if (command.kind === 'navigation') {
		return { kind: 'navigate', route: command.route };
	}
	let payload = { ...command.payload };
	if (command.input) {
		const value = input[command.input.field]?.trim();
		if (!value) return null;
		payload = { ...payload, [command.input.field]: value };
	}
	return {
		kind: 'dispatch',
		command: { type: command.commandType, payload } as ResolvedCommandAction,
	};
}

/** Filter palette commands by a case-insensitive query over titles and keywords. */
export function searchPaletteCommands(
	commands: PaletteCommand[],
	query: string,
): PaletteCommand[] {
	const q = query.trim().toLowerCase();
	if (!q) return commands;
	return commands.filter(
		(command) =>
			command.title.toLowerCase().includes(q) ||
			command.keywords.some((keyword) => keyword.toLowerCase().includes(q)),
	);
}
