import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
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
	boardWidgetsOf,
	FLOW_AUTHORING_TIER,
	FLOW_COLUMNS,
	flowOrder,
	flowSpanOf,
	payloadIndex,
	type FlowRect,
} from '../app/board-helpers';
import { WidgetRenderSlot } from '../app/widgets/WidgetRenderSlot';
import { useRuntime } from '../runtime/RuntimeContext';
import { useViewport } from '../app/useViewport';
import { useI18n } from '../i18n';

/**
 * CommandCenter — `/`, the vault's home screen (ADR-041, RC-CAN-7.6).
 *
 * The hub is no longer drawn here. It is a FLOW screen of five system template widgets — the hero,
 * the scenes, Create, Manage and the library — that `command-center.ensure-home` provisions (in a
 * fresh vault beside the GM screen's board; in an existing vault as its new home, the board left
 * untouched). This page renders that screen in reading mode: its widgets, in its layout order, each
 * through the one widget render path (`WidgetRenderSlot`) and so inside its labelled widget region.
 * The GM moves, removes, restyles or rebuilds any part from the screen itself (`/screen/:id`, Edit
 * layout and the widget builder), and this page shows whatever the screen holds.
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

/** A part's place in the home grid: the flow placement, plus the rows it spans beside a stack. */
export interface HomePlacement {
	id: string;
	column: number;
	row: number;
	span: number;
	index: number;
	rowSpan?: number;
}

/**
 * The home screen's flow packing: the flow policy's non-dense row fill (`flowPlacements`), with one
 * addition the hub's body needs — consecutive parts that share a layout group STACK in one lane
 * (Create over Manage beside Scenes). A stack keeps one column and span, one part per row, and the
 * parts before it in its band span its rows; it closes its band, so reading the grid row by row still
 * meets the parts in layout order (ADR-041). At a narrower tier an item alone in its band fills it.
 */
export function homePlacements(
	ordered: readonly (FlowRect & { groupId?: string | null })[],
	columns: number,
): HomePlacement[] {
	const lanes = Math.max(1, Math.floor(columns));
	const items: (FlowRect & { groupId?: string | null })[][] = [];
	for (const widget of ordered) {
		const last = items[items.length - 1];
		if (last && widget.groupId && last[0]!.groupId === widget.groupId) last.push(widget);
		else items.push([widget]);
	}
	const placements: HomePlacement[] = [];
	const bandOf = new Map<HomePlacement, number>();
	const itemsInBand: number[] = [];
	let band = 0;
	let beside: HomePlacement[] = [];
	let row = 0;
	let column = 0;
	const nextBand = (rows: number) => {
		row += rows;
		column = 0;
		band += 1;
		beside = [];
	};
	for (const item of items) {
		const span = Math.max(...item.map((widget) => flowSpanOf(widget, lanes)));
		if (column > 0 && column + span > lanes) nextBand(1);
		itemsInBand[band] = (itemsInBand[band] ?? 0) + 1;
		if (item.length === 1) {
			const placement = { id: item[0]!.id, column, row, span, index: placements.length };
			placements.push(placement);
			bandOf.set(placement, band);
			beside.push(placement);
			column += span;
			if (column >= lanes) nextBand(1);
			continue;
		}
		for (const [offset, widget] of item.entries()) {
			const placement = {
				id: widget.id,
				column,
				row: row + offset,
				span,
				index: placements.length,
			};
			placements.push(placement);
			bandOf.set(placement, band);
		}
		for (const placement of beside) placement.rowSpan = item.length;
		nextBand(item.length);
	}
	if (lanes >= FLOW_COLUMNS[FLOW_AUTHORING_TIER]) return placements;
	return placements.map((placement) =>
		itemsInBand[bandOf.get(placement)!] === 1
			? { ...placement, column: 0, span: lanes, rowSpan: undefined }
			: placement,
	);
}

