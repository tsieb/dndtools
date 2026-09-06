import { useEffect, useState } from 'react';
import type {
	MapLayerCategory,
	MapLayerView,
	MapPoiView,
	MapRouteView,
	MapTokenView,
} from '@dndtools/core';
import { Button, DataTable, Input, VisibilityChip } from '../../ds';
import { T, eb } from '../screen-kit';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import type { MapEditorApi } from './useMapEditor';
import { VIS_CHIP } from './mapVisibility';

/**
 * RC-MAP-4.1 — the map editor's LIST view: the same map the canvas draws, as an inventory a screen
 * reader (or a keyboard-only DM) can actually work through.
 *
 * The canvas is a `role="application"` drawing surface. That is the right role for a pointer-driven
 * authoring tool, but it means assistive technology hands every key to the app and stops describing
 * the content, so the POIs, tokens, routes and layers on a map were reachable only by sighted
 * pointing. This view is the equivalent, non-visual path: four real tables with row headers, counts
 * in each table's accessible name, a "Navigate to" per row that moves the viewport and selects the
 * object, and — for the two kinds a DM renames most — the label editable IN PLACE, so an inventory
 * pass never has to cross to the Inspector.
 *
 * Every mutation goes through `editor.run` (a core command; the list mints nothing and mutates no
 * state of its own) and every accepted mutation is spoken through the editor's one live region.
 * Reads are `editor.map`, which is the actor-filtered `getMapViewForActor` projection — a player
 * previewing the map gets a list with the hidden rows already absent, not a list it has to censor.
 */

const cellButton = { whiteSpace: 'nowrap' as const };

/** Layer category → its catalog key. Message keys are dotted alphanumeric paths (i18n/index.test.ts),
 *  so the two hyphenated core categories cannot be interpolated straight into a key. */
const CATEGORY_KEY: Record<MapLayerCategory, MessageKey> = {
	base: 'mapList.category.base',
	terrain: 'mapList.category.terrain',
	roads: 'mapList.category.roads',
	poi: 'mapList.category.poi',
	fog: 'mapList.category.fog',
	'dm-annotations': 'mapList.category.dmAnnotations',
	'player-overlay': 'mapList.category.playerOverlay',
};

/** A label cell that edits in place and dispatches once, on commit (blur or Enter). */
function LabelCell({
	value,
	label,
	onCommit,
}: {
	value: string;
	label: string;
	onCommit: (next: string) => void;
}) {
	// `null` means "follow the durable value", so an edit made elsewhere still shows up here.
	const [draft, setDraft] = useState<string | null>(null);
	useEffect(() => {
		setDraft(null);
	}, [value]);
	const shown = draft ?? value;
	const commit = () => {
		if (draft === null) return;
		const next = draft.trim();
		setDraft(null);
		if (next && next !== value) onCommit(next);
	};
	return (
		<Input
			value={shown}
			aria-label={label}
			onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
				if (e.key !== 'Enter') return;
				e.preventDefault();
				commit();
			}}
			style={{ minWidth: 140 }}
		/>
	);
}

function Section({
	title,
	count,
	hidden,
	children,
}: {
	title: string;
	count: number;
	hidden: number;
	children: React.ReactNode;
}) {
	const { t } = useI18n();
	return (
		<section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
			<h2 style={{ ...eb, margin: 0 }}>
				{title}
				{' · '}
				{count}
				{hidden > 0 && (
					<span style={{ color: T.ter, textTransform: 'none', letterSpacing: 0 }}>
						{' '}
						{t('mapList.hiddenSuffix', { count: hidden })}
					</span>
				)}
			</h2>
			{children}
		</section>
	);
}

/** Normalized position as a stable, readable pair — the same 0..1 space the canvas stores. */
const pos = (p: { x: number; y: number }) => `${p.x.toFixed(2)}, ${p.y.toFixed(2)}`;

