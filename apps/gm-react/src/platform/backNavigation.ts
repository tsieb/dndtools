export type BackHandlerLayer = 'overlay' | 'fullscreen';
export type BackHandler = () => boolean | void | Promise<boolean | void>;

interface RegisteredHandler {
	id: number;
	handler: BackHandler;
}

const handlers: Record<BackHandlerLayer, RegisteredHandler[]> = {
	overlay: [],
	fullscreen: [],
};
let nextId = 1;

/** Register a close/leave action. Newer entries are always treated as visually topmost. */
export function registerBackHandler(layer: BackHandlerLayer, handler: BackHandler): () => void {
	const entry = { id: nextId++, handler };
	handlers[layer].push(entry);
	return () => {
		const index = handlers[layer].findIndex(({ id }) => id === entry.id);
		if (index >= 0) handlers[layer].splice(index, 1);
	};
}

async function runTopHandler(layer: BackHandlerLayer): Promise<boolean> {
	const entry = handlers[layer].at(-1);
	if (!entry) return false;
	// A registered surface consumes Back unless it explicitly returns false. This lets a
	// non-dismissible confirmation protect the route behind it without closing itself.
	return (await entry.handler()) !== false;
}

export interface BackNavigationContext {
	atRootDestination: boolean;
	canGoBack: boolean;
	navigateBack(): void | Promise<void>;
	navigateToRoot(): void | Promise<void>;
	minimize(): void | Promise<void>;
}

/** Android Back ordering: top overlay, fullscreen mode, router history, then minimize. */
export async function handlePlatformBack(
	context: BackNavigationContext,
): Promise<'overlay' | 'fullscreen' | 'history' | 'minimized'> {
	if (await runTopHandler('overlay')) return 'overlay';
	if (await runTopHandler('fullscreen')) return 'fullscreen';
	if (!context.atRootDestination) {
		if (context.canGoBack) await context.navigateBack();
		else await context.navigateToRoot();
		return 'history';
	}
	await context.minimize();
	return 'minimized';
}

/** Test-only reset; intentionally not used by production code. */
export function resetBackHandlersForTest(): void {
	handlers.overlay.length = 0;
	handlers.fullscreen.length = 0;
	nextId = 1;
}
