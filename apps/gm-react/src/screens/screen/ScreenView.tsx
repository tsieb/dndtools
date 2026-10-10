import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, IconButton, Toaster } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { Page } from '../../app/screen-kit';
import { Board } from '../Board';
import { BoardPlayerNotice } from '../board/BoardPlayerNotice';
import { SCREENS_PATH, visibilityLabelKey } from './screenModel';
import { ScreenSwitcher } from './ScreenSwitcher';
import { useEnsureHomeScreen, useScreenActions, useScreens } from './useScreens';

/**
 * RC-CAN-7.3 — `/screen/:id`, any screen rendered by its layout policy. Both policies run on the
 * board engine (`Board`): a canvas screen on the bounded board, a flow screen on `FlowBoard`, with the
 * same widgets, commands and undo stack either way. The header carries the switcher, the pin and
 * "Open in scene editor", the free editor for arranging the layout.
 *
 * A screen this actor cannot list — deleted, never shared with them, a template, or an id that never
 * existed — gets an honest unavailable state with the way back to the library. It is never swapped
 * for some other screen, and the read that decides it is the same actor-filtered one the library uses.
 */
export function ScreenView() {
	const { id = '' } = useParams();
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	const { entries, nameOf } = useScreens();
	const { setPinned } = useScreenActions();
	const [pinning, setPinning] = useState(false);
	const isDm = runtime.state.permissions.actors[runtime.defaultActorId]?.role === 'dm';

	if (!runtime.loaded) return null;
	const entry = entries.find((candidate) => candidate.id === id);
	if (!entry) {
		return (
			<Page>
				<EmptyState
					icon="widget"
					title={t('screens.unavailable')}
					description={t('screens.unavailableHint')}
					action={
						<Button
							variant="secondary"
							size="sm"
							icon="layout-list"
							onClick={() => navigate(SCREENS_PATH)}
						>
							{t('screens.all')}
						</Button>
					}
				/>
			</Page>
		);
	}

	const name = nameOf(entry);
	async function togglePin() {
		if (!entry || pinning) return;
		setPinning(true);
		const rejection = await setPinned(entry.id, !entry.pinned);
		setPinning(false);
		if (rejection) Toaster.error(rejection);
	}

	const actions = (
		<>
			<ScreenSwitcher currentId={entry.id} />
			{isDm && (
				<IconButton
					icon="pin"
					label={t(entry.pinned ? 'screens.unpinNamed' : 'screens.pinNamed', { name })}
					aria-pressed={entry.pinned}
					variant={entry.pinned ? 'accent' : 'ghost'}
					size="sm"
					disabled={pinning}
					data-testid="screen-pin"
					onClick={() => void togglePin()}
				/>
			)}
			{isDm && (
				<IconButton
					icon="scene"
					label={t('screens.openEditor', { name })}
					variant="ghost"
					size="sm"
					data-testid="screen-open-editor"
					onClick={() => navigate(`/scene/${encodeURIComponent(entry.id)}`)}
				/>
			)}
		</>
	);

	return (
		<Board
			// One board per screen: switching screens must not carry one screen's edit mode, selection or
			// undo stack onto the next.
			key={entry.id}
			screen={{
				id: entry.id,
				title: name,
				icon: entry.isHome ? 'home' : entry.layoutPolicy === 'flow' ? 'layout-list' : 'widget',
				summary: entry.isHome
					? t('board.widgetCount', { count: entry.widgetCount })
					: t('screens.headerSummary', {
							count: entry.widgetCount,
							visibility: t(visibilityLabelKey(entry.visibility)),
						}),
				actions,
			}}
		/>
	);
}

/**
 * `/board` — the GM screen (ADR-041). The route resolves to the home board's `/screen/:id` by
 * REPLACING the history entry, so an old bookmark lands on the GM screen and Back never returns to the
 * alias. Any create intent (the Command Center's "New widget") travels with it. In a fresh vault the
 * home board is provisioned first (`command-center.ensure-home`, as `/board` always did) and nothing
 * renders meanwhile, so the board mounts ONCE, on the screen route.
 *
 * RC-CAN-7.9 — nothing here renders the bespoke `/board` page any more. A non-GM actor gets the
 * player notice (the GM screen is GM-only), and a provisioning write that failed to persist gets an
 * honest failure with a Retry that asks again, as `/` and `/session` do.
 *
 * The redirect itself is `ScreenRouteAliases`: a `<Navigate>` here never fired again when `/board` was
 * re-entered before the first redirect had committed, and left the pane empty (see that file).
 */
export function BoardAlias() {
	// `useEnsureHomeScreen` asks once per mount; a retry is a fresh mount.
	const [attempt, setAttempt] = useState(0);
	return <GmScreenAlias key={attempt} onRetry={() => setAttempt((count) => count + 1)} />;
}

function GmScreenAlias({ onRetry }: { onRetry: () => void }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const { failed } = useEnsureHomeScreen();
	const isDm = runtime.state.permissions.actors[runtime.defaultActorId]?.role === 'dm';
	if (!runtime.loaded) return null;
	if (!isDm) return <BoardPlayerNotice />;
	if (!failed) return null;
	return (
		<Page>
			<EmptyState
				icon="widget"
				title={t('board.setupFailed')}
				description={t('home.setupFailedHint')}
				action={
					<Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
						{t('common.action.retry')}
					</Button>
				}
			/>
		</Page>
	);
}
