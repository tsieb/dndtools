import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { zoomAbout } from './geometry';
import {
	clamp,
	FIT_FLOOR,
	FIXED_PRESET_SCALE,
	ZOOM_PRESETS,
	type View,
	type ZoomPreset,
} from '../SceneBoardModel';

/** A zoom step to announce; `seq` re-keys the live node so a repeated step still speaks. */
export interface ZoomNotice {
	seq: number;
	preset: ZoomPreset;
	percent: number;
}

/**
 * RC-POL-1.2 — the canvas's zoom, out of `SceneBoardCanvas.tsx`. RC-CAN-3.1: the bounded board reads
 * its scale off a named preset (Fit, Comfortable, Detail; Fit stops at `FIT_FLOOR`), while the free
 * canvas keeps a translate and a scale of its own that the wheel, the cluster and the presets move.
 */
export function useCanvasZoom({
	policy,
	wrapRef,
	wrapWidth,
	contentWidth,
	zoomPreset,
	onZoomPresetChange,
}: {
	policy: 'bounded' | 'canvas';
	wrapRef: RefObject<HTMLDivElement | null>;
	wrapWidth: number;
	contentWidth: number;
	zoomPreset?: ZoomPreset;
	onZoomPresetChange?: (preset: ZoomPreset) => void;
}) {
	const [view, setView] = useState<View>({ tx: 32, ty: 32, scale: 1 });
	const paneCentre = useCallback((): [number, number] => {
		const r = wrapRef.current?.getBoundingClientRect();
		return [(r?.width ?? 800) / 2, (r?.height ?? 600) / 2];
	}, [wrapRef]);
	const [localPreset, setLocalPreset] = useState<ZoomPreset>(
		policy === 'bounded' ? 'fit' : 'comfortable',
	);
	const [zoomNotice, setZoomNotice] = useState<ZoomNotice | null>(null);
	const zoomSeq = useRef(0);

	const fitScale = wrapWidth > 0 ? clamp((wrapWidth - 16) / contentWidth, FIT_FLOOR, 1) : 1;
	const scaleForPreset = useCallback(
		(p: ZoomPreset) => (p === 'fit' ? fitScale : FIXED_PRESET_SCALE[p]),
		[fitScale],
	);
	const preset = zoomPreset ?? localPreset;

	const boundedScale = policy === 'bounded' ? scaleForPreset(preset) : 1;
	const scale = policy === 'canvas' ? view.scale : boundedScale;
	const tx = policy === 'canvas' ? view.tx : boundedScale < 1 ? 8 : 0;
	const ty = policy === 'canvas' ? view.ty : boundedScale < 1 ? 8 : 0;
	const overflowsHorizontally = policy === 'bounded' && scale * contentWidth > wrapWidth;

	/** Move to a named step. The bounded board reads its scale straight off the preset; the free
	 *  canvas has a translate to keep honest as well, so it re-frames or re-centres. */
	const applyPreset = useCallback(
		(next: ZoomPreset) => {
			setLocalPreset(next);
			onZoomPresetChange?.(next);
			const s1 = scaleForPreset(next);
			if (policy === 'canvas') {
				if (next === 'fit') setView({ tx: 32, ty: 32, scale: s1 });
				else setView((v) => zoomAbout(v, ...paneCentre(), s1));
			}
		},
		[onZoomPresetChange, policy, scaleForPreset, paneCentre],
	);

	const announcedRef = useRef<ZoomPreset | null>(null);
	useEffect(() => {
		if (announcedRef.current === null || announcedRef.current === preset) {
			announcedRef.current = preset;
			return;
		}
		announcedRef.current = preset;
		zoomSeq.current += 1;
		setZoomNotice({
			seq: zoomSeq.current,
			preset,
			percent: Math.round(scaleForPreset(preset) * 100),
		});
	}, [preset, scaleForPreset]);

	/** `+`/`-` step through the presets from whichever one the current scale sits nearest, and stop
	 *  at the ends: wrapping Detail back round to Fit reads as the control losing its place. */
	const cyclePreset = useCallback(
		(direction: 1 | -1) => {
			const nearest = ZOOM_PRESETS.reduce((best, p) =>
				Math.abs(scaleForPreset(p) - scale) < Math.abs(scaleForPreset(best) - scale) ? p : best,
			);
			const next = ZOOM_PRESETS[clamp(ZOOM_PRESETS.indexOf(nearest) + direction, 0, 2)];
			applyPreset(next);
		},
		[applyPreset, scale, scaleForPreset],
	);
	/** Which step the current scale IS — the free canvas can sit between two of them after a wheel
	 *  zoom, and then no preset is pressed. */
	const activePreset =
		ZOOM_PRESETS.find((p) => Math.abs(scaleForPreset(p) - scale) < 0.005) ?? null;

	const onWheel = useCallback(
		(e: React.WheelEvent) => {
			if (policy !== 'canvas') return;
			if (e.ctrlKey || e.metaKey) {
				const r = wrapRef.current?.getBoundingClientRect();
				if (!r) return;
				const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
				setView((v) =>
					zoomAbout(v, e.clientX - r.left, e.clientY - r.top, clamp(v.scale * factor, 0.4, 1.8)),
				);
			} else {
				const horizontal = e.shiftKey && e.deltaX === 0;
				const dx = horizontal ? e.deltaY : e.deltaX;
				const dy = horizontal ? 0 : e.deltaY;
				setView((v) => ({ ...v, tx: v.tx - dx, ty: v.ty - dy }));
			}
		},
		[policy, wrapRef],
	);

	const zoom = (factor: number) =>
		setView((v) => zoomAbout(v, ...paneCentre(), clamp(v.scale * factor, 0.4, 1.8)));

	return {
		view,
		setView,
		scale,
		tx,
		ty,
		overflowsHorizontally,
		applyPreset,
		cyclePreset,
		activePreset,
		zoomNotice,
		onWheel,
		zoom,
	};
}

/** The pane's width, followed as it changes. A pane that changes width re-scales a Fit board, moving
 *  every tile, so whatever has focus is kept in view across it: closing the Add panel widens the pane
 *  after the gallery has scrolled the new tile into view, and the larger scale would otherwise push
 *  it back off the bottom. */
export function usePaneWidth(wrapRef: RefObject<HTMLDivElement | null>) {
	const [wrapWidth, setWrapWidth] = useState(0);
	useEffect(() => {
		const node = wrapRef.current;
		if (!node) return;
		const update = () => setWrapWidth(node.clientWidth);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		return () => observer.disconnect();
	}, [wrapRef]);

	useLayoutEffect(() => {
		const focused = document.activeElement;
		if (focused instanceof HTMLElement && wrapRef.current?.contains(focused)) {
			focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}
	}, [wrapRef, wrapWidth]);
	return wrapWidth;
}
