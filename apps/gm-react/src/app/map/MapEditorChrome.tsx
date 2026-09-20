import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
	markSpotlightSeen,
	parseSeenSpotlights,
	serializeSeenSpotlights,
	spotlightsSeenIn,
	spotlightVaultId,
} from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	matchesMedia,
	PREFERENCE_KEYS,
	readPreference,
	writePreference,
} from '../../platform/preferences';
import { Button, FeatureSpotlight, Icon, SegmentedControl } from '../../ds';
import { T } from '../screen-kit';
import type { MapEditorApi } from './useMapEditor';
import { TOOLS_BY_ID } from './tools';
import { useI18n } from '../../i18n';
import { QuickMapRail } from './QuickMapRail';
import { ShortcutsDialog } from '../help/ShortcutsDialog';

/**
 * The map editor's three small chrome pieces: the phone tool strip, the header menu row and the
 * keyboard-shortcut overlay.
 *
 * Extracted from `MapEditor.tsx` unchanged so that file stays under its RC-STB-2.7 line baseline
 * while RC-UX-1.2 moves its copy into the message catalog.
 */

export function QuickToolStrip({ editor }: { editor: MapEditorApi }) {
	const { t } = useI18n();
	const definition = TOOLS_BY_ID.get(editor.tool);
	const editing = !['pan', 'select'].includes(editor.tool);
	const guidance =
		editor.tool === 'pan'
			? t('mapEditor.guidance.pan')
			: editor.tool === 'select'
				? t('mapEditor.guidance.select')
				: editor.tool === 'generate'
					? t('mapEditor.guidance.generate')
					: t('mapEditor.guidance.editing');
	return (
		<div
			role="status"
			aria-live="polite"
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				flexWrap: 'wrap',
				minHeight: 50,
				padding:
					'6px max(10px, var(--safe-area-right, 0px)) 6px max(10px, var(--safe-area-left, 0px))',
				borderBottom: `1px solid ${T.bd}`,
				background: editing ? T.accSub : T.surf,
				overflow: 'hidden',
			}}
		>
			<span
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 6,
					font: `700 12px ${T.sans}`,
					color: editing ? T.acc : T.ink,
					whiteSpace: 'nowrap',
				}}
			>
				<Icon name={definition?.icon ?? 'tool-select'} size={16} />
				{editor.tool === 'pan' ? t('mapTool.navigate') : definition ? t(definition.label) : null}
				{editing ? t('mapEditor.armed') : ''}
			</span>
			{editor.tool === 'fog' && (
				<SegmentedControl
					ariaLabel={t('toolOptions.fogMode')}
					value={editor.options.fogMode}
					onChange={(value: string) =>
						editor.setOption('fogMode', value as typeof editor.options.fogMode)
					}
					options={[
						{ value: 'reveal', label: t('toolOptions.fog.reveal') },
						{ value: 'conceal', label: t('toolOptions.fog.conceal') },
					]}
				/>
			)}
			<span style={{ flex: 1, minWidth: 150, font: `11.5px ${T.sans}`, color: T.sub }}>
				{guidance}
			</span>
		</div>
	);
}

export function HeaderMenuItem({
	icon,
	label,
	onClick,
}: {
	icon: string;
	label: string;
	onClick: () => void;
}) {
	// Same gap as LayersPanel's MenuItem: no global `button:hover`, and inline styles can't express it,
	// so the editor's header menu highlighted nothing under the cursor.
	const [hov, setHov] = useState(false);
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			onFocus={() => setHov(true)}
			onBlur={() => setHov(false)}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 9,
				padding: '8px 10px',
				borderRadius: 7,
				border: 'none',
				background: hov ? T.hover : 'transparent',
				cursor: 'pointer',
				color: T.ink,
				font: `12.5px ${T.sans}`,
				textAlign: 'left',
			}}
		>
			<Icon name={icon} size={14} color={T.ter} />
			{label}
		</button>
	);
}

export function ShortcutOverlay({ onClose }: { onClose: () => void }) {
	const { t } = useI18n();
	// RC-UX-3.3 — the editor keymap is no longer re-typed here: both this overlay and the keyboard
	// layer read app/shortcuts/registry.ts, whose map entries derive their tool keys from TOOL_GROUPS.
	return <ShortcutsDialog onClose={onClose} scopes={['map']} title={t('mapEditor.shortcuts')} />;
}

/**
 * RC-MAP-4.5 — the first-open editor tour. Mark the whole tour seen on first display, including an
 * interrupted or dismissed tour.
 *
 * The card sits IN FLOW above the workspace rather than floating over it. A floating coach mark
 * would have to be anchored somewhere, and every anchor in this editor covers something the DM is
 * being told to use — the canvas, the options bar it highlights, or the dock — so a pointer aimed at
 * the highlighted control would land on the card instead. In flow it covers nothing.
 *
 * Both the decision and the dismissal run as LAYOUT effects, so the card is part of the first frame
 * the editor paints and leaves in the same frame the edit that ended it lands. A passive effect
 * would paint the editor once at full height and reflow it a frame later, moving the canvas under a
 * pointer (or under a measurement) that was already aimed at it.
 */
