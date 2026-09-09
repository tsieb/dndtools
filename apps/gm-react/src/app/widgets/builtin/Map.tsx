import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
	deliveredMapIdsForActor,
	getMapViewForActor,
	listMapsForActor,
	queryMapLayers,
	type MapView,
} from '@dndtools/core';
import { IconButton, Select, Toaster } from '../../../ds';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import { T } from '../../screen-kit';
import { MapCanvas } from '../../map/canvas/MapCanvas';
import { clamp01 } from '../../map/mapVocab';
import { pickRasterAssetId } from '../../mapGeometry';
import type { BoardWidget } from '../../board-helpers';
import { Muted, bodyWrap, cfg, type WidgetCommandHandler } from '../../widget-body-kit';

/**
 * RC-CAN-4.5 — the MAP TILE. The `map` widget used to draw a cover-cropped `<img>` of the bound
 * map's raster and a line of counts, which is a picture of a map rather than a map: no pan, no zoom,
 * no fight on it, and nothing the DM could act on without leaving the board.
 *
 * This renders the real thing through the SAME renderer the Atlas and the map editor use
 * (`MapCanvas`), reading the SAME actor-filtered query (`getMapViewForActor`). Every visibility
 * decision therefore stays in the core: fog, hidden layers, hidden POIs and combatants a player may
 * not see are already absent from the view this tile receives, so projecting a map tile into a
 * player view obeys fog for exactly the reason the Atlas does — the player's runtime asks the query
 * as the player and gets a fogged view back (`packages/core/src/queries/map-query.ts`).
 *
 * The combat overlay is `MapCanvas`'s read-only `CombatOverlay` (RC-MAP-2.3), fed by
 * `MapView.combatTokens`. It is synced with the tracker by construction: the tokens ARE the running
 * combat's combatants, joined by the core through the tracker's own visibility rule, so a turn
 * advancing or a combatant being removed moves the tile without a second subscription. When the
 * overlay is switched off the tile asks the query WITHOUT `{ combat }`, so there is no list to leak
 * rather than a list that is merely not drawn.
 *
 * Edit mode stays inert, like every other body: `onCommand` is absent there, so the tile draws the
 * map and nothing else. The actions below only appear in VIEW mode, and only for a DM — a player
 * cannot configure a widget or project to the table, and a control that could only ever be refused
 * would be a dead control.
 */

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
/** Fraction of the visible width one arrow press slides the view (scaled by zoom). */
const PAN_STEP = 0.12;

function zoomed(zoom: number, delta: number): number {
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(zoom + delta).toFixed(2)));
}

/**
 * Where the party is standing, for the `followParty` option. Combat tokens of kind `character` are
 * the party in a running fight; outside one, the placed map tokens that are linked to an actor are.
 * Both lists are already actor-filtered, so following the party can never pull the view onto a
 * combatant this actor may not see. No party ⇒ null, and the view simply does not follow.
 */
function partyCentre(view: MapView | null): { x: number; y: number } | null {
	if (!view) return null;
	const points = view.combatTokens
		.filter((token) => token.kind === 'character')
		.map((token) => token.position);
	if (points.length === 0) {
		for (const token of view.tokens) if (token.linkedActorId) points.push(token.position);
	}
	if (points.length === 0) return null;
	const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
	return { x: clamp01(sum.x / points.length), y: clamp01(sum.y / points.length) };
}

