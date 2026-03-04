const KEYBOARD_OPEN_THRESHOLD_PX = 120;
const KEYBOARD_CSS_VAR = '--dndtools-keyboard-inset';

interface SimulatedKeyboardDetail {
	inset?: number;
}

class MobileKeyboardState {
	keyboardOpen = $state(false);
	keyboardInset = $state(0);
	private teardown: (() => void) | null = null;

	initialize(): void {
		if (typeof window === 'undefined' || this.teardown) return;
		const viewport = window.visualViewport;
		if (!viewport) return;

		const applyInset = (rawInset: number): void => {
			const normalizedInset =
				Number.isFinite(rawInset) && rawInset >= KEYBOARD_OPEN_THRESHOLD_PX
					? Math.round(rawInset)
					: 0;
			this.keyboardInset = normalizedInset;
			this.keyboardOpen = normalizedInset > 0;
			if (typeof document !== 'undefined') {
				document.documentElement.style.setProperty(KEYBOARD_CSS_VAR, `${normalizedInset}px`);
				document.documentElement.classList.toggle('dndtools-keyboard-open', normalizedInset > 0);
			}
			if (normalizedInset > 0) {
				this.keepActiveElementVisible();
			}
		};

		const readViewportInset = (): number => {
			const viewportHeight = viewport.height + viewport.offsetTop;
			return Math.max(0, window.innerHeight - viewportHeight);
		};

		const handleViewportChange = (): void => {
			applyInset(readViewportInset());
		};

		const handleSimulatedEvent = (event: Event): void => {
			const detail =
				event instanceof CustomEvent ? (event.detail as SimulatedKeyboardDetail | undefined) : null;
			applyInset(Number(detail?.inset ?? 0));
		};

		viewport.addEventListener('resize', handleViewportChange);
		viewport.addEventListener('scroll', handleViewportChange);
		window.addEventListener('resize', handleViewportChange);
		window.addEventListener('dndtools:simulate-keyboard-inset', handleSimulatedEvent);
		handleViewportChange();

		this.teardown = () => {
			viewport.removeEventListener('resize', handleViewportChange);
			viewport.removeEventListener('scroll', handleViewportChange);
			window.removeEventListener('resize', handleViewportChange);
			window.removeEventListener('dndtools:simulate-keyboard-inset', handleSimulatedEvent);
			applyInset(0);
			this.teardown = null;
		};
	}

	dispose(): void {
		this.teardown?.();
	}

	private keepActiveElementVisible(): void {
		if (typeof document === 'undefined') return;
		const active = document.activeElement;
		if (!(active instanceof HTMLElement)) return;
		if (active.closest('.cm-editor')) {
			active.scrollIntoView({ block: 'center', inline: 'nearest' });
			return;
		}
		const tag = active.tagName.toLowerCase();
		if (tag === 'textarea' || tag === 'input' || active.isContentEditable) {
			active.scrollIntoView({ block: 'center', inline: 'nearest' });
		}
	}
}

export const mobileKeyboardState = new MobileKeyboardState();
