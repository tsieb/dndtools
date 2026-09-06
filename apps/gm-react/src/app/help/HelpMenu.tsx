import { useEffect, useState } from 'react';
import { resolveOnboarding } from '@dndtools/core';
import changelogRaw from '../../../../../CHANGELOG.md?raw';
import { Button, Dialog, Icon } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { readTier } from '../../screens/settings/shared';
import { T } from '../screen-kit';
import { latestRelease, parseChangelog } from './changelog';
import { ShortcutsDialog } from './ShortcutsDialog';

/** Device-local: the last "What's new" version the DM has opened. A display preference, not a
 * durable vault fact (Contract 1) — mirrors the onboarding tier's own localStorage flag. */
const SEEN_VERSION_KEY = 'dndtools:react:whatsNewSeen';

export function readSeenWhatsNewVersion(): string | null {
	try {
		return window.localStorage.getItem(SEEN_VERSION_KEY);
	} catch {
		return null;
	}
}

function markWhatsNewSeen(version: string): void {
	try {
		window.localStorage.setItem(SEEN_VERSION_KEY, version);
	} catch {
		/* best-effort — a re-shown badge next launch is not worth failing the dialog open over */
	}
}

/** True while the most recent shipped release has not yet been opened from this menu — drives the
 * dot badge on the Help trigger (RC-UX-3.4). Pure so it is trivially testable and reused by both
 * the trigger and the menu body. */
export function hasUnseenWhatsNew(): boolean {
	const latest = latestRelease(parseChangelog(changelogRaw));
	if (!latest) return false;
	return readSeenWhatsNewVersion() !== latest.version;
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
	const latest = latestRelease(parseChangelog(changelogRaw));

	// A side effect (marking the version seen), not a render-time computation — runs once per open.
	useEffect(() => {
		if (latest && open) markWhatsNewSeen(latest.version);
	}, [latest, open]);

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