export function ListView({
	editor,
	announce,
	onNavigate,
}: {
	editor: MapEditorApi;
	announce: (message: string) => void;
	/** Called after a "Navigate to" so the shell can put the canvas back in front of the DM. */
	onNavigate: () => void;
}) {
	const { t } = useI18n();
	const { map, layers, actorId, mapId, run } = editor;
	const layerName = (id: string) =>
		layers.find((l) => l.layerId === id)?.name ?? t('mapList.unknownLayer');

	const goTo = (point: { x: number; y: number }, id: string | null, name: string) => {
		if (id) editor.setSelection([id]);
		editor.setCenter(point);
		announce(t('mapList.navigated', { name }));
		onNavigate();
	};

	const poiColumns = [
		{
			key: 'label',
			header: t('mapList.column.label'),
			strong: true,
			render: (_v: unknown, row: MapPoiView) => (
				<LabelCell
					value={row.label}
					label={t('mapList.editPoiLabel', { name: row.label })}
					onCommit={(next) => {
						void run({
							type: 'map.update-poi',
							actorId,
							payload: { mapId, poiId: row.id, label: next },
						} as never).then((accepted) => {
							if (accepted) announce(t('mapList.renamed', { name: next }));
						});
					}}
				/>
			),
		},
		{
			key: 'category',
			header: t('mapList.column.category'),
			render: (_v: unknown, row: MapPoiView) =>
				t(`mapInspector.poiCategory.${row.category}` as MessageKey),
		},
		{
			key: 'visibility',
			header: t('common.visibility.label'),
			render: (_v: unknown, row: MapPoiView) => (
				<VisibilityChip level={VIS_CHIP[row.visibility] ?? 'dm-only'} />
			),
		},
		{
			key: 'layerId',
			header: t('mapList.column.layer'),
			render: (_v: unknown, row: MapPoiView) => layerName(row.layerId),
		},
		{
			key: 'position',
			header: t('mapList.column.position'),
			mono: true,
			render: (_v: unknown, row: MapPoiView) => pos(row.position),
		},
		{
			key: 'go',
			header: t('mapList.column.actions'),
			render: (_v: unknown, row: MapPoiView) => (
				<Button
					variant="secondary"
					size="sm"
					style={cellButton}
					aria-label={t('mapList.navigateTo', { name: row.label })}
					onClick={() => goTo(row.position, row.id, row.label)}
				>
					{t('mapList.navigate')}
				</Button>
			),
		},
	];

	const tokenColumns = [
		{
			key: 'label',
			header: t('mapList.column.label'),
			strong: true,
			render: (_v: unknown, row: MapTokenView) => (
				<LabelCell
					value={row.label}
					label={t('mapList.editTokenLabel', { name: row.label })}
					onCommit={(next) => {
						void run({
							type: 'map.update-token',
							actorId,
							payload: { mapId, tokenId: row.id, label: next },
						} as never).then((accepted) => {
							if (accepted) announce(t('mapList.renamed', { name: next }));
						});
					}}
				/>
			),
		},
		{
			key: 'visibility',
			header: t('common.visibility.label'),
			render: (_v: unknown, row: MapTokenView) => (
				<VisibilityChip level={VIS_CHIP[row.visibility] ?? 'dm-only'} />
			),
		},
		{
			key: 'layerId',
			header: t('mapList.column.layer'),
			render: (_v: unknown, row: MapTokenView) => layerName(row.layerId),
		},
		{
			key: 'position',
			header: t('mapList.column.position'),
			mono: true,
			render: (_v: unknown, row: MapTokenView) => pos(row.position),
		},
		{
			key: 'go',
			header: t('mapList.column.actions'),
			render: (_v: unknown, row: MapTokenView) => (
				<Button
					variant="secondary"
					size="sm"
					style={cellButton}
					aria-label={t('mapList.navigateTo', { name: row.label })}
					onClick={() => goTo(row.position, row.id, row.label)}
				>
					{t('mapList.navigate')}
				</Button>
			),
		},
	];

	const routeColumns = [
		{ key: 'label', header: t('mapList.column.label'), strong: true },
		{
			key: 'visibility',
			header: t('common.visibility.label'),
			render: (_v: unknown, row: MapRouteView) => (
				<VisibilityChip level={VIS_CHIP[row.visibility] ?? 'dm-only'} />
			),
		},
		{
			key: 'waypoints',
			header: t('mapList.column.waypoints'),
			mono: true,
			align: 'right',
			render: (_v: unknown, row: MapRouteView) => String(row.waypoints.length),
		},
		{
			key: 'distance',
			header: t('mapList.column.distance'),
			mono: true,
			render: (_v: unknown, row: MapRouteView) =>
				row.measurement.distance === null
					? t('mapList.noScale')
					: `${row.measurement.distance.toFixed(1)} ${row.measurement.distanceUnit ?? ''}`.trim(),
		},
		{
			key: 'go',
			header: t('mapList.column.actions'),
			render: (_v: unknown, row: MapRouteView) => {
				const first = row.waypoints[0];
				if (!first) return null;
				return (
					<Button
						variant="secondary"
						size="sm"
						style={cellButton}
						aria-label={t('mapList.navigateTo', { name: row.label })}
						onClick={() => goTo(first.position, row.id, row.label)}
					>
						{t('mapList.navigate')}
					</Button>
				);
			},
		},
	];

	// Layers are read-only here on purpose: renaming, reordering, locking and deleting a layer is the
	// Layers panel's job and duplicating those writes would give the same command two owners. What the
	// inventory adds is "which layer am I authoring onto", which is a piece of editor state, not a
	// durable mutation.
	const layerColumns = [
		{ key: 'name', header: t('mapList.column.name'), strong: true },
		{
			key: 'category',
			header: t('mapList.column.category'),
			render: (_v: unknown, row: MapLayerView) => t(CATEGORY_KEY[row.category]),
		},
		{
			key: 'visibility',
			header: t('common.visibility.label'),
			render: (_v: unknown, row: MapLayerView) => (
				<VisibilityChip level={VIS_CHIP[row.visibility] ?? 'dm-only'} />
			),
		},
		{
			key: 'enabled',
			header: t('mapList.column.shown'),
			render: (_v: unknown, row: MapLayerView) =>
				row.enabled ? t('mapList.shown.yes') : t('mapList.shown.no'),
		},
		{
			key: 'go',
			header: t('mapList.column.actions'),
			render: (_v: unknown, row: MapLayerView) =>
				editor.activeLayerId === row.id ? (
					<span style={{ color: T.ter }}>{t('mapList.activeLayer')}</span>
				) : (
					<Button
						variant="secondary"
						size="sm"
						style={cellButton}
						aria-label={t('mapList.makeActiveLayer', { name: row.name })}
						onClick={() => {
							editor.setActiveLayerId(row.id);
							announce(t('mapList.activeLayerSet', { name: row.name }));
						}}
					>
						{t('mapList.makeActive')}
					</Button>
				),
		},
	];

	const counts = {
		pois: map.pois.length,
		tokens: map.tokens.length,
		routes: map.routes.length,
		layers: map.layers.length,
	};

	return (
		<div
			role="region"
			aria-label={t('mapList.regionLabel', {
				name: map.name,
				pois: counts.pois,
				tokens: counts.tokens,
				routes: counts.routes,
				layers: counts.layers,
			})}
			style={{
				position: 'absolute',
				inset: 0,
				overflowY: 'auto',
				padding: 16,
				display: 'flex',
				flexDirection: 'column',
				gap: 20,
				background: T.bg,
			}}
		>
			<p style={{ margin: 0, font: `13px ${T.sans}`, color: T.sub }}>
				{t('mapList.summary', {
					pois: counts.pois,
					tokens: counts.tokens,
					routes: counts.routes,
					layers: counts.layers,
				})}
			</p>

			<Section title={t('mapList.pois')} count={counts.pois} hidden={map.hidden.pois}>
				<DataTable
					columns={poiColumns}
					rows={map.pois}
					rowKey={(row: MapPoiView) => row.id}
					ariaLabel={t('mapList.poiTable', { count: counts.pois })}
					empty={t('mapList.noPois')}
				/>
			</Section>

			<Section title={t('mapList.tokens')} count={counts.tokens} hidden={map.hidden.tokens}>
				<DataTable
					columns={tokenColumns}
					rows={map.tokens}
					rowKey={(row: MapTokenView) => row.id}
					ariaLabel={t('mapList.tokenTable', { count: counts.tokens })}
					empty={t('mapList.noTokens')}
				/>
			</Section>

			<Section title={t('mapList.routes')} count={counts.routes} hidden={map.hidden.routes}>
				<DataTable
					columns={routeColumns}
					rows={map.routes}
					rowKey={(row: MapRouteView) => row.id}
					ariaLabel={t('mapList.routeTable', { count: counts.routes })}
					empty={t('mapList.noRoutes')}
				/>
			</Section>

			<Section title={t('mapList.layers')} count={counts.layers} hidden={map.hidden.layers}>
				<DataTable
					columns={layerColumns}
					rows={map.layers}
					rowKey={(row: MapLayerView) => row.id}
					ariaLabel={t('mapList.layerTable', { count: counts.layers })}
					empty={t('mapList.noLayers')}
				/>
			</Section>
		</div>
	);
}
