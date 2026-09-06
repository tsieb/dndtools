import { useEffect, useState } from 'react';
import { getCombatTrackerForActor } from '@dndtools/core';
import { Icon, IconButton } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { T } from '../screen-kit';
import { useSessionPosture } from './session-posture';

/**
 * RC-SES-1.1 — the desktop RIGHT RAIL of the live session. It exists only while
 * `session.workflow === 'active'` and OPENS ITSELF the moment the session goes live: the DM should
 * not have to find a panel at the exact moment the table starts. Collapsing it is a deliberate act
 * the rail then remembers for the rest of that session, and going live again re-opens it.
 *
 * What it shows today is the posture the shell already knows: how long the session has been live and
 * whose turn it is, both read through actor-scoped Core queries. RC-SES-1.2 replaces this body with
 * the full quick panel (dice bar, Next turn, timer, now-playing, handout push) — the rail, its
 * auto-open behaviour and its collapse control are the part that belongs to this story, so nothing
 * here is a placeholder control: every line is real state or it is absent.
 */

const RAIL_WIDTH = 272;

export function SessionRail() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const posture = useSessionPosture();
	const [collapsed, setCollapsed] = useState(false);
	// Re-open on each new live session (the instant changes), never on every render.
	useEffect(() => {
		if (posture.liveSinceAt) setCollapsed(false);
	}, [posture.liveSinceAt]);

	if (!posture.live) return null;

	if (collapsed) {
		return (
			<div
				style={{
					flex: '0 0 auto',
					display: 'flex',
					alignItems: 'flex-start',
					padding: '10px 8px',
					borderLeft: `1px solid ${T.bd}`,
					background: T.surf,
				}}
			>
				<IconButton
					icon="chevron-left"
					label={t('shell.sessionRailShow')}
					variant="ghost"
					size="sm"
					onClick={() => setCollapsed(false)}
				/>
			</div>
		);
	}

	// SES-002 — the actor-filtered tracker: the rail never re-derives who is visible, and a DM
	// previewing as a player sees exactly what that player would.
	const tracker = getCombatTrackerForActor(
		runtime.state.session.combat,
		runtime.state.permissions,
		runtime.defaultActorId,
	);
	const activeCombatant =
		tracker.status === 'running'
			? (tracker.combatants.find((c) => c.id === tracker.activeCombatantId) ?? null)
			: null;

	return (
		<aside
			data-testid="session-rail"
			aria-label={t('shell.sessionRail')}
			style={{
				flex: '0 0 auto',
				width: RAIL_WIDTH,
				display: 'flex',
				flexDirection: 'column',
				gap: 12,
				padding: `calc(14px + var(--safe-area-top, 0px)) 14px 14px`,
				borderLeft: `1px solid ${T.bd}`,
				background: T.surf,
				overflowY: 'auto',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<Icon name="session-bolt" size="sm" color={T.acc} />
				<span style={{ flex: 1, font: `600 13px ${T.sans}`, color: T.ink }}>
					{t('shell.sessionLive')}
				</span>
				<IconButton
					icon="chevron-right"
					label={t('shell.sessionRailHide')}
					variant="ghost"
					size="sm"
					onClick={() => setCollapsed(true)}
				/>
			</div>

			{posture.elapsed && (
				<div>
					<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{t('shell.sessionElapsed')}</div>
					<div
						data-testid="session-rail-elapsed"
						style={{ font: `600 22px ${T.mono}`, color: T.ink, letterSpacing: '.02em' }}
					>
						{posture.elapsed}
					</div>
				</div>
			)}

			<div>
				<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{t('shell.sessionTurn')}</div>
				<div style={{ font: `600 13.5px ${T.sans}`, color: activeCombatant ? T.ink : T.ter }}>
					{activeCombatant ? activeCombatant.name : t('shell.sessionNoTurn')}
				</div>
				{activeCombatant && (
					<div style={{ font: `11.5px ${T.sans}`, color: T.ter, marginTop: 2 }}>
						{t('shell.sessionRound', { round: tracker.round })}
					</div>
				)}
			</div>
		</aside>
	);
}
