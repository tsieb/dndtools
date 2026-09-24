import type { MapFeature, MapLayer } from '@dndtools/core';
import { useCallback, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { type MapTool } from '../mapVisibility';
import { clamp01 } from '../mapVocab';
import { ROUTE_DEFAULT_NAME } from '../tools';
import type { MapEditorApi } from '../useMapEditor';
import { PATH_TOOLS, Pt } from './editorCanvasTypes';
import { usePoiPopoverDismissal } from './EditorPoiPopover';
import { useEditorCanvasNavigation } from './useEditorCanvasNavigation';
import { useMapMarkerActions } from './useMapMarkerActions';
export function useEditorCanvas({
	editor,
	previewLayers,
	announce,
	rasterAssetId,
	onCursor,
	quickMapMode = false,
}: {
	editor: MapEditorApi;
	previewLayers: MapLayer[] | null;
	announce: (message: string) => void;
	rasterAssetId: string | null;
	onCursor: (p: Pt | null) => void;
	quickMapMode?: boolean;
}) {
	const {
		t,
		tool,
		options,
		zoom,
		center,
		layers,
		containerRef,
		zoomRef,
		centerRef,
		gesture,
		gestureRef,
		setG,
		path,
		setPath,
		pathRef,
		hoverPt,
		setHoverPt,
		polyVertexCount,
		setPolyVertexCount,
		spacePan,
		contextMenu,
		setContextMenu,
		isDrawing,
		activeId,
		fogLayerId,
		toMap,
		pinching,
		navigationEpoch,
		onTouchDownCapture,
		onTouchMoveCapture,
		endTouchCapture,
		onContextMenu,
		snap,
	} = useEditorCanvasNavigation({
		editor,
		previewLayers,
		announce,
		rasterAssetId,
		onCursor,
		quickMapMode,
	});

	// ── path tools: Enter finishes, Esc cancels ──────────────────────────────────────────────────
	useEffect(() => {
		if (path.length === 0) return;
		// Bound on `document` in the CAPTURE phase with stopPropagation, so without this guard (which
		// the Space-pan listener above already has) Enter in the map-name field or the Search box
		// finished the in-progress wall path and never reached the input at all.
		const isTypingTarget = (t: EventTarget | null) => {
			const el = t as HTMLElement | null;
			return (
				!!el &&
				(['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable === true)
			);
		};
		const onKey = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return;
			if (e.key === 'Enter') {
				e.preventDefault();
				e.stopPropagation();
				finishPath();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				setPath([]);
			}
		};
		document.addEventListener('keydown', onKey, true);
		return () => document.removeEventListener('keydown', onKey, true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [path.length, tool, options.waterKind]);

	// ── incremental dispatch helpers ──────────────────────────────────────────────────────────────
	// `editor.run` is SINGLE-FLIGHT: it returns false immediately while another command is in flight,
	// and false again when the core rejects (a locked layer, a permission ceiling). Every caller here
	// used to fire it with `void` and then announce success on the very next line, so the live region
	// said "Painted terrain." / "Room added." when nothing had been added — for a DM working by ear the
	// editor was unfalsifiable. Take the message here and announce it only once the write lands.
	const addFeatures = useCallback(
		(features: MapFeature[], okMessage?: string) => {
			if (!activeId || features.length === 0) return;
			void editor
				.run({
					type: 'map.add-features',
					actorId: editor.actorId,
					payload: { mapId: editor.mapId, layerId: activeId, features },
				} as never)
				.then((accepted) => {
					if (accepted && okMessage) announce(okMessage);
				});
		},
		[activeId, announce, editor],
	);

	const mkFeature = (
		kind: MapFeature['kind'],
		points: Pt[],
		style: string,
		props?: MapFeature['props'],
	): MapFeature => ({
		id: editor.nextId(kind),
		kind,
		points: points.map((p) => ({ x: p.x, y: p.y })),
		style: style || kind,
		...(props ? { props } : {}),
	});

	function finishPath() {
		const pts = pathRef.current;
		setPath([]);
		if (pts.length < 2) return;
		if (tool === 'wall') {
			addFeatures([mkFeature('wall', pts, 'wall')], t('mapEdit.wallAdded', { count: pts.length }));
		} else if (tool === 'water') {
			addFeatures(
				[
					// Match the generators' river/lake style vocabulary; width alone cannot distinguish them.
					mkFeature(
						'water',
						pts,
						options.waterKind === 'river' ? 'water:river' : 'water:lake',
						options.waterKind === 'river' ? { width: 0.012 } : undefined,
					),
				],
				`${options.waterKind === 'river' ? 'River' : 'Lake'} added.`,
			);
		} else if (tool === 'route') {
			// RC-MAP-3.7: the route carries the name the DM typed into the tool options (blank falls
			// back), and the finished line becomes the SELECTION so the status bar's distance and
			// travel-time readout is about the route they just drew, not about nothing.
			const routeId = editor.nextId('route');
			void editor
				.run({
					type: 'map.create-route',
					actorId: editor.actorId,
					payload: {
						mapId: editor.mapId,
						id: routeId,
						layerId: activeId,
						label: options.routeName.trim() || ROUTE_DEFAULT_NAME,
						visibility: options.newVisibility,
						waypoints: pts.map((p) => ({ id: editor.nextId('wp'), position: { x: p.x, y: p.y } })),
					},
				} as never)
				.then((accepted) => {
					if (!accepted) return;
					editor.setSelection([routeId]);
					announce(t('mapEdit.routeAdded'));
				});
		}
	}

	function eraseAt(pts: Pt[]) {
		const layer = layers.find((l) => l.layerId === activeId);
		if (!layer) return;
		const r = options.brushSize / 2000;
		const hitIds = layer.content
			.filter((f) =>
				f.points.some((fp) => pts.some((sp) => Math.hypot(fp.x - sp.x, fp.y - sp.y) < r)),
			)
			.map((f) => f.id);
		if (hitIds.length === 0) return;
		void editor
			.run({
				type: 'map.remove-features',
				actorId: editor.actorId,
				payload: { mapId: editor.mapId, layerId: activeId, featureIds: hitIds },
			} as never)
			.then((accepted) => {
				if (accepted) announce(t('mapEdit.erased', { count: hitIds.length }));
			});
	}

	function scatterAlong(pts: Pt[]) {
		const density = options.scatterDensity;
		const style = `prop:${options.scatterObject}`;
		const features: MapFeature[] = [];
		for (const p of pts) {
			if (Math.random() > density) continue;
			if (features.length >= 200) break;
			features.push(
				mkFeature(
					'prop',
					[
						{
							x: clamp01(p.x + (Math.random() - 0.5) * 0.02),
							y: clamp01(p.y + (Math.random() - 0.5) * 0.02),
						},
					],
					style,
					{
						scale: 0.7 + Math.random() * 0.6,
					},
				),
			);
		}
		if (features.length > 0) {
			addFeatures(features, t('mapEdit.scattered', { count: features.length }));
		}
	}

	// ── overlay pointer handlers (drawing tools) ──────────────────────────────────────────────────
	const onOverlayDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		const p = toMap(e.clientX, e.clientY);
		if (tool === 'brush' || tool === 'erase' || tool === 'scatter')
			setG({ kind: 'stroke', pts: [p] });
		else if (tool === 'room' || tool === 'marquee')
			setG({ kind: 'rect', start: p, cur: p, square: e.shiftKey });
		else if (tool === 'measure') setG({ kind: 'measure', start: p, cur: p });
	};
	const onOverlayMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		const p = toMap(e.clientX, e.clientY);
		setHoverPt(p);
		onCursor(p);
		const g = gestureRef.current;
		if (!g) return;
		if (g.kind === 'stroke') setG({ kind: 'stroke', pts: [...g.pts, p] });
		else if (g.kind === 'rect') setG({ ...g, cur: p, square: e.shiftKey });
		else if (g.kind === 'measure') setG({ ...g, cur: p });
	};
	const onOverlayUp = (e: ReactPointerEvent<HTMLDivElement>) => {
		const g = gestureRef.current;
		setG(null);
		if (!g) return;
		if (g.kind === 'stroke') {
			if (g.pts.length < 2) return;
			if (tool === 'brush') {
				addFeatures([mkFeature('stroke', g.pts, options.terrainStyle)], t('mapEdit.painted'));
			} else if (tool === 'erase') eraseAt(g.pts);
			else if (tool === 'scatter') scatterAlong(g.pts);
		} else if (g.kind === 'rect') {
			if (tool === 'room') {
				const [a, b] = rectCorners(g.start, g.cur, g.square);
				if (Math.abs(b.x - a.x) < 0.005 || Math.abs(b.y - a.y) < 0.005) return;
				addFeatures(
					[mkFeature('room', [snap(a), snap(b)], options.terrainStyle)],
					t('mapEdit.roomAdded'),
				);
			} else if (tool === 'marquee') {
				selectInRect(g.start, g.cur, e.shiftKey);
			}
		}
	};
	const onOverlayClick = (e: ReactPointerEvent<HTMLDivElement>) => {
		// single-click placement / vertex tools
		const raw = toMap(e.clientX, e.clientY);
		if (tool === 'stamp') {
			addFeatures(
				// RC-MAP-3.1 — the Rotation/Size options ride along into `props`, where both the editor
				// renderer and the player view read them. `scale` multiplies the catalogue default.
				[
					mkFeature('prop', [snap(raw)], options.stampAsset, {
						scale: options.stampScale,
						rotation: options.stampRotation,
					}),
				],
				t('mapEdit.objectPlaced'),
			);
		} else if (tool === 'light') {
			addFeatures(
				[
					mkFeature('light', [snap(raw)], 'light', {
						radius: options.lightRadius,
						color: options.lightColor,
					}),
				],
				t('mapEdit.lightPlaced'),
			);
		} else if (tool === 'door') {
			const c = snap(raw);
			addFeatures(
				[
					mkFeature(
						'door',
						[
							{ x: clamp01(c.x - 0.02), y: c.y },
							{ x: clamp01(c.x + 0.02), y: c.y },
						],
						'door',
						{ portal: options.doorKind, state: 'closed' },
					),
				],
				t('mapEdit.doorPlaced'),
			);
		} else if (tool === 'text') {
			const text = options.labelText.trim();
			addFeatures(
				[mkFeature('text', [snap(raw)], 'text', { text: text || 'Label', size: 3 })],
				t('mapEdit.labelPlaced'),
			);
		} else if (tool === 'fill') {
			const cell = 1 / (editor.map?.overlay?.gridSize ?? 10);
			const a = snap(raw);
			addFeatures(
				[
					mkFeature(
						'fill',
						[a, { x: clamp01(a.x + cell), y: clamp01(a.y + cell) }],
						options.terrainStyle,
					),
				],
				t('mapEdit.cellFilled'),
			);
		} else if (PATH_TOOLS.has(tool)) {
			const last = pathRef.current[pathRef.current.length - 1];
			setPath((prev) => [...prev, snap(raw, last)]);
		}
	};
	const onOverlayDouble = () => {
		if (PATH_TOOLS.has(tool)) finishPath();
	};

	function rectCorners(a: Pt, b: Pt, square: boolean): [Pt, Pt] {
		if (!square) return [a, b];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const s = Math.max(Math.abs(dx), Math.abs(dy));
		return [a, { x: a.x + Math.sign(dx || 1) * s, y: a.y + Math.sign(dy || 1) * s }];
	}

	function selectInRect(a: Pt, b: Pt, additive: boolean) {
		const x0 = Math.min(a.x, b.x);
		const x1 = Math.max(a.x, b.x);
		const y0 = Math.min(a.y, b.y);
		const y1 = Math.max(a.y, b.y);
		const inside = (p: Pt) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
		const ids = [
			...(editor.map?.pois ?? []).filter((p) => inside(p.position)).map((p) => p.id),
			...(editor.map?.tokens ?? []).filter((t) => inside(t.position)).map((t) => t.id),
		];
		editor.setSelection(additive ? [...new Set([...editor.selection, ...ids])] : ids);
		if (ids.length > 0) editor.setDock('inspector');
		announce(t('mapEdit.selected', { count: ids.length }));
	}

	// ── space-pan handlers ─────────────────────────────────────────────────────────────────────────
	const onPanDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		setG({ kind: 'pan', sx: e.clientX, sy: e.clientY, c0: centerRef.current });
	};
	const onPanMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		const g = gestureRef.current;
		if (!g || g.kind !== 'pan') return;
		const r = containerRef.current?.getBoundingClientRect();
		if (!r) return;
		editor.setCenter({
			x: clamp01(g.c0.x - (e.clientX - g.sx) / (r.width * zoomRef.current)),
			y: clamp01(g.c0.y - (e.clientY - g.sy) / (r.height * zoomRef.current)),
		});
	};
	const onPanUp = () => setG(null);

	// ── MapCanvas (renderer + built-in select/pan/poi/token/fog gestures) ───────────────────────────
	const canvasTool: MapTool =
		tool === 'select'
			? 'select'
			: tool === 'pan'
				? 'pan'
				: tool === 'poi'
					? 'poi'
					: tool === 'token'
						? 'token'
						: tool === 'fog'
							? 'fog'
							: 'pan';
	const canvasEditable = editor.isDm && !editor.busy && !isDrawing;

	const selectedId = editor.selection.length === 1 ? editor.selection[0]! : null;
	const selPoiId = editor.map?.pois.some((p) => p.id === selectedId) ? selectedId : null;
	const selTokenId = editor.map?.tokens.some((t) => t.id === selectedId) ? selectedId : null;

	const {
		handleSelectPoi,
		handleSelectToken,
		handlePlace,
		handleFog,
		combatModel,
		combat,
		moveCombatToken,
		onSelectCombatant,
		handleMovePoi,
		handleMoveToken,
	} = useMapMarkerActions(editor, activeId, fogLayerId, announce, quickMapMode);

	// RC-MAP-3.10 — the notes POIs link to, read ACTOR-SCOPED: the popover previews only what the core
	// already decided this actor may see, so a player can never be handed a hidden note's opening lines.
	// RC-MAP-3.10 — the POI popover's dismissal state (see `EditorPoiPopover.tsx` for why a pointer
	// dismissal must not deselect).
	const poiPopover = usePoiPopoverDismissal(selPoiId);

	// measurement readout in real units
	const measureText = (() => {
		if (gesture?.kind !== 'measure') return null;
		const d = Math.hypot(gesture.cur.x - gesture.start.x, gesture.cur.y - gesture.start.y);
		const scale = editor.map?.scale;
		return scale
			? `${(d * scale.unitsPerMap).toFixed(1)} ${scale.unit}`
			: `${(d * 100).toFixed(1)}% of map`;
	})();

	const scaledStyle = {
		position: 'absolute' as const,
		inset: 0,
		transform: `scale(${zoom}) translate(${(0.5 - center.x) * 100}%, ${(0.5 - center.y) * 100}%)`,
		transformOrigin: 'center center',
		pointerEvents: 'none' as const,
	};

	return {
		t,
		tool,
		options,
		zoom,
		center,
		layers,
		containerRef,
		gesture,
		path,
		hoverPt,
		polyVertexCount,
		setPolyVertexCount,
		spacePan,
		contextMenu,
		setContextMenu,
		isDrawing,
		toMap,
		pinching,
		navigationEpoch,
		onTouchDownCapture,
		onTouchMoveCapture,
		endTouchCapture,
		onContextMenu,
		onOverlayDown,
		onOverlayMove,
		onOverlayUp,
		onOverlayClick,
		onOverlayDouble,
		rectCorners,
		onPanDown,
		onPanMove,
		onPanUp,
		canvasTool,
		canvasEditable,
		selPoiId,
		selTokenId,
		handleSelectPoi,
		handleSelectToken,
		handlePlace,
		handleFog,
		combatModel,
		combat,
		moveCombatToken,
		onSelectCombatant,
		handleMovePoi,
		handleMoveToken,
		poiPopover,
		measureText,
		scaledStyle,
	};
}
