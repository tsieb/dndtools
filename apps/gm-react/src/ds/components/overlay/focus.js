/** Re-query on each Tab: fields can become hidden or disabled while a modal is open. */
export function tabbableElements(panel) {
	return Array.from(
		panel.querySelectorAll(
			'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]',
		),
	).filter((node) => {
		if (node.tabIndex < 0 || node.matches(':disabled') || node.closest('[hidden], [inert]'))
			return false;
		if (getComputedStyle(node).visibility !== 'visible') return false;
		for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
			if (getComputedStyle(ancestor).display === 'none') return false;
		}
		return true;
	});
}

/**
 * Focus-trap ownership for NESTED overlays — the Tab counterpart to `platform/escapeLayers`.
 *
 * Escape belongs to the innermost OPEN layer of any kind, and a Popover/menu flyout is such a
 * layer. Tab containment is different: it belongs to the innermost layer that actually IMPLEMENTS
 * a trap. Gating Tab on escape ownership instead handed Tab to layers that trap nothing — a
 * `ds/components/core/Popover.jsx` only handles Escape, an outside pointerdown and Android Back —
 * so opening a layer-row menu inside the phone map editor's "Map panels" sheet let Tab walk
 * straight out of the modal and onto browser chrome.
 *
 * Only Dialog and Sheet register here, so a nested non-trapping surface leaves the containing
 * overlay's trap intact, while a genuinely nested Dialog/Sheet takes it over.
 */
const trapLayers = [];
let nextTrapToken = 1;

/** Claim Tab containment for an opening overlay. `getElement` is read lazily, at keydown time. */
export function pushTrapLayer(getElement) {
	const token = nextTrapToken++;
	trapLayers.push({ token, getElement });
	return token;
}

/** Release a token. Safe to call for a token that was already released. */
export function popTrapLayer(token) {
	const index = trapLayers.findIndex((l) => l.token === token);
	if (index >= 0) trapLayers.splice(index, 1);
}

/** True unless another OPEN trapping overlay is nested inside this one. */
export function ownsFocusTrap(token) {
	const self = trapLayers.find((l) => l.token === token);
	const element = self?.getElement();
	if (!element) return true;
	for (const other of trapLayers) {
		if (other.token === token) continue;
		const nested = other.getElement();
		if (nested && nested !== element && element.contains(nested)) return false;
	}
	return true;
}
