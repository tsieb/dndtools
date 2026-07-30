interface ModalSiblingSnapshot {
	element: HTMLElement;
	ariaHidden: string | null;
	hadInert: boolean;
}

/**
 * Hide every branch outside an active modal from keyboard and accessibility navigation.
 *
 * `aria-modal` communicates intent, but Android WebView can retain the underlying accessibility
 * tree for a dynamically mounted fixed overlay. Walking from the panel to `body` and making each
 * sibling branch inert gives TalkBack one unambiguous active tree and also prevents pointer/focus
 * escape. The exact prior state is restored so nested overlays compose safely.
 */
export function isolateModalSiblings(modal: HTMLElement): () => void {
	const snapshots: ModalSiblingSnapshot[] = [];
	let branch: HTMLElement = modal;

	while (branch.parentElement) {
		const parent = branch.parentElement;
		for (const sibling of parent.children) {
			if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
			// A branch may opt out. The toast viewport does: it is a sibling of every modal surface,
			// so isolating it made the app's only feedback channel inert and screen-reader-invisible
			// for anything raised from inside a dialog, sheet, map editor or display overlay — which
			// is exactly where a refusal message matters most.
			if (sibling.hasAttribute('data-modal-exempt')) continue;
			snapshots.push({
				element: sibling,
				ariaHidden: sibling.getAttribute('aria-hidden'),
				hadInert: sibling.hasAttribute('inert'),
			});
			sibling.setAttribute('aria-hidden', 'true');
			sibling.setAttribute('inert', '');
		}

		if (parent === document.body) break;
		branch = parent;
	}

	return () => {
		for (const snapshot of snapshots.reverse()) {
			if (snapshot.ariaHidden === null) snapshot.element.removeAttribute('aria-hidden');
			else snapshot.element.setAttribute('aria-hidden', snapshot.ariaHidden);
			if (snapshot.hadInert) snapshot.element.setAttribute('inert', '');
			else snapshot.element.removeAttribute('inert');
		}
	};
}
