import { useEffect, useState } from 'react';
import { Icon, IconButton } from '../../ds';
import { useI18n } from '../../i18n';
import { SessionQuickPanel } from '../session/QuickPanel';
import { T } from '../screen-kit';
import { useSessionPosture } from './session-posture';

/**
 * RC-SES-1.1 — the desktop RIGHT RAIL of the live session. It exists only while
 * `session.workflow === 'active'` and OPENS ITSELF the moment the session goes live: the DM should
 * not have to find a panel at the exact moment the table starts. Collapsing it is a deliberate act
 * the rail then remembers for the rest of that session, and going live again re-opens it.
 *
 * Its body is RC-SES-1.2's `SessionQuickPanel` (timer, current combatant + Next turn, dice bar,
 * now-playing, handout push) — the same component the narrower tiers open in a sheet, so the two
 * surfaces cannot drift. The rail itself, its auto-open behaviour and its collapse control are what
 * belongs to RC-SES-1.1.
 */

const RAIL_WIDTH = 272;

export function SessionRail() {
	const { t } = useI18n();
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

			<SessionQuickPanel />
		</aside>
	);
}