export function MapTile({
	widget,
	onCommand,
}: {
	widget: BoardWidget;
	/** Present only in VIEW mode (SceneBoardCanvas). Its absence is what keeps edit mode inert. */
	onCommand?: WidgetCommandHandler;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const { maps, permissions, session, scenes } = runtime.state;
	const isDm = permissions.actors[actorId]?.role === 'dm';
	const interactive = onCommand !== undefined;

	const overlayOn = cfg<boolean>(widget, 'combatOverlay') !== false;
	const followParty = cfg<boolean>(widget, 'followParty') === true;
	const initialZoom = Number(cfg<number>(widget, 'initialZoom') ?? 1) || 1;

	const [zoom, setZoom] = useState(() => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, initialZoom)));
	const [centre, setCentre] = useState({ x: 0.5, y: 0.5 });
	// The configured zoom is the tile's STARTING view, not a lock: re-configuring it in the inspector
	// re-frames the tile, but a DM who has since panned/zoomed by hand keeps their framing.
	const configuredZoom = useRef(initialZoom);
	useEffect(() => {
		if (configuredZoom.current === initialZoom) return;
		configuredZoom.current = initialZoom;
		setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, initialZoom)));
		setCentre({ x: 0.5, y: 0.5 });
	}, [initialZoom]);

	const boundId = widget.bindingRef?.entityType === 'map' ? widget.bindingRef.entityId : null;
	const view = useMemo(() => {
		if (!boundId) return null;
		const result = getMapViewForActor(maps, permissions, actorId, boundId, {
			deliveredMapIds: deliveredMapIdsForActor(session, actorId),
			// Fail closed: no combat slice passed ⇒ the view carries no combat tokens at all.
			combat: overlayOn ? session.combat : undefined,
		});
		return result.kind === 'available' ? result : null;
	}, [boundId, maps, permissions, actorId, session, overlayOn]);
	const layers = useMemo(
		() => (boundId ? queryMapLayers(maps, permissions, actorId, { mapId: boundId }).layers : []),
		[boundId, maps, permissions, actorId],
	);
	const rasterAssetId = useMemo(
		() => (view ? pickRasterAssetId(maps.maps[view.mapId]?.assetIds ?? [], maps.assets) : null),
		[view, maps],
	);
	const party = useMemo(() => (followParty ? partyCentre(view) : null), [followParty, view]);
	const shownCentre = party ?? centre;

	/** The scene this instance lives on — `scene.configure-widget` addresses widgets by scene. */
	const sceneId = useMemo(() => {
		for (const scene of Object.values(scenes.scenes)) {
			if (scene.widgets.some((instance) => instance.id === widget.id)) return scene.id;
		}
		return null;
	}, [scenes, widget.id]);

	const choices = useMemo(
		() => (isDm && interactive ? listMapsForActor(maps, permissions, actorId) : []),
		[isDm, interactive, maps, permissions, actorId],
	);

	async function run(
		command: Parameters<typeof runtime.dispatch>[0],
		ok?: string,
	): Promise<boolean> {
		const result = await runtime.dispatch(command);
		if (result.status === 'accepted') {
			if (ok) Toaster.success(ok);
			return true;
		}
		Toaster.error(result.rejection.message);
		return false;
	}

	function changeMap(mapId: string): void {
		if (!sceneId || !mapId) return;
		void run(
			{
				type: 'scene.configure-widget',
				actorId,
				payload: {
					sceneId,
					widgetInstanceId: widget.id,
					binding: {
						source: { entityType: 'map', entityId: mapId },
						mode: 'read',
						requiredCapability: 'viewer',
					},
				},
			},
			t('widgetBody.map.mapChanged'),
		);
	}

	function toggleOverlay(): void {
		if (!sceneId) return;
		void run(
			{
				type: 'scene.configure-widget',
				actorId,
				payload: {
					sceneId,
					widgetInstanceId: widget.id,
					configuration: { ...widget.configuration, combatOverlay: !overlayOn },
				},
			},
			overlayOn ? t('widgetBody.map.overlayHidden') : t('widgetBody.map.overlayShown'),
		);
	}

	function openInEditor(): void {
		if (!view) return;
		// A HashRouter navigation, the same `#/atlas?map=…` deep link the palette and the editor's
		// copy-link write (`screens/atlas/index.tsx`). Done through the hash rather than `useNavigate`
		// so a widget body never requires a Router in the tree to render.
		globalThis.location.hash = `#/atlas?map=${encodeURIComponent(view.mapId)}`;
	}

	async function projectToPlayers(): Promise<void> {
		if (!view) return;
		const players = Object.values(permissions.actors).filter((actor) => actor.role === 'player');
		if (players.length === 0) {
			Toaster.warning(t('projection.noPlayers'));
			return;
		}
		// Projection is defined on the session's ACTIVE map, so staging this map is half of the verb —
		// and it is the half that explains why the session screen now agrees with the tile.
		const staged = await run({
			type: 'session.set-active-map',
			actorId,
			payload: { mapId: view.mapId },
		});
		if (!staged) return;
		await run(
			{
				type: 'session.project-active-map',
				actorId,
				payload: { playerActorIds: players.map((player) => player.id) },
			},
			t('projection.mapProjected'),
		);
	}

	/** Arrow keys pan, `+`/`-` zoom, `0` refits — the keyboard equivalent of the drag and the cluster. */
	function onRegionKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
		const step = PAN_STEP / zoom;
		const pan = (dx: number, dy: number) => {
			setCentre((c) => ({ x: clamp01(c.x + dx), y: clamp01(c.y + dy) }));
		};
		switch (event.key) {
			case 'ArrowLeft':
				pan(-step, 0);
				break;
			case 'ArrowRight':
				pan(step, 0);
				break;
			case 'ArrowUp':
				pan(0, -step);
				break;
			case 'ArrowDown':
				pan(0, step);
				break;
			case '+':
			case '=':
				setZoom((z) => zoomed(z, ZOOM_STEP));
				break;
			case '-':
				setZoom((z) => zoomed(z, -ZOOM_STEP));
				break;
			case '0':
				setZoom(ZOOM_MIN);
				setCentre({ x: 0.5, y: 0.5 });
				break;
			default:
				return;
		}
		// The board canvas binds the arrow keys to moving the widget itself; inside the map they belong
		// to the map.
		event.preventDefault();
		event.stopPropagation();
	}

	const actions =
		interactive && isDm && sceneId ? (
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
				{choices.length > 0 && (
					<div style={{ flex: '1 1 120px', minWidth: 100 }}>
						<Select
							aria-label={t('widgetBody.map.changeMap')}
							value={view?.mapId ?? ''}
							options={[
								...(view ? [] : [{ value: '', label: t('widgetBody.map.chooseMap') }]),
								...choices.map((entry) => ({ value: entry.id, label: entry.name })),
							]}
							onChange={(e: { target: { value: string } }) => changeMap(e.target.value)}
						/>
					</div>
				)}
				<IconButton
					icon={overlayOn ? 'visibility-players' : 'visibility-hidden'}
					label={overlayOn ? t('widgetBody.map.overlayOff') : t('widgetBody.map.overlayOn')}
					variant="outline"
					size="sm"
					onClick={toggleOverlay}
				/>
				<IconButton
					icon="edit"
					label={t('widgetBody.map.openInEditor')}
					variant="outline"
					size="sm"
					disabled={!view}
					onClick={openInEditor}
				/>
				<IconButton
					icon="visibility-shared"
					label={t('projection.toPlayers')}
					variant="outline"
					size="sm"
					disabled={!view || session.workflow !== 'active'}
					onClick={() => void projectToPlayers()}
				/>
			</div>
		) : null;

	if (widget.requiresBinding && widget.status !== 'available') {
		return (
			<div style={bodyWrap}>
				<Muted>{t('widgetBody.map.noBinding')}</Muted>
				{actions}
			</div>
		);
	}
	if (!view) {
		return (
			<div style={bodyWrap}>
				<Muted>{isDm ? t('widgetBody.map.missingDm') : t('widgetBody.map.missingPlayer')}</Muted>
				{actions}
			</div>
		);
	}

	return (
		<div style={{ ...bodyWrap, gap: 6 }} data-testid="map-tile">
			<div
				role="group"
				aria-label={t('widgetBody.map.viewRegion', { name: view.name })}
				tabIndex={interactive ? 0 : undefined}
				onKeyDown={interactive ? onRegionKeyDown : undefined}
				// Keeps a drag-to-pan and a press inside the tile from also reaching the board canvas
				// underneath, which would deselect or start moving the widget.
				onPointerDown={interactive ? (e) => e.stopPropagation() : undefined}
				style={{ flex: 1, minHeight: 64, position: 'relative', borderRadius: 'var(--radius-sm)' }}
			>
				<MapCanvas
					view={view}
					layers={layers}
					isDm={isDm}
					zoom={zoom}
					center={shownCentre}
					rasterAssetId={rasterAssetId}
					// The pan tool is the ONLY gesture the tile enables; markers stay non-interactive and
					// nothing here can author. Following the party owns the centre, so hand-panning is off
					// while it does.
					editable={interactive && !party}
					tool="pan"
					onPan={party ? undefined : setCentre}
					compactCombat
					height="100%"
					style={{ borderRadius: 'var(--radius-sm)' }}
				>
					{interactive && (
						<div
							style={{
								position: 'absolute',
								right: 6,
								bottom: 6,
								display: 'flex',
								flexDirection: 'column',
								gap: 4,
								zIndex: 6,
							}}
						>
							<IconButton
								icon="zoom-in"
								label={t('atlas.zoomIn')}
								variant="outline"
								size="sm"
								disabled={zoom >= ZOOM_MAX}
								onClick={() => setZoom((z) => zoomed(z, ZOOM_STEP))}
							/>
							<IconButton
								icon="zoom-out"
								label={t('atlas.zoomOut')}
								variant="outline"
								size="sm"
								disabled={zoom <= ZOOM_MIN}
								onClick={() => setZoom((z) => zoomed(z, -ZOOM_STEP))}
							/>
							<IconButton
								icon="zoom-fit"
								label={t('atlas.fit')}
								variant="outline"
								size="sm"
								onClick={() => {
									setZoom(ZOOM_MIN);
									setCentre({ x: 0.5, y: 0.5 });
								}}
							/>
						</div>
					)}
				</MapCanvas>
			</div>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					font: `var(--text-xs)/1.5 ${T.sans}`,
					color: T.ter,
				}}
			>
				<span data-testid="map-tile-summary">
					{view.name} · {t('widgetBody.map.pois', { count: view.pois.length })}
					{overlayOn && view.combatTokens.length > 0
						? ` · ${t('widgetBody.map.inFight', { count: view.combatTokens.length })}`
						: ''}
					{party ? ` · ${t('widgetBody.map.following')}` : ''}
				</span>
			</div>
			{actions}
		</div>
	);
}
