import { useEffect, useState, type CSSProperties } from 'react';
import { getCombatTrackerForActor, getDiceHistoryForActor } from '@dndtools/core';
import { Button, Input, Sheet, Toaster, Toolbar } from '../../ds';
import { useI18n } from '../../i18n';
import { matchesMedia, subscribeMedia } from '../../platform/preferences';
import { useRuntime } from '../../runtime/RuntimeContext';
import { T } from '../screen-kit';
import { useSessionPosture } from '../shell/session-posture';

/**
 * SessionActionBar — RC-CAN-5.2, the phone board's floating bar while the session is live.
 *
 * On a phone the board IS the table surface: the DM reads the stacked tiles (RC-CAN-5.1) with a
 * thumb, and the four things they reach for mid-scene should not sit behind the quick-panel sheet.
 * The bar carries exactly those: a d20 and a d6, Next turn (only while combat is running, drawn in
 * the combat tile's identity colour so it reads as the fight's control), and Handout.
 *
 * It is a peer of RC-SES-1.2's `SessionQuickPanel`, not a second implementation: every control
 * dispatches the same core command (`dice.roll`, `combat.advance-turn`, `session.deliver-handout`)
 * and reads through the same actor-scoped queries, with the same fail-closed rules — previewing as
 * a player disables every write, and the handout push is disabled, with the reason shown, until
 * there is an active scene and a player to send it to.
 *
 * The bar sits IN FLOW at the foot of the board rather than over it, so it never covers the last
 * panel's controls and stays put while a panel is full screen (the full-screen tile fills the
 * region above it). `role="toolbar"` with the DS Toolbar's arrow-key roving.
 */

/** The two dice a table actually reaches for between turns. */
const BAR_DICE = [20, 6] as const;

/** 48px targets: the phone board's own touch floor (StackedBoard's headers, `--space-12`). */
const TARGET: CSSProperties = { minHeight: 'var(--space-12)', minWidth: 'var(--space-12)' };

/** The dice keep their size; the two labelled controls give way first and wrap their own label. */
const DIE: CSSProperties = { ...TARGET, flex: '0 0 auto', fontFamily: T.mono };
// `normal`, not the DS Button's `anywhere`: a label may wrap between words, never mid-word ("Han/dout").
const LABELLED: CSSProperties = { ...TARGET, flex: '0 1 auto', overflowWrap: 'normal' };

/**
 * Below 360px there is not room for d20, d6, Next turn AND a labelled Handout on one row, so while
 * combat is running Handout drops to its glyph (keeping its accessible name) and Next turn keeps
 * its words — the turn is the control the table is waiting on.
 */
const NARROW_QUERY = '(max-width: 359px)';

function useNarrow(): boolean {
	const [narrow, setNarrow] = useState(() => matchesMedia(NARROW_QUERY));
	useEffect(() => subscribeMedia([NARROW_QUERY], () => setNarrow(matchesMedia(NARROW_QUERY))), []);
	return narrow;
}

/**
 * One row at every phone width: a bar that wrapped to two rows at 320px took a quarter of the pane.
 * The bottom margin clears the quick-panel trigger, which AppShell pins 92px above the window edge
 * — about 14px into `<main>` over the live footer (status strip, help row, tab bar).
 */
const BAR: CSSProperties = {
	flex: '0 0 auto',
	flexWrap: 'nowrap',
	justifyContent: 'center',
	margin: '0 var(--space-2) var(--space-5)',
	padding: 'var(--space-1-5)',
	borderRadius: 'var(--radius-lg)',
	border: `1px solid ${T.bd}`,
	background: T.raised,
	boxShadow: 'var(--shadow-md)',
};

const COMBAT: CSSProperties = {
	...LABELLED,
	border: '2px solid var(--color-tile-combat)',
	color: T.ink,
};

