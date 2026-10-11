import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	findHomeScreen,
	findWidgetDefinition,
	getSceneForActor,
	resolveCommandCenterHome,
	resolveOnboarding,
	wantsFirstSessionGuide,
	type CoreCommand,
} from '@dndtools/core';
import { Button, EmptyState, Icon, Skeleton } from '../ds';
import { Page } from '../app/screen-kit';
import type { CompanionPreviewState } from '../app/ViewAsControl';
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
import { FIRST_SESSION_FOCUS_SELECTOR } from '../app/widgets/builtin/GettingStartedBody';
import { LOCAL_VAULT_RENAMED_EVENT } from '../platform/storage/coreStore';
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
 * RC-UX-6.3 — a fresh vault's home screen opens on the first-session guide (`getting-started`, bare,
 * first in reading order), which this page places right after `ensure-home` when the vault held
 * nothing yet. It is a part like the others: hidden from its own "Hide guide" (or Edit layout) and put
 * back from Help. The scenes part's empty state is "No screens yet" with "New screen from a template",
 * the old "Create your first scene" call to action.
 *
 * Its committed baselines (`CommandCenter.baseline.test.tsx`) are the bespoke hub's: the same
 * accessibility tree, DOM skeleton, headings and focus order, apart from the widget regions.
 *
 * A player/observer device sees only their own player-safe view (UX-CMD-012), never the GM's screen.
 * RC-CHR-6.5 — that view is the companion (`/play`), so a participant here is pointed to it rather than
 * shown a stand-in hero no player's device ever renders.
 */

/**
 * Ensure the home screen exists, once per mount; reports a provisioning write that failed.
 *
 * RC-UX-6.3 — a vault with nothing in it yet (read before `ensure-home`) also gets the first-session
 * guide, put first on the new home screen with the guide view's own `restore`, the command Help uses
 * to bring a hidden guide back. A guide that fails to place is not a failed home: Help offers it.
 */
function useProvisionedHome(enabled: boolean) {
	const runtime = useRuntime();
	const home = findHomeScreen(runtime.state.scenes);
	const asked = useRef(false);
	const [failed, setFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		if (!enabled || home || !runtime.loaded || asked.current) return;
		asked.current = true;
		const withGuide = wantsFirstSessionGuide(runtime.state);
		const command: CoreCommand = {
			type: 'command-center.ensure-home',
			actorId: runtime.defaultActorId,
			payload: {},
		};
		// `dispatch` rethrows a persist failure; a rejection is reported in its result.
		void Promise.resolve(runtime.dispatch(command))
			.then(async (result) => {
				setFailed(result.status !== 'accepted');
				if (result.status !== 'accepted' || !withGuide) return;
				const place = resolveOnboarding(runtime.state, runtime.defaultActorId).guide.restore;
				if (place) await runtime.dispatch(place);
			})
			.catch(() => setFailed(!findHomeScreen(runtime.state.scenes)));
	}, [enabled, home, runtime, attempt]);
	const retry = () => {
		asked.current = false;
		setFailed(false);
		setAttempt((count) => count + 1);
	};
	return { home, failed, retry };
}

/**
 * RC-UX-6.3 — when onboarding closes onto this page, focus lands on the first-session guide's first
 * row instead of the page. Onboarding renames the vault catalog (and says so with
 * `LOCAL_VAULT_RENAMED_EVENT`) as it finishes, then focuses `#main-content` once its overlay is gone;
 * that one focus, shortly after the event, is moved on to the guide. Nothing else is redirected.
 */
function useFocusGuideAfterOnboarding() {
	useEffect(() => {
		let armedUntil = 0;
		const arm = () => {
			armedUntil = performance.now() + 2000;
		};
		const onFocus = (event: FocusEvent) => {
			if (performance.now() > armedUntil) return;
			if (!(event.target instanceof HTMLElement) || event.target.id !== 'main-content') return;
			const row = document.querySelector<HTMLElement>(FIRST_SESSION_FOCUS_SELECTOR);
			if (!row) return;
			armedUntil = 0;
			row.focus();
		};
		window.addEventListener(LOCAL_VAULT_RENAMED_EVENT, arm);
		document.addEventListener('focusin', onFocus);
		return () => {
			window.removeEventListener(LOCAL_VAULT_RENAMED_EVENT, arm);
			document.removeEventListener('focusin', onFocus);
		};
	}, []);
}

export function CommandCenter() {
	const runtime = useRuntime();
	const viewport = useViewport();
	const navigate = useNavigate();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const homeView = resolveCommandCenterHome(runtime.state, actorId, {
		widgetPackages: runtime.state.widgets,
	});
	const participant = homeView.kind === 'participant';
	const { home, failed, retry } = useProvisionedHome(!participant);
	useFocusGuideAfterOnboarding();

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

	// UX-CMD-012 / RC-CHR-6.5 — a player/observer never gets the GM hub; their page is the companion.
	if (homeView.kind === 'participant') {
		const companion: CompanionPreviewState = { previewFrom: '/' };
		return (
			<Page max={720}>
				{/* Not the DS EmptyState: its <h3> would skip a level under the top bar's <h1>. */}
				<section
					aria-labelledby="home-participant-title"
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						textAlign: 'center',
						gap: 'var(--space-3)',
						padding: 'var(--space-10) var(--space-6)',
					}}
				>
					<Icon name="visibility-players" size="lg" color="var(--color-text-tertiary)" />
					<h2
						id="home-participant-title"
						style={{
							margin: 'var(--space-0)',
							font: '600 var(--text-lg) var(--font-sans)',
							color: 'var(--color-text-primary)',
						}}
					>
						{t('home.participantTitle')}
					</h2>
					<p
						style={{
							margin: 'var(--space-0)',
							font: 'var(--text-sm)/1.5 var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
					>
						{t('home.participantHint', { name: homeView.displayName })}
					</p>
					<Button
						variant="primary"
						size="sm"
						icon="visibility-players"
						onClick={() => navigate('/play', { state: companion })}
					>
						{t('home.openCompanion')}
					</Button>
				</section>
			</Page>
		);
	}

	if (!home) {
		return (
			<Page max={1200}>
				{failed ? (
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
				) : (
					<div role="status" aria-label={t('common.state.loading')} aria-busy="true">
						<Skeleton variant="text" lines={3} />
					</div>
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
