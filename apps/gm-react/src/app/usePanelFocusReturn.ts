import { useEffect, useRef } from 'react';

/**
 * Keep the keyboard cursor from falling out of the app when a side panel closes ITSELF.
 *
 * `/board` and `/scene/:id` render their Add / Details / Inspector panels conditionally, and several
 * paths unmount one while focus is still inside it: a successful "Add widget", a saved metadata
 * edit, the Inspector's own Close, or the widget simply being deselected. Removing the focused node
 * makes the browser reset `document.activeElement` to `<body>`, so the next Tab restarts the whole
 * page at the skip link — the classic "where did my place go" bug, and one that also strands a
 * screen-reader user with no announced context.
 *
 * The rule is the same one `ds/components/core/Popover.jsx` uses: remember whatever had focus when
 * the panel opened, and reclaim it on close ONLY if focus really was stranded. If the user moved on
 * deliberately (clicked the canvas, tabbed away) we leave them exactly where they are.
 *
 * @param open whether any panel in the group is currently mounted
 */
export function usePanelFocusReturn(open: boolean): void {
	const returnTo = useRef<HTMLElement | null>(null);
	const wasOpen = useRef(open);

	useEffect(() => {
		if (open && !wasOpen.current) {
			returnTo.current =
				document.activeElement instanceof HTMLElement ? document.activeElement : null;
		} else if (!open && wasOpen.current) {
			const active = document.activeElement;
			const stranded = !active || active === document.body;
			const target = returnTo.current;
			// A detached opener (the Add button hides itself when edit mode ends) can't take focus,
			// and calling focus() on it would silently leave the cursor on <body> anyway.
			if (stranded && target && document.contains(target)) target.focus();
			returnTo.current = null;
		}
		wasOpen.current = open;
	}, [open]);
}