/** One part in the grid, or out of it (`display: none`) while its body draws nothing. */
function HomePart({
	placement,
	onBlank,
	children,
}: {
	placement: HomePlacement | null;
	onBlank: (blank: boolean) => void;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const report = useRef(onBlank);
	report.current = onBlank;
	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		// The widget region's content box; a body that renders nothing leaves it without elements.
		const check = () => {
			const region = node.querySelector<HTMLElement>('[data-widget-region]');
			// The grid sizes every part to its content, so the region never scrolls; it must not clip
			// what a part draws past its box either (the hero card's shadow, an outward focus ring).
			// Its own `overflow: auto` is the canvas's, where a tile has a fixed size.
			if (region && region.style.overflow !== 'visible') region.style.overflow = 'visible';
			const content = region?.firstElementChild;
			report.current(!!content && content.childElementCount === 0);
		};
		check();
		const observer = new MutationObserver(check);
		observer.observe(node, { childList: true, subtree: true, attributeFilter: ['style'] });
		return () => observer.disconnect();
	}, []);
	return (
		<div
			ref={ref}
			data-flow-index={placement?.index}
			style={
				placement
					? {
							gridColumn: `${placement.column + 1} / span ${placement.span}`,
							gridRow: placement.rowSpan
								? `${placement.row + 1} / span ${placement.rowSpan}`
								: String(placement.row + 1),
							minWidth: 0,
						}
					: { display: 'none' }
			}
		>
			{children}
		</div>
	);
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

	// Parts that currently draw nothing (Manage at the core tier, say) leave the layout, as the hub's
	// own sections did: no empty row, no empty labelled region. They stay mounted, out of the grid, so
	// one that has something to show again comes back.
	const [blank, setBlank] = useState<ReadonlySet<string>>(() => new Set());
	const reportBlank = useCallback((id: string, isBlank: boolean) => {
		setBlank((current) => {
			if (current.has(id) === isBlank) return current;
			const next = new Set(current);
			if (isBlank) next.add(id);
			else next.delete(id);
			return next;
		});
	}, []);

	const tiles = useMemo(() => {
		if (!home) return [];
		const summary = getSceneForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			actorId,
			home.id,
			{ widgetPackages: runtime.state.widgets },
		);
		if ('kind' in summary) return [];
		const widgets = boardWidgetsOf(
			home.widgets,
			payloadIndex(summary.widgets),
			(type) => findWidgetDefinition(runtime.state.widgets, type) ?? null,
		);
		const groupOf = new Map(home.widgets.map((widget) => [widget.id, widget.layout.groupId]));
		// DOM order is the reading order (ADR-041), hidden parts included.
		const ordered = flowOrder(widgets).map((widget) => ({
			...widget,
			groupId: groupOf.get(widget.id) ?? null,
		}));
		// The hub's own tier rule: only the phone collapses to one column; the rail keeps the
		// desktop arrangement, as the Command Center always did.
		const placed = new Map(
			homePlacements(
				ordered.filter((widget) => !blank.has(widget.id)),
				viewport === 'phone' ? FLOW_COLUMNS.phone : FLOW_COLUMNS.desktop,
			).map((placement) => [placement.id, placement]),
		);
		return ordered.map((widget) => ({ widget, placement: placed.get(widget.id) ?? null }));
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
					gridTemplateColumns: `repeat(${viewport === 'phone' ? FLOW_COLUMNS.phone : FLOW_COLUMNS.desktop}, minmax(0, 1fr))`,
					// The hub's 28px between its parts; a phone's single column keeps 24px.
					gap: viewport === 'phone' ? T.space.six : `calc(${T.space.six} + ${T.space.one})`,
					alignItems: 'start',
				}}
			>
				{tiles.map(({ placement, widget }) => (
					<HomePart
						key={widget.id}
						placement={placement}
						onBlank={(isBlank) => reportBlank(widget.id, isBlank)}
					>
						<WidgetRenderSlot
							widget={widget}
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
					</HomePart>
				))}
			</div>
		</Page>
	);
}
