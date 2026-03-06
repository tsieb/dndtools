const LAYOUT_RESIZE_DEBOUNCE_MS = 100;

export const LAYOUT_BREAKPOINTS = {
	compactMax: 639,
	mediumMax: 1099,
	expandedMin: 1100,
} as const;

export type LayoutTier = 'compact' | 'medium' | 'expanded';

export function layoutTierFromWidth(width: number): LayoutTier {
	if (width <= LAYOUT_BREAKPOINTS.compactMax) {
		return 'compact';
	}
	if (width <= LAYOUT_BREAKPOINTS.mediumMax) {
		return 'medium';
	}
	return 'expanded';
}

class LayoutState {
	tier = $state<LayoutTier>('expanded');
	viewportWidth = $state<number>(LAYOUT_BREAKPOINTS.expandedMin);
	isCompact = $derived(this.tier === 'compact');
	isMedium = $derived(this.tier === 'medium');
	isExpanded = $derived(this.tier === 'expanded');

	private teardown: (() => void) | null = null;
	private resizeDebounceHandle: ReturnType<typeof setTimeout> | null = null;

	initialize(): void {
		if (typeof window === 'undefined' || typeof document === 'undefined' || this.teardown) return;
		const root = document.documentElement;

		const applyWidth = (rawWidth: number): void => {
			const normalizedWidth =
				Number.isFinite(rawWidth) && rawWidth > 0
					? Math.round(rawWidth)
					: LAYOUT_BREAKPOINTS.expandedMin;
			this.viewportWidth = normalizedWidth;
			this.tier = layoutTierFromWidth(normalizedWidth);
		};

		const readViewportWidth = (): number => {
			if (root.clientWidth > 0) return root.clientWidth;
			return window.innerWidth;
		};

		const scheduleWidthUpdate = (nextWidth: number): void => {
			if (this.resizeDebounceHandle !== null) {
				clearTimeout(this.resizeDebounceHandle);
			}
			this.resizeDebounceHandle = setTimeout(() => {
				this.resizeDebounceHandle = null;
				applyWidth(nextWidth);
			}, LAYOUT_RESIZE_DEBOUNCE_MS);
		};

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			scheduleWidthUpdate(entry?.contentRect.width ?? readViewportWidth());
		});

		const handleWindowResize = (): void => {
			scheduleWidthUpdate(readViewportWidth());
		};

		observer.observe(root);
		window.addEventListener('resize', handleWindowResize);
		applyWidth(readViewportWidth());

		this.teardown = () => {
			window.removeEventListener('resize', handleWindowResize);
			observer.disconnect();
			if (this.resizeDebounceHandle !== null) {
				clearTimeout(this.resizeDebounceHandle);
				this.resizeDebounceHandle = null;
			}
			this.teardown = null;
		};
	}

	dispose(): void {
		this.teardown?.();
	}
}

export const layoutState = new LayoutState();
