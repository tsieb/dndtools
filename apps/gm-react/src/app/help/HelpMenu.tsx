import { useEffect, useState } from 'react';
import { resolveOnboarding } from '@dndtools/core';
import { Button, Dialog, Icon } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { readTier } from '../../screens/settings/shared';
import { T } from '../screen-kit';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../../platform/preferences';
import { appVersion } from '../../platform/appVersion';
import { latestRelease, parseChangelog, type ReleaseNote } from './changelog';
import { ShortcutsDialog } from './ShortcutsDialog';

/** Device-local: the last "What's new" version the DM has opened. A display preference, not a
 * durable vault fact (Contract 1) — mirrors the onboarding tier's own localStorage flag. */
const SEEN_VERSION_KEY = PREFERENCE_KEYS.whatsNewSeen;

export function readSeenWhatsNewVersion(): string | null {
	return readPreference(SEEN_VERSION_KEY);
}

function markWhatsNewSeen(version: string): void {
	// Best-effort — a re-shown badge next launch is not worth failing the dialog open over.
	writePreference(SEEN_VERSION_KEY, version);
}

/** True while the most recent shipped release has not yet been opened from this menu — drives the
 * dot badge on the Help trigger (RC-UX-3.4). Pure so it is trivially testable and reused by both
 * the trigger and the menu body. */
export function hasUnseenWhatsNew(): boolean {
	// The shipped version stands in for the changelog's latest release (changelog.test.ts pins the
	// two to agree), so the badge needs no changelog parse on every shell render.
	const latest = appVersion();
	if (!latest) return false;
	return readSeenWhatsNewVersion() !== latest;
}

/**
 * The repo's CHANGELOG.md, parsed, loaded the first time the menu opens. The raw markdown is a
 * separate chunk: nothing on the boot path needs release notes.
 */
async function loadLatestRelease(): Promise<ReleaseNote | null> {
	const { default: markdown } = await import('../../../../../CHANGELOG.md?raw');
	return latestRelease(parseChangelog(markdown));
}

/**
 * RC-UX-3.4 — the Help menu: a consistent-location (WCAG 3.2.6) entry point onto Getting started
 * (the core's own onboarding milestones — `GettingStartedBody` shows the same view as a Command
 * Center widget), What's new (parsed straight from the repo's `CHANGELOG.md`, badge-then-clear on
 * open), and the keyboard shortcut overlay (RC-UX-3.3's registry).
 */
export function HelpMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const view = resolveOnboarding(runtime.state, runtime.defaultActorId, readTier());
	const done = view.steps.filter((step) => step.done).length;
	const [latest, setLatest] = useState<ReleaseNote | null>(null);

	// Opening the menu is what "seeing" the release means: mark the shipped version seen (the badge's
	// own source) and fetch the release notes for the body. Both are side effects, once per open.
	useEffect(() => {
		if (!open) return;
		const version = appVersion();
		if (version) markWhatsNewSeen(version);
		let live = true;
		void loadLatestRelease().then((release) => {
			if (!live) return;
			setLatest(release);
			// A build without an injected version (or one whose changelog ran ahead) still marks what it
			// actually showed as seen.
			if (!version && release) markWhatsNewSeen(release.version);
		});
		return () => {
			live = false;
		};
	}, [open]);

	return (
		<>
			<Dialog open={open} onClose={onClose} title={t('help.title')} icon="info" size="md">
				<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
					<section aria-label={t('help.gettingStarted')}>
						<h3
							style={{
								margin: '0 0 6px',
								font: `600 12px ${T.sans}`,
								letterSpacing: '.06em',
								textTransform: 'uppercase',
								color: T.ter,
							}}
						>
							{t('help.gettingStarted')}
						</h3>
						{view.canSetup ? (
							<>
								<div style={{ font: `13px ${T.sans}`, color: T.ink, marginBottom: 6 }}>
									{t('help.gettingStartedProgress', { done, total: view.steps.length })}
								</div>
								<ul
									style={{
										margin: 0,
										paddingLeft: 18,
										display: 'flex',
										flexDirection: 'column',
										gap: 4,
									}}
								>
									{view.steps.map((step) => (
										<li
											key={step.id}
											style={{
												font: `13px ${T.sans}`,
												color: step.done ? T.ter : T.ink,
												textDecoration: step.done ? 'line-through' : 'none',
											}}
										>
											{step.label}
										</li>
									))}
								</ul>
								{view.status === 'complete' && (
									<div style={{ font: `12.5px ${T.sans}`, color: T.ter, marginTop: 6 }}>
										{t('help.gettingStartedComplete')}
									</div>
								)}
							</>
						) : (
							<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
								{t('help.gettingStartedParticipant')}
							</div>
						)}
					</section>

					<section aria-label={t('help.whatsNew')}>
						<h3
							style={{
								margin: '0 0 6px',
								font: `600 12px ${T.sans}`,
								letterSpacing: '.06em',
								textTransform: 'uppercase',
								color: T.ter,
							}}
						>
							{t('help.whatsNew')}
						</h3>
						{latest ? (
							<>
								<div style={{ font: `13px ${T.sans}`, color: T.ink, marginBottom: 6 }}>
									{t('help.whatsNewVersion', { version: latest.version })}
								</div>
								<ul
									style={{
										margin: 0,
										paddingLeft: 18,
										display: 'flex',
										flexDirection: 'column',
										gap: 4,
									}}
								>
									{latest.items.map((item) => (
										<li key={item} style={{ font: `13px ${T.sans}`, color: T.ink }}>
											{item}
										</li>
									))}
								</ul>
							</>
						) : (
							<div style={{ font: `13px ${T.sans}`, color: T.ter }}>{t('help.whatsNewNone')}</div>
						)}
					</section>

					<section aria-label={t('help.keyboardShortcuts')}>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => setShortcutsOpen(true)}
							style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
						>
							<Icon name="info" />
							{t('help.keyboardShortcuts')}
						</Button>
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter, marginTop: 6 }}>
							{t('help.keyboardShortcutsBody')}
						</div>
					</section>
				</div>
			</Dialog>
			{shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
		</>
	);
}
