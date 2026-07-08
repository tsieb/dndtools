import { getContext, setContext } from 'svelte';

/**
 * The minimal route-owned actions a Command Center widget needs that it cannot perform itself: the
 * two surfaces that are modal dialogs rendered at the route level (the push-handout flow and the
 * per-participant Player View preview). Everything else a CC widget needs it derives from the shared
 * runtime / feature-tier contexts and dispatches directly, so the widgets stay self-contained.
 */
export interface CommandCenterActions {
	openPush: (recipientId: string | null) => void;
	openPreview: (actorId: string, displayName: string) => void;
}

const KEY = Symbol('dndtools:command-center-actions');

export function provideCommandCenter(actions: CommandCenterActions): CommandCenterActions {
	setContext(KEY, actions);
	return actions;
}

export function useCommandCenter(): CommandCenterActions {
	return (
		getContext<CommandCenterActions | undefined>(KEY) ?? {
			openPush: () => {},
			openPreview: () => {},
		}
	);
}
