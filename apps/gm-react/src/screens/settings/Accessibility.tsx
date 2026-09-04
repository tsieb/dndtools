import { useState } from 'react';
import { getContentItemsForActor, listScenesForActor } from '@dndtools/core';
import { Icon, Switch } from '../../ds';
import { Panel, SetRow, T } from '../../app/screen-kit';
import { nextHighContrastTheme } from '../settings-validation';
import { useRuntime } from '../../runtime/RuntimeContext';
import { PREV_THEME_KEY, readLocal, setDocAttr, writeLocal } from './shared';
/* ---- Accessibility (REAL persisted prefs — write the SAME doc attrs Appearance owns) ------------- */
/** The shortcuts this build actually implements (AppShell ⌘K, SceneBoardCanvas keyboard nav, the
 * skip link) — an authored list, but of REAL behavior, replacing the prototype's mock table. */
const REAL_SHORTCUTS: { keys: string; action: string }[] = [
	{ keys: '⌘K / Ctrl+K', action: 'Open the command palette — search the whole vault' },
	{ keys: 'Tab', action: 'Move focus; first press reveals “Skip to content”' },
	{
		keys: '← ↑ ↓ →',
		action: 'Move between canvas widgets; move the selected widget while editing',
	},
	{ keys: 'Enter / Space', action: 'Select the focused widget (opens the inspector in edit mode)' },
	{ keys: 'Shift + Arrows', action: 'Resize the selected widget (canvas edit mode)' },
	{ keys: 'Delete', action: 'Remove the selected widget (canvas edit mode)' },
	{ keys: 'Esc', action: 'Close dialog / deselect widget / exit preview' },
];
export function SettingsAccessibility() {
	const runtime = useRuntime();
	// Single source of truth = the live <html> attribute (the same one Appearance + index.html restore).
	const [theme, setTheme] = useState<string>(
		document.documentElement.getAttribute('data-theme') || 'tavern',
	);
	const [motion, setMotion] = useState<string>(
		document.documentElement.getAttribute('data-motion') || 'full',
	);
	const reduceMotion = motion === 'reduced';
	const highContrast = theme === 'high-contrast';

	// REAL player-safety checks: run the SAME actor-filtered reads a player actor gets and assert no
	// dm-only entity leaks through them. Computed live against the current vault, not authored flags.
	const leakChecks = (() => {
		const players = (
			Object.values(runtime.state.permissions.actors) as { id: string; role: string }[]
		).filter((a) => a.role === 'player');
		// A check that could not RUN is not a check that PASSED. With no players configured both leak
		// counts are trivially 0, and painting that as a green tick told a DM their DM-only content was
		// verified hidden when nothing had been verified at all.
		const checks: { id: string; state: 'ok' | 'fail' | 'unknown'; label: string }[] = [];
		let sceneLeaks = 0;
		let contentLeaks = 0;
		for (const p of players) {
			sceneLeaks += listScenesForActor(
				runtime.state.scenes,
				runtime.state.permissions,
				p.id,
			).filter((s) => s.visibility === 'dm-only').length;
			contentLeaks += getContentItemsForActor(
				runtime.state.content,
				runtime.state.permissions,
				p.id,
			).filter((c) => c.visibility === 'dm-only').length;
		}
		checks.push({
			id: 'scenes',
			state: players.length === 0 ? 'unknown' : sceneLeaks === 0 ? 'ok' : 'fail',
			label:
				players.length === 0
					? 'DM-only scenes: add a player to run this check'
					: `DM-only scenes are hidden from all ${players.length} players`,
		});
		checks.push({
			id: 'content',
			state: players.length === 0 ? 'unknown' : contentLeaks === 0 ? 'ok' : 'fail',
			label:
				players.length === 0
					? 'DM-only notes and handouts: add a player to run this check'
					: 'DM-only notes and handouts are hidden from every player view',
		});
		checks.push({
			id: 'preview',
			state: 'ok',
			label: 'Player preview is read-only, so campaign changes are blocked',
		});
		return checks;
	})();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Display & motion">
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					These mirror your Appearance settings, take effect immediately, and stay selected next
					time.
				</div>
				<SetRow
					label="Reduce motion"
					help="Turns off interface animation while keeping every action available."
					control={
						<Switch
							checked={reduceMotion}
							aria-label="Reduce motion"
							onChange={() => {
								const v = reduceMotion ? 'full' : 'reduced';
								setMotion(v);
								setDocAttr('data-motion', 'dndtools:react:motion', v);
							}}
						/>
					}
				/>
				<SetRow
					label="High-contrast theme"
					help="Switches to the accessibility-floor theme; turning it off restores the theme you were using."
					control={
						<Switch
							checked={highContrast}
							aria-label="High-contrast theme"
							onChange={() => {
								// Remember what we are leaving, so turning the switch back off restores it.
								// It used to hard-code 'tavern' on the way back, silently destroying a
								// Parchment preference for anyone who tried high contrast once.
								if (!highContrast) writeLocal(PREV_THEME_KEY, theme);
								const v = nextHighContrastTheme(theme, readLocal(PREV_THEME_KEY));
								setTheme(v);
								setDocAttr('data-theme', 'dndtools:react:theme', v);
							}}
						/>
					}
				/>
			</Panel>
			<Panel title="Keyboard shortcuts">
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))',
						gap: '8px 24px',
					}}
				>
					{REAL_SHORTCUTS.map((s, i) => (
						<div
							key={i}
							style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}
						>
							<span
								style={{
									font: `12px ${T.mono}`,
									color: T.ink,
									border: `1px solid ${T.bd}`,
									borderRadius: 5,
									padding: '2px 7px',
									background: T.alt,
									whiteSpace: 'nowrap',
								}}
							>
								{s.keys}
							</span>
							<span
								style={{
									minWidth: 0,
									font: `12.5px ${T.sans}`,
									color: T.sub,
									overflowWrap: 'anywhere',
								}}
							>
								{s.action}
							</span>
						</div>
					))}
				</div>
			</Panel>
			<Panel title="Player-safety checks">
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					These checks use the same views your players receive and confirm DM-only content stays
					hidden.
				</div>
				{leakChecks.map((c) => (
					<div
						key={c.id}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							padding: '6px 0',
							font: `12.5px ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon
							name={c.state === 'ok' ? 'success' : c.state === 'fail' ? 'error' : 'info'}
							size={16}
							color={c.state === 'ok' ? T.ok : c.state === 'fail' ? T.err : T.ter}
						/>
						<span>{c.label}</span>
					</div>
				))}
			</Panel>
		</div>
	);
}