export function MapEditorCoach({
	rootRef,
	compact,
	quick,
	activity,
}: {
	rootRef: RefObject<HTMLDivElement | null>;
	compact: boolean;
	quick: boolean;
	/** Starting to edit ends the first-open tour without taking focus from the map. */
	activity: string;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const vaultId = spotlightVaultId(runtime.state, 'local-default');
	const attempted = useRef<string | null>(null);
	const initialActivity = useRef(activity);
	const [tour, setTour] = useState<{ vaultId: string; step: number } | null>(null);
	useLayoutEffect(() => {
		if (attempted.current === vaultId) return;
		attempted.current = vaultId;
		setTour(null);
		const key = PREFERENCE_KEYS.seenSpotlights;
		const seen = parseSeenSpotlights(readPreference(key));
		if (spotlightsSeenIn(seen, vaultId).includes('map-editor')) return;
		writePreference(key, serializeSeenSpotlights(markSpotlightSeen(seen, vaultId, 'map-editor')));
		// A denied write must not turn first-open guidance into a recurring interruption.
		if (
			spotlightsSeenIn(parseSeenSpotlights(readPreference(key)), vaultId).includes('map-editor')
		) {
			setTour({ vaultId, step: 0 });
		}
	}, [vaultId]);
	useLayoutEffect(() => {
		if (activity !== initialActivity.current) setTour(null);
	}, [activity]);
	const step = tour?.vaultId === vaultId ? tour.step : null;
	const target = step === null ? null : ['rail', 'options', 'dock'][step];
	useLayoutEffect(() => {
		if (!target) return;
		const node = rootRef.current?.querySelector<HTMLElement>(`[data-map-coach="${target}"]`);
		if (!node) return;
		const previous = node.style.outline;
		const previousOffset = node.style.outlineOffset;
		node.style.outline = '3px solid var(--color-accent)';
		node.style.outlineOffset = '-3px';
		return () => {
			node.style.outline = previous;
			node.style.outlineOffset = previousOffset;
		};
	}, [target, rootRef, compact, quick]);
	if (step === null) return null;
	const titles = [
		'mapEditor.coach.rail',
		'mapEditor.coach.options',
		'mapEditor.coach.dock',
	] as const;
	const bodies = [
		quick ? 'mapEditor.coach.quickRailBody' : 'mapEditor.coach.railBody',
		'mapEditor.coach.optionsBody',
		compact ? 'mapEditor.coach.dockCompactBody' : 'mapEditor.coach.dockBody',
	] as const;
	const close = () => {
		setTour(null);
		rootRef.current?.focus();
	};
	return (
		<FeatureSpotlight
			data-map-onboarding={target}
			aria-live="polite"
			icon="info"
			title={`${step + 1}/3 · ${t(titles[step]!)}`}
			description={t(bodies[step]!)}
			style={{ flexShrink: 0 }}
			onKeyDown={(event: React.KeyboardEvent) => {
				if (event.key === 'Escape') {
					event.stopPropagation();
					close();
				}
			}}
		>
			<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
				<Button
					size="sm"
					style={quick ? { minWidth: 48, minHeight: 48 } : undefined}
					// `accent`, not `primary`: the editor's one gold fill belongs to the header's
					// "Project to players", and guidance must not compete with the work it explains
					// (RC-ENG-8.4's one-primary-per-region rule).
					variant="accent"
					onClick={() => (step === 2 ? close() : setTour({ vaultId, step: step + 1 }))}
				>
					{t(step === 2 ? 'common.action.done' : 'common.action.next')}
				</Button>
				{step < 2 && (
					<Button
						size="sm"
						style={quick ? { minWidth: 48, minHeight: 48 } : undefined}
						variant="ghost"
						onMouseEnter={(event: React.MouseEvent<HTMLButtonElement>) => {
							// Touch can synthesize mouse entry as the editor replaces the tapped
							// Atlas control. Do not leave the new coach action looking hovered.
							if (!matchesMedia('(hover: hover)')) return;
							event.currentTarget.style.background = 'var(--color-surface-overlay)';
							event.currentTarget.style.color = 'var(--color-text-primary)';
						}}
						onClick={close}
					>
						{t('mapEditor.coach.skip')}
					</Button>
				)}
			</div>
		</FeatureSpotlight>
	);
}

/** Shared canvas/list switch for the header and compact tool bar. */
export function MapViewToggle({
	listView,
	compact,
	onChange,
	announce,
}: {
	listView: boolean;
	compact: boolean;
	onChange: (next: boolean) => void;
	announce: (message: string) => void;
}) {
	const { t } = useI18n();
	return (
		<Button
			variant="secondary"
			size="sm"
			// The accessible name stays the full verb phrase everywhere; only the printed text shortens.
			aria-label={listView ? t('mapEditor.showMap') : t('mapEditor.showList')}
			onClick={() => {
				const next = !listView;
				onChange(next);
				announce(next ? t('mapEditor.listShown') : t('mapEditor.mapShown'));
			}}
		>
			{compact
				? listView
					? t('mapEditor.showMapShort')
					: t('mapEditor.showListShort')
				: listView
					? t('mapEditor.showMap')
					: t('mapEditor.showList')}
		</Button>
	);
}

/** Keep quick-map rail actions and their coaching anchors together. */
export function QuickMapActions({
	editor,
	onPanels,
}: {
	editor: MapEditorApi;
	onPanels: () => void;
}) {
	return (
		<div data-map-coach="rail" style={{ flexShrink: 0 }}>
			<div data-map-coach="dock">
				<QuickMapRail
					activeTool={editor.tool}
					onSelect={editor.setTool}
					canUndo={editor.canUndo}
					canRedo={editor.canRedo}
					onUndo={() => void editor.undo()}
					onRedo={() => void editor.redo()}
					onPanels={onPanels}
				/>
			</div>
		</div>
	);
}
