/**
 * Escape ownership for NESTED overlays.
 *
 * Dialog, Sheet and Popover each listen for Escape on `document` in the CAPTURE phase and call
 * `e.stopPropagation()`. That protects the surface keymaps underneath, but it does NOT separate the
 * overlays from each other: `stopPropagation` has no effect on other listeners bound to the SAME
 * node. So one Escape inside a Popover that lives inside a Sheet closed both — the live case being
 * the phone map editor, where the layer-opacity flyout and the ⋯ menu both live inside the
 * "Map panels" sheet.
 *
 * Registration ORDER cannot resolve this: React runs child effects before parent effects, so a
 * nested chain mounted in one commit registers innermost-first, while a popover opened later inside
 * an already-open sheet registers last. DOM containment is the signal that is true in both cases.
 *
 * The rule is deliberately narrow — a layer stands down only when another OPEN layer is nested
 * inside it. Two overlays that merely overlap behave exactly as they did before, so this can never
 * leave a surface un-dismissable.
 */

interface EscapeLayer {
	token: number;
	getElement: () => Element | null;
}

const layers: EscapeLayer[] = [];
let nextToken = 1;

/**
 * Claim Escape for a newly opened overlay. `getElement` is read lazily at keydown time, so a ref
 * that is still null during the open effect is fine. Pair with `popEscapeLayer`.
 */
export function pushEscapeLayer(getElement: () => Element | null): number {
	const token = nextToken++;
	layers.push({ token, getElement });
	return token;
}

/** Release a token. Safe to call for a token that was already released. */
export function popEscapeLayer(token: number): void {
	const index = layers.findIndex((l) => l.token === token);
	if (index >= 0) layers.splice(index, 1);
}

/** True unless another open overlay is nested inside this one — i.e. unless Escape belongs deeper. */
export function ownsEscape(token: number): boolean {
	const self = layers.find((l) => l.token === token);
	const element = self?.getElement();
	if (!element) return true;
	for (const other of layers) {
		if (other.token === token) continue;
		const nested = other.getElement();
		if (nested && nested !== element && element.contains(nested)) return false;
	}
	return true;
}

/** Test-only reset; intentionally not used by production code. */
export function resetEscapeLayersForTest(): void {
	layers.length = 0;
	nextToken = 1;
}
