import { useMemo } from 'react';
import { estimateRouteTravel, findTravelPace } from '@dndtools/core';
import { Icon } from '../../ds';
import { T } from '../screen-kit';
import type { MapEditorApi } from './useMapEditor';
import { ROUTE_PACE_LABELS, TOOLS_BY_ID } from './tools';
import { useI18n } from '../../i18n';
import type { MessageKey, MessageValues } from '../../i18n';

/**
 * MAP-021 — the editor status bar: active tool · active layer · zoom% · cursor x,y · N selected · a
 * one-line hint. A calm, always-present readout so the DM never has to guess what a click will do.
 *
 * RC-MAP-3.7 adds the TRAVEL readout: when the selection is a route, the bar states how far it runs
 * in the map's own scale units and how long the party is on it at the chosen pace. It sits here
 * rather than in a panel because the number is the whole point of drawing the line, and a DM asked
 * "how long to the coast?" mid-session should not have to open anything to answer.
 */
export function StatusBar({
	editor,
	cursor,
	activeLayerName,
}: {
	editor: MapEditorApi;
	cursor: { x: number; y: number } | null;
	activeLayerName: string | null;
}) {
	const { t, locale } = useI18n();
	const def = TOOLS_BY_ID.get(editor.tool);
	const travel = useMemo(() => {
		const route = editor.map?.routes.find((candidate) => editor.selection.includes(candidate.id));
		if (!route) return null;
		return estimateRouteTravel(
			route,
			findTravelPace(editor.travelPaces, editor.options.travelPace),
		);
	}, [editor.map, editor.selection, editor.travelPaces, editor.options.travelPace]);

	// A distance reads to one decimal at most: the pace table is an approximation and the DM is
	// eyeballing a hand-drawn line, so "12.4 miles" is the honest precision and "12.4213" is noise.
	const distanceText =
		travel && travel.distance !== null && travel.distanceUnit !== null
			? t('mapEditor.travelDistance', {
					distance: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
						travel.distance,
					),
					unit: travel.distanceUnit,
				})
			: null;
	const travelText = travelReading(travel, t, locale);
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 16,
				padding: '5px 14px',
				borderTop: `1px solid ${T.bd}`,
				background: T.surf,
				font: `10.5px ${T.mono}`,
				color: T.ter,
				flex: '0 0 auto',
				flexWrap: 'wrap',
			}}
		>
			<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
				<Icon name={def?.icon ?? 'tool-select'} size={12} color={T.ter} />
				{def ? t(def.label) : editor.tool}
			</span>
			<span>{t('mapEditor.layerName', { name: activeLayerName ?? '—' })}</span>
			<span>{Math.round(editor.zoom * 100)}%</span>
			<span>
				x {cursor ? cursor.x.toFixed(3) : '—'} · y {cursor ? cursor.y.toFixed(3) : '—'}
			</span>
			{editor.selection.length > 0 && (
				<span style={{ color: T.acc }}>
					{t('mapEditor.selectedCount', { count: editor.selection.length })}
				</span>
			)}
			{travel && (
				<span
					aria-label={t('mapEditor.travelReadout')}
					style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.ink }}
				>
					<Icon name="tool-route" size={12} color={T.ter} />
					{distanceText}
					{distanceText && travelText ? <span aria-hidden>·</span> : null}
					{travelText}
				</span>
			)}
			<div style={{ flex: 1 }} />
			<span
				style={{
					maxWidth: '48%',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					fontFamily: T.sans,
				}}
			>
				{def ? t(def.hint) : null}
			</span>
		</div>
	);
}

/**
 * The travel half of the readout: an estimate, or an honest reason there is none. A map with no
 * scale, or one scaled in feet while the pace is stated in miles a day, says so rather than
 * dividing anyway — a fabricated "0.1 days" would be worse than a blank.
 */
function travelReading(
	travel: ReturnType<typeof estimateRouteTravel> | null,
	t: (key: MessageKey, values?: MessageValues) => string,
	locale: string,
): string | null {
	if (!travel) return null;
	if (travel.duration) {
		const time = t(
			travel.duration.unit === 'days' ? 'mapEditor.travelDays' : 'mapEditor.travelHours',
			{ value: travel.duration.value },
		);
		return t('mapEditor.travelAtPace', {
			time,
			pace: t(ROUTE_PACE_LABELS[travel.pace.key]).toLocaleLowerCase(locale),
		});
	}
	if (travel.unavailable === 'scale-unit') {
		return t('mapEditor.travelUnitMismatch', { unit: travel.pace.unit });
	}
	return t('mapEditor.travelNoScale');
}