export function SessionActionBar() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const posture = useSessionPosture();
	const [handoutOpen, setHandoutOpen] = useState(false);
	const [title, setTitle] = useState('');
	const narrow = useNarrow();
	if (!posture.live) return null;

	const state = runtime.state;
	const perms = state.permissions;
	const actorId = runtime.defaultActorId;
	const isDm = perms.actors[actorId]?.role === 'dm';
	const writesBlocked = !!runtime.preview || !isDm;
	const combatRunning =
		getCombatTrackerForActor(state.session.combat, perms, actorId).status === 'running';
	const activeSceneId = state.session.activeSceneId;
	const players = Object.values(perms.actors).filter((a) => a.role === 'player');
	const handoutBlocked = writesBlocked || !activeSceneId || players.length === 0;
	const glyphOnly = narrow && combatRunning;

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]) {
		const result = await runtime.dispatch(command);
		if (result.status !== 'accepted') Toaster.error(result.rejection.message);
		return result;
	}

	async function roll(expression: string): Promise<void> {
		const result = await dispatch({ type: 'dice.roll', actorId, payload: { expression } });
		if (result.status !== 'accepted') return;
		const { session, permissions } = result.nextState;
		const rolls = getDiceHistoryForActor(session, permissions, actorId).rolls;
		const last = rolls[rolls.length - 1];
		if (last) Toaster.success(t('session.actionBar.rolled', { expression, total: last.total }));
	}

	async function pushHandout(): Promise<void> {
		const trimmed = title.trim();
		if (!trimmed || handoutBlocked || !activeSceneId) return;
		const result = await dispatch({
			type: 'session.deliver-handout',
			actorId,
			payload: {
				title: trimmed,
				sections: [{ heading: trimmed, body: '', visibility: 'player-visible' as const }],
				sceneId: activeSceneId,
				recipientActorIds: players.map((p) => p.id),
			},
		});
		if (result.status !== 'accepted') return;
		Toaster.success(t('projection.pushed', { title: trimmed, count: players.length }));
		setTitle('');
		setHandoutOpen(false);
	}

	return (
		<>
			<Toolbar
				ariaLabel={t('session.actionBar.label')}
				data-testid="session-action-bar"
				style={BAR}
			>
				{BAR_DICE.map((sides) => {
					const expression = `1d${sides}`;
					return (
						<Button
							key={sides}
							data-testid={`session-action-d${sides}`}
							aria-label={t('session.quick.rollDie', { expression })}
							disabled={writesBlocked}
							size="sm"
							style={DIE}
							onClick={() => void roll(expression)}
						>
							{`d${sides}`}
						</Button>
					);
				})}
				{combatRunning && (
					<Button
						icon="skip"
						size="sm"
						data-testid="session-action-next-turn"
						data-accent="combat"
						disabled={writesBlocked}
						style={COMBAT}
						onClick={() => void dispatch({ type: 'combat.advance-turn', actorId, payload: {} })}
					>
						{t('session.quick.nextTurn')}
					</Button>
				)}
				<Button
					icon="scroll"
					size="sm"
					data-testid="session-action-handout"
					aria-haspopup="dialog"
					aria-expanded={handoutOpen}
					aria-label={glyphOnly ? t('session.actionBar.handout') : undefined}
					disabled={writesBlocked}
					style={LABELLED}
					onClick={() => setHandoutOpen(true)}
				>
					{glyphOnly ? null : t('session.actionBar.handout')}
				</Button>
			</Toolbar>
			<Sheet
				open={handoutOpen}
				onClose={() => setHandoutOpen(false)}
				side="bottom"
				title={t('session.quick.handout')}
			>
				<form
					data-testid="session-action-handout-sheet"
					style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
					onSubmit={(e) => {
						e.preventDefault();
						void pushHandout();
					}}
				>
					<Input
						value={title}
						onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
						placeholder={t('session.quick.handoutPlaceholder')}
						aria-label={t('session.quick.handoutPlaceholder')}
					/>
					{/* The reason the push is unavailable, rather than a button that silently does nothing. */}
					{!writesBlocked && handoutBlocked && (
						<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>
							{activeSceneId ? t('projection.noPlayers') : t('session.goLive.needsSceneShort')}
						</div>
					)}
					<Button
						type="submit"
						variant="primary"
						icon="send"
						style={TARGET}
						disabled={handoutBlocked || !title.trim()}
					>
						{t('session.quick.push')}
					</Button>
				</form>
			</Sheet>
		</>
	);
}
