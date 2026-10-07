import { useEffect, useMemo, useRef, useState } from 'react';
import {
	findHomeScreen,
	findWidgetDefinition,
	getSceneForActor,
	resolveCommandCenterHome,
	type CoreCommand,
} from '@dndtools/core';
import { Button, Card, EmptyState, StatusDot } from '../ds';
import { Page, T } from '../app/screen-kit';
import {
	boardWidgetPresentation,
	boardWidgetsOf,
	FLOW_COLUMNS,
	flowColumnsFor,
	flowOrder,
	flowPlacementsForOrder,
	payloadIndex,
} from '../app/board-helpers';
import { FlowViewTile } from '../app/canvas/FlowBoard';
import { flowPartGap, useBlankTiles } from '../app/canvas/FlowPart';
import { useRuntime } from '../runtime/RuntimeContext';
import { useViewport } from '../app/useViewport';
import { useI18n } from '../i18n';

/**
 * CommandCenter — `/`, the vault's home screen (ADR-041, RC-CAN-7.6).
 *
 * The hub is no longer drawn here. It is a FLOW screen of five system template widgets — the hero,
 * the scenes, Create, Manage and the library — that `command-center.ensure-home` provisions (in a
 * fresh vault beside the GM screen's board; in an existing vault as its new home, the board left
 * untouched). This page renders that screen in reading mode through the flow policy's own pieces —
 * its placement (`flowPlacementsForOrder`, which stacks Create over Manage beside Scenes) and its
 * view-mode tile (`FlowViewTile`: a bare part as page content inside its labelled widget region, a
 * framed one in its flow frame) — so the screen reads the same here, at `/screen/:id`, and with any
 * part copied elsewhere. The GM moves, removes, restyles or rebuilds any part from the screen itself
 * (`/screen/:id`, Edit layout and the widget builder), and this page shows whatever the screen holds.
 *
 * Its committed baselines (`CommandCenter.baseline.test.tsx`) are the bespoke hub's: the same
 * accessibility tree, DOM skeleton, headings and focus order, apart from the widget regions.
 *
 * A player/observer device sees only their own player-safe view (UX-CMD-012), never the GM's screen.
 */

/** Ensure the home screen exists, once per mount; reports a provisioning write that failed. */
function useProvisionedHome(enabled: boolean) {
	const runtime = useRuntime();
	const home = findHomeScreen(runtime.state.scenes);
	const asked = useRef(false);
	const [failed, setFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		if (!enabled || home || !runtime.loaded || asked.current) return;
		asked.current = true;
		const command: CoreCommand = {
			type: 'command-center.ensure-home',
			actorId: runtime.defaultActorId,
			payload: {},
		};
		// `dispatch` rethrows a persist failure; a rejection is reported in its result.
		void Promise.resolve(runtime.dispatch(command))
			.then((result) => setFailed(result.status !== 'accepted'))
			.catch(() => setFailed(true));
	}, [enabled, home, runtime, attempt]);
	const retry = () => {
		asked.current = false;
		setFailed(false);
		setAttempt((count) => count + 1);
	};
	return { home, failed, retry };
}

export function CommandCenter() {
	const runtime = useRuntime();
	const viewport = useViewport();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const homeView = resolveCommandCenterHome(runtime.state, actorId, {
		widgetPackages: runtime.state.widgets,
	});
	const participant = homeView.kind === 'participant';
	const { home, failed, retry } = useProvisionedHome(!participant);

	// Bare parts that currently draw nothing (Manage at the core tier, say) leave the layout, as the
	// hub's own sections did: no empty row, no empty labelled region. They stay mounted, out of the
	// grid, so one that has something to show again comes back.
	const [blank, reportBlank] = useBlankTiles();

	const { tiles, columns } = useMemo(() => {
		if (!home) return { tiles: [], columns: FLOW_COLUMNS[viewport] };
		const summary = getSceneForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			actorId,
			home.id,
			{ widgetPackages: runtime.state.widgets },
		);
		if ('kind' in summary) return { tiles: [], columns: FLOW_COLUMNS[viewport] };
		const widgets = boardWidgetsOf(
			home.widgets,
			payloadIndex(summary.widgets),
			(type) => findWidgetDefinition(runtime.state.widgets, type) ?? null,
		);
		// The flow board's own tier rule, so `/` and `/screen/:id` lay out alike: a screen of bare parts
		// keeps its arrangement at rail, as the hub always did, and only the phone collapses it.
		const columns = flowColumnsFor(viewport, widgets);
		// DOM order is the reading order (ADR-041), hidden parts included.
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
		return { tiles, columns };
	}, [home, runtime.state, actorId, viewport, blank]);

	// Liveness is `session.workflow` everywhere else in the app (Session.tsx, ProjectionControl, every
	// StatusDot). Reading `activeSceneId` instead meant `session.recover` — which restores the scene id
	// while moving the workflow to `recap` — would make the hub pulse "Session live" over a read-only
	// archive review.
	const isLive = runtime.state.session.workflow === 'active';

	// UX-CMD-012 — a player/observer device gets ONLY its own player-safe view, never the DM hub.
	if (homeView.kind === 'participant') {
		return (
			<Page max={1100}>
				<Card
					accent
					elevation="raised"
					padding="lg"
					style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
				>
					<StatusDot status={isLive ? 'live' : 'idle'} pulse={isLive} />
					<div style={{ flex: 1, minWidth: 200 }}>
						<div
							style={{
								font: `600 11px ${T.sans}`,
								letterSpacing: '.09em',
								textTransform: 'uppercase',
								color: T.acc,
							}}
						>
							{homeView.observerMode ? t('home.observerMode') : t('home.playerView')}
						</div>
						<div style={{ font: `700 22px/1.1 ${T.disp}`, marginTop: 2 }}>
							{homeView.displayName}
						</div>
						<div style={{ font: `13px ${T.sans}`, color: T.sub, marginTop: 3 }}>
							{homeView.readOnly ? t('home.readOnlyView') : t('home.liveView')}
						</div>
					</div>
				</Card>
			</Page>
		);
	}

	if (!home) {
		return (
			<Page max={1200}>
				{failed && (
					<EmptyState
						icon="home"
						title={t('home.setupFailed')}
						description={t('home.setupFailedHint')}
						action={
							<Button variant="secondary" size="sm" icon="refresh" onClick={retry}>
								{t('common.action.retry')}
							</Button>
						}
					/>
				)}
			</Page>
		);
	}

	return (
		<Page max={1200}>
			<div
				data-testid="home-screen"
				data-screen-id={home.id}
				style={{
					display: 'grid',
					gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
					// The hub's 28px between its parts; a phone's single column keeps 24px.
					gap: flowPartGap(columns),
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
						onCommand={(commandType, payload) =>
							void runtime.dispatch({
								type: 'widget.dispatch-command',
								actorId,
								payload: {
									sceneId: home.id,
									widgetInstanceId: widget.id,
									commandType,
									payload,
									expectedRevision: home.ownership.revision,
								},
							})
						}
					/>
				))}
			</div>
		</Page>
	);
}
