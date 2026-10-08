import { useEffect, useMemo, useRef, useState } from 'react';
import {
	buildDefaultSessionScreen,
	findSessionScreen,
	findWidgetDefinition,
	getSceneForActor,
	type CoreCommand,
	type CoreEnvironment,
	type WidgetInstance,
} from '@dndtools/core';
import { Button, EmptyState, Skeleton } from '../../ds';
import { Page, T } from '../../app/screen-kit';
import {
	boardWidgetPresentation,
	boardWidgetsOf,
	flowColumnsFor,
	flowOrder,
	flowPlacementsForOrder,
	payloadIndex,
	type BoardWidget,
} from '../../app/board-helpers';
import { FlowViewTile } from '../../app/canvas/FlowBoard';
import { useBlankTiles } from '../../app/canvas/FlowPart';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useViewport } from '../../app/useViewport';

/**
 * Session — `/session`, the Session screen (ADR-041, RC-CAN-7.8).
 *
 * The live-play console is no longer drawn here. It is a FLOW screen of widgets, one per
 * SCREENS_PARITY Session row group, that `command-center.ensure-home` provisions the first time a GM
 * opens `/session` (`session: true`): the session status (`session`, its Standby / Prep / Live / Recap
 * control and the start, rest and end dialogs) across the top, the combat tracker (`combat`, with
 * the encounter builder) beside a column of the dice tray (`dice`), rollable tables, handouts, now
 * playing, stage and projection, campaign date, prep and recap, capture, table roster, party, the
 * rest timeline and scheduling. Each widget reads the core actor-scoped and dispatches its own
 * commands, so previewing as a player projects that player's view. This page renders the screen in
 * reading mode through the flow policy's own pieces, so it reads the same here and at `/screen/:id`,
 * where the GM moves, removes or restyles any part of it.
 *
 * Its committed baselines (`Session.baseline.test.tsx`) are the bespoke console's: the same
 * accessibility tree, DOM skeleton, headings and focus order, apart from the widget regions.
 */

/** The console's 16px between its panels; widgets in bare presentation carry no padding of their own. */
const PANEL_GAP = T.space.four;

/** Ensure the Session screen exists, once per mount; reports a provisioning write that failed. */
function useProvisionedSessionScreen(enabled: boolean) {
	const runtime = useRuntime();
	const screen = findSessionScreen(runtime.state.scenes);
	const asked = useRef(false);
	const [failed, setFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		if (!enabled || screen || !runtime.loaded || asked.current) return;
		asked.current = true;
		const command: CoreCommand = {
			type: 'command-center.ensure-home',
			actorId: runtime.defaultActorId,
			payload: { session: true },
		};
		// `dispatch` rethrows a persist failure; a rejection is reported in its result.
		void Promise.resolve(runtime.dispatch(command))
			.then((result) => setFailed(result.status !== 'accepted'))
			.catch(() => setFailed(true));
	}, [enabled, screen, runtime, attempt]);
	const retry = () => {
		asked.current = false;
		setFailed(false);
		setAttempt((count) => count + 1);
	};
	return { screen, failed, retry };
}

/**
 * The default Session screen's widgets, unsaved: what a participant's device draws. The GM's screen
 * is GM-only, so a player never reads it; every widget reads that player's own view.
 */
function defaultSessionWidgets(ownerActorId: string): WidgetInstance[] {
	let next = 0;
	const env = {
		ids: () => `session-part-${next++}`,
		clock: () => '1970-01-01T00:00:00.000Z',
	} as unknown as CoreEnvironment;
	return buildDefaultSessionScreen(env, ownerActorId).widgets;
}

export function Session() {
	const runtime = useRuntime();
	const viewport = useViewport();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';
	// Previewing is something only the GM does, on the GM's own screen: it keeps the GM's layout and
	// shows each widget as the previewed actor sees it.
	const { screen, failed, retry } = useProvisionedSessionScreen(isDm && !previewing);

	// Widgets that currently draw nothing (the rest timeline before a rest, the GM-only panels for a
	// participant) leave the layout. They stay mounted, out of the grid, so one that has something to
	// show again comes back.
	const [blank, reportBlank] = useBlankTiles();

	const { tiles, columns, ready } = useMemo(() => {
		const defOf = (type: string) => findWidgetDefinition(runtime.state.widgets, type) ?? null;
		let widgets: BoardWidget[] | null = null;
		if (screen && isDm && !previewing) {
			const summary = getSceneForActor(
				runtime.state.scenes,
				runtime.state.permissions,
				actorId,
				screen.id,
				{ widgetPackages: runtime.state.widgets },
			);
			if (!('kind' in summary))
				widgets = boardWidgetsOf(screen.widgets, payloadIndex(summary.widgets), defOf);
		} else if (screen && previewing) {
			widgets = boardWidgetsOf(screen.widgets, new Map(), defOf, { includeUndelivered: true });
		} else if (!isDm) {
			widgets = boardWidgetsOf(defaultSessionWidgets(actorId), new Map(), defOf, {
				includeUndelivered: true,
			});
		}
		if (!widgets) return { tiles: [], columns: 1, ready: false };
		// The flow board's own tier rule: a screen of bare parts keeps its arrangement at rail, as the
		// console always did, and only the phone collapses it to one column.
		const columns = flowColumnsFor(viewport, widgets);
		// DOM order is the reading order (ADR-041), blank parts included.
		const ordered = flowOrder(widgets);
		const placements = flowPlacementsForOrder(
			ordered.filter(
				(widget) => !(blank.has(widget.id) && boardWidgetPresentation(widget) === 'bare'),
			),
			columns,
		);
		const placed = new Map(placements.map((placement) => [placement.id, placement]));
		const tiles = ordered.map((widget) => ({
			widget,
			placement: placed.get(widget.id) ?? null,
			count: placements.length,
		}));
		return { tiles, columns, ready: true };
	}, [screen, isDm, previewing, runtime.state, actorId, viewport, blank]);

	if (!ready) {
		return (
			<Page max={1280}>
				{failed ? (
					<EmptyState
						icon="session-bolt"
						title={t('session.setupFailed')}
						description={t('home.setupFailedHint')}
						action={
							<Button variant="secondary" size="sm" icon="refresh" onClick={retry}>
								{t('common.action.retry')}
							</Button>
						}
					/>
				) : (
					<div role="status" aria-label={t('common.state.loading')} aria-busy="true">
						<Skeleton variant="text" lines={3} />
					</div>
				)}
			</Page>
		);
	}

	return (
		<Page max={1280}>
			<div
				data-testid="session-screen"
				data-screen-id={screen?.id}
				style={{
					display: 'grid',
					gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
					gap: PANEL_GAP,
					alignItems: 'start',
				}}
			>
				{tiles.map(({ placement, widget, count }) => (
					<FlowViewTile
						key={widget.id}
						w={widget}
						placement={placement}
						count={count}
						columns={columns}
						onBlank={(isBlank) => reportBlank(widget.id, isBlank)}
						onCommand={(commandType, payload) => {
							if (!screen) return;
							void runtime.dispatch({
								type: 'widget.dispatch-command',
								actorId,
								payload: {
									sceneId: screen.id,
									widgetInstanceId: widget.id,
									commandType,
									payload,
									expectedRevision: screen.ownership.revision,
								},
							});
						}}
					/>
				))}
			</div>
		</Page>
	);
}
