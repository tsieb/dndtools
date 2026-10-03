import { Kbd } from '../../ds';
import { useState } from 'react';
import { getContentItemsForActor, listScenesForActor } from '@dndtools/core';
import { Icon, Switch } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { Panel, SetRow, T } from '../../app/screen-kit';
import { nextHighContrastTheme } from '../settings-validation';
import { readThemePreference } from '../../platform/theme';
import { useRuntime } from '../../runtime/RuntimeContext';
import { PREV_THEME_KEY, readLocal, setDocAttr, writeLocal } from './shared';
import { shortcutsForScope, type ShortcutScope } from '../../app/shortcuts/registry';
/* ---- Accessibility (REAL persisted prefs — write the SAME doc attrs Appearance owns) ------------- */
/* The registry's scopes, in the order this page prints them, with their section headings. */
const SHORTCUT_SCOPES: readonly ShortcutScope[] = ['global', 'canvas', 'map'];
const SCOPE_LABEL: Record<ShortcutScope, MessageKey> = {
	global: 'shortcuts.scope.global',
	canvas: 'shortcuts.scope.canvas',
	map: 'shortcuts.scope.map',
};
export function SettingsAccessibility() {
	const { t } = useI18n();
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
					? t('settings.a11y.checkScenesUnknown')
					: t('settings.a11y.checkScenesOk', { count: players.length }),
		});
		checks.push({
			id: 'content',
			state: players.length === 0 ? 'unknown' : contentLeaks === 0 ? 'ok' : 'fail',
			label:
				players.length === 0
					? t('settings.a11y.checkContentUnknown')
					: t('settings.a11y.checkContentOk'),
		});
		checks.push({
			id: 'preview',
			state: 'ok',
			label: t('settings.a11y.checkPreview'),
		});
		return checks;
	})();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.four }}>
			<Panel title={t('settings.a11y.displayMotion')}>
				<div
					style={{ font: `var(--text-sm)/1.5 ${T.sans}`, color: T.sub, marginBottom: T.space.one }}
				>
					{t('settings.a11y.intro')}
				</div>
				<SetRow
					label={t('settings.a11y.reduceMotion')}
					help={t('settings.a11y.reduceMotionHelp')}
					control={
						<Switch
							checked={reduceMotion}
							aria-label={t('settings.a11y.reduceMotion')}
							onChange={() => {
								const v = reduceMotion ? 'full' : 'reduced';
								setMotion(v);
								setDocAttr('data-motion', 'dndtools:react:motion', v);
							}}
						/>
					}
				/>
				<SetRow
					label={t('settings.a11y.highContrast')}
					help={t('settings.a11y.highContrastHelp')}
					control={
						<Switch
							checked={highContrast}
							aria-label={t('settings.a11y.highContrast')}
							onChange={() => {
								// Remember what we are leaving, so turning the switch back off restores it.
								// It used to hard-code 'tavern' on the way back, silently destroying a
								// Parchment preference for anyone who tried high contrast once.
								// The stored choice, so a "System" reader comes back to following the device.
								if (!highContrast) writeLocal(PREV_THEME_KEY, readThemePreference());
								const v = nextHighContrastTheme(theme, readLocal(PREV_THEME_KEY));
								setTheme(v);
								setDocAttr('data-theme', 'dndtools:react:theme', v);
							}}
						/>
					}
				/>
			</Panel>
			{/* RC-UX-3.3 — printed from app/shortcuts/registry.ts, the same declarations the handlers
			    fire on, so this page can no longer advertise a key the build does not implement. */}
			<Panel title={t('settings.a11y.shortcuts')}>
				{SHORTCUT_SCOPES.map((scope) => (
					<section
						key={scope}
						aria-label={t(SCOPE_LABEL[scope])}
						style={{ marginBottom: T.space.four }}
					>
						<h3
							style={{
								margin: `${T.space.zero} ${T.space.zero} ${T.space.oneHalf}`,
								font: `600 var(--text-xs) ${T.sans}`,
								letterSpacing: '.06em',
								textTransform: 'uppercase',
								color: T.sub,
							}}
						>
							{t(SCOPE_LABEL[scope])}
						</h3>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))',
								gap: `${T.space.two} ${T.space.six}`,
							}}
						>
							{shortcutsForScope(scope).map((s) => (
								<div
									key={s.id}
									style={{
										display: 'flex',
										alignItems: 'flex-start',
										gap: T.space.three,
										minWidth: 0,
									}}
								>
									<Kbd
										style={{
											font: `var(--text-xs) ${T.mono}`,
											color: T.ink,
											border: `1px solid ${T.bd}`,
											borderRadius: T.radius.md,
											padding: `${T.space.half} ${T.space.two}`,
											background: T.alt,
											// A two-chord entry ("Ctrl/⌘+Z · Ctrl/⌘+Shift+Z") is wider than its column, and
											// `nowrap` painted it over its own description. Break between chords instead.
											flex: '0 1 auto',
											maxWidth: '60%',
											whiteSpace: 'normal',
										}}
									>
										{s.keys.split(' · ').map((chord, i) => (
											<span key={`${i}-${chord}`}>
												{i > 0 && ' · '}
												<span style={{ whiteSpace: 'nowrap' }}>{chord}</span>
											</span>
										))}
									</Kbd>
									<span
										style={{
											flex: '1 1 0',
											minWidth: 0,
											font: `var(--text-sm) ${T.sans}`,
											color: T.sub,
											overflowWrap: 'anywhere',
										}}
									>
										{t(s.action)}
									</span>
								</div>
							))}
						</div>
					</section>
				))}
			</Panel>
			<Panel title={t('settings.a11y.safetyChecks')}>
				<div
					style={{ font: `var(--text-sm)/1.5 ${T.sans}`, color: T.sub, marginBottom: T.space.one }}
				>
					{t('settings.a11y.safetyIntro')}
				</div>
				{leakChecks.map((c) => (
					<div
						key={c.id}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: T.space.three,
							padding: `${T.space.oneHalf} ${T.space.zero}`,
							font: `var(--text-sm) ${T.sans}`,
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
