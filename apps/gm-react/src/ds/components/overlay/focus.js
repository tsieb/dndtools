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
