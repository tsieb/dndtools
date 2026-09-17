import { useEffect, useState } from 'react';
import { resolveOnboarding } from '@dndtools/core';
import { Button, Dialog, Icon, IconButton } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { readTier } from '../../screens/settings/shared';
import { T } from '../screen-kit';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../../platform/preferences';
import { appVersion } from '../../platform/appVersion';
import { latestRelease, parseChangelog, type ReleaseNote } from './changelog';
import { renderMarkdown } from '../markdown/render';
import { ShortcutsDialog } from './ShortcutsDialog';

import guide0 from '../../../../../docs/user/getting-started.md?raw';
import guide1 from '../../../../../docs/user/running-a-session.md?raw';
import guide2 from '../../../../../docs/user/maps.md?raw';
import guide3 from '../../../../../docs/user/widgets-and-builders.md?raw';
import guide4 from '../../../../../docs/user/systems.md?raw';
import guide5 from '../../../../../docs/user/remote-play.md?raw';
import guide6 from '../../../../../docs/user/privacy-modes.md?raw';
import guide7 from '../../../../../docs/user/android-desktop-install.md?raw';

// Bundle the guides with the app: no docs server or external navigation is required.
const USER_GUIDES = [guide0, guide1, guide2, guide3, guide4, guide5, guide6, guide7].map(
	(markdown) => ({
		title: markdown.split('\n')[0]!.replace(/^# /, ''),
		body: markdown.split('\n## Implementation references')[0]!.split('\n').slice(1).join('\n'),
	}),
);

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
 * The Help trigger for the tiers that have no phone tab bar (RC-DOC-1.3). `Footer.tsx` owns the
 * phone's own trigger in the slim row above the tab bar; desktop and rail never mount that footer,
 * so without this button the Help menu — and with it every user guide — is unreachable above 640px.
 * The trigger and its unseen-release dot live here beside the menu they open, so the shell only has
 * to mount one element: WCAG 3.2.6 asks for Help in a CONSISTENT place on every screen, and the top
 * bar is the one piece of chrome that follows the DM onto every route at these widths.
 */
export function HelpLauncher() {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	return (
		<div style={{ position: 'relative', flex: '0 0 auto' }}>
			<IconButton
				icon="info"
				label={t('shell.help')}
				variant="outline"
				size="lg"
				onClick={() => setOpen(true)}
			/>
			{hasUnseenWhatsNew() && (
				<span
					aria-hidden="true"
					data-testid="whats-new-badge"
					style={{
						position: 'absolute',
						top: 2,
						right: 2,
						width: 8,
						height: 8,
						borderRadius: T.radius.full,
						background: T.acc,
						border: `1px solid ${T.bg}`,
					}}
				/>
			)}
			<HelpMenu open={open} onClose={() => setOpen(false)} />
		</div>
	);
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
	const [guide, setGuide] = useState<(typeof USER_GUIDES)[number] | null>(null);
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
			<Dialog open={open && !guide} onClose={onClose} title={t('help.title')} icon="info" size="md">
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

					<section aria-label={t('help.title')} lang="en">
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
							{USER_GUIDES.map((entry) => (
								<Button
									key={entry.title}
									variant="secondary"
									size="sm"
									onClick={() => setGuide(entry)}
								>
									{entry.title}
								</Button>
							))}
						</div>
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
			<Dialog
				open={open && guide !== null}
				onClose={() => setGuide(null)}
				title={guide?.title ?? ''}
				size="md"
				footer={
					<Button variant="secondary" onClick={() => setGuide(null)}>
						{t('help.title')}
					</Button>
				}
			>
				<article lang="en">{guide && renderMarkdown(guide.body, { t })}</article>
			</Dialog>
			{shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
		</>
	);
}
