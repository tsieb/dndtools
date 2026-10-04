import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveOnboarding } from '@dndtools/core';
import { Badge, Button, Dialog, Icon } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { readTier } from '../../screens/settings/shared';
import { T } from '../screen-kit';
import { useViewport } from '../useViewport';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../../platform/preferences';
import { appVersion } from '../../platform/appVersion';
import { renderMarkdown } from '../markdown/render';
import { ReleaseNotes } from './ReleaseNotes';
import { ShortcutsDialog } from './ShortcutsDialog';
import { GUIDE_IDS, guideForRoute, readGuide, type GuideId } from './helpTopics';

import gettingStarted from '../../../../../docs/user/getting-started.md?raw';
import screens from '../../../../../docs/user/screens.md?raw';
import runningASession from '../../../../../docs/user/running-a-session.md?raw';
import characters from '../../../../../docs/user/characters.md?raw';
import maps from '../../../../../docs/user/maps.md?raw';
import notes from '../../../../../docs/user/notes.md?raw';
import settings from '../../../../../docs/user/settings.md?raw';
import widgetsAndBuilders from '../../../../../docs/user/widgets-and-builders.md?raw';
import systems from '../../../../../docs/user/systems.md?raw';
import remotePlay from '../../../../../docs/user/remote-play.md?raw';
import privacyModes from '../../../../../docs/user/privacy-modes.md?raw';
import androidDesktopInstall from '../../../../../docs/user/android-desktop-install.md?raw';

// Bundle the guides with the app: no docs server or external navigation is required.
const GUIDE_MARKDOWN: Record<GuideId, string> = {
	'getting-started': gettingStarted,
	screens,
	'running-a-session': runningASession,
	characters,
	maps,
	notes,
	settings,
	'widgets-and-builders': widgetsAndBuilders,
	systems,
	'remote-play': remotePlay,
	'privacy-modes': privacyModes,
	'android-desktop-install': androidDesktopInstall,
};

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

/** True while the most recent shipped release has not yet been seen in the Help menu's What's new
 * row — drives that row's "New" chip (RC-UX-6.6; before, a dot on the trigger that read as an
 * alert). Pure so it is trivially testable. */
export function hasUnseenWhatsNew(): boolean {
	// The shipped version stands in for the changelog's latest release (changelog.test.ts pins the
	// two to agree), so the chip needs no changelog parse to decide.
	const latest = appVersion();
	if (!latest) return false;
	return readSeenWhatsNewVersion() !== latest;
}

// RC-UX-6.1 — one Help menu per shell. Every trigger flips this shared flag and `HelpHost` renders
// the only instance, so the phone footer and the desktop top bar can never open two copies or
// mount the dialog inside their own (possibly transformed) chrome.
let helpOpen = false;
const helpListeners = new Set<() => void>();
function setHelpOpen(next: boolean): void {
	if (helpOpen === next) return;
	helpOpen = next;
	for (const listener of helpListeners) listener();
}
function subscribeHelp(listener: () => void): () => void {
	helpListeners.add(listener);
	return () => helpListeners.delete(listener);
}
export function openHelp(): void {
	setHelpOpen(true);
}

/** The shell's single Help menu. Mount once; every `HelpTrigger` opens it. */
export function HelpHost() {
	const open = useSyncExternalStore(subscribeHelp, () => helpOpen);
	// A host that unmounts (shell teardown, tests) must not leave the next one opening pre-opened.
	useEffect(() => () => setHelpOpen(false), []);
	return <HelpMenu open={open} onClose={() => setHelpOpen(false)} />;
}

/**
 * The Help trigger. The top bar mounts the `outline` one on the tiers with no phone tab bar
 * (RC-DOC-1.3); `Footer.tsx` mounts the `ghost` one in the row above the phone tab bar. WCAG 3.2.6
 * asks for Help in a CONSISTENT place on every screen; both open `HelpHost`.
 *
 * RC-UX-6.6 (ONB-10) — it carries the word Help on every tier. An "i" icon alone read as About, and
 * the guides and the tour tell a lost GM to "open Help".
 */
export function HelpTrigger({
	variant = 'outline',
	style,
}: {
	variant?: 'outline' | 'ghost';
	style?: CSSProperties;
}) {
	const { t } = useI18n();
	const open = useSyncExternalStore(subscribeHelp, () => helpOpen);
	return (
		<Button
			icon="info"
			variant={variant === 'outline' ? 'secondary' : 'ghost'}
			size="sm"
			aria-haspopup="dialog"
			aria-expanded={open}
			onClick={openHelp}
			style={{
				// The top bar's controls are 44px squares; Help matches their height, not their width.
				minHeight: variant === 'outline' ? '2.75rem' : undefined,
				flex: '0 0 auto',
				whiteSpace: 'nowrap',
				...style,
			}}
		>
			{t('shell.help')}
		</Button>
	);
}

const SECTION_HEADING: CSSProperties = {
	margin: 'var(--space-0)',
	font: `600 var(--text-xs) ${T.sans}`,
	letterSpacing: 'var(--tracking-wide)',
	textTransform: 'uppercase',
	color: T.ter,
};

/**
 * RC-UX-3.4 — the Help menu: a consistent-location (WCAG 3.2.6) entry point onto Getting started
 * (the core's own onboarding milestones — `GettingStartedBody` shows the same view as a Command
 * Center widget), the user guides, What's new (the "For players and GMs" notes of the latest release
 * in `CHANGELOG.md`), and the keyboard shortcut overlay (RC-UX-3.3's registry).
 *
 * RC-UX-6.6 — Help opens on the guide for the current route (`guideForRoute`), with this full list
 * one level up behind "All help topics". A route no guide covers opens on the list.
 */
export function HelpMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const { pathname } = useLocation();
	const tier = useViewport() === 'phone' ? 'touch' : 'keyboard';
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	// null: the route's own guide (or the list, when the route has none). Reset on every close, so
	// the next open lands on whatever screen the GM is on then.
	const [choice, setChoice] = useState<GuideId | 'list' | null>(null);
	const [showNew, setShowNew] = useState(false);
	const guideId = choice === 'list' ? null : (choice ?? guideForRoute(pathname));
	const guide = guideId ? readGuide(GUIDE_MARKDOWN[guideId], tier) : null;
	const listOpen = open && guide === null;
	const view = resolveOnboarding(runtime.state, runtime.defaultActorId, readTier());
	const done = view.steps.filter((step) => step.done).length;

	useEffect(() => {
		if (open) return;
		setChoice(null);
		setShowNew(false);
	}, [open]);

	// Seeing the What's new row is what "seeing" the release means, so the chip clears only once the
	// list has been shown — not when Help opened straight onto a guide. It stays up for the rest of
	// this visit so the GM can find what it pointed at.
	useEffect(() => {
		if (!listOpen || !hasUnseenWhatsNew()) return;
		const version = appVersion();
		setShowNew(true);
		if (version) markWhatsNewSeen(version);
	}, [listOpen]);

	return (
		<>
			<Dialog open={listOpen} onClose={onClose} title={t('help.title')} icon="info" size="md">
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
					<section aria-label={t('help.gettingStarted')}>
						<h3 style={{ ...SECTION_HEADING, marginBottom: 'var(--space-1-5)' }}>
							{t('help.gettingStarted')}
						</h3>
						{view.canSetup ? (
							<>
								<div
									style={{
										font: `var(--text-sm) ${T.sans}`,
										color: T.ink,
										marginBottom: 'var(--space-1-5)',
									}}
								>
									{t('help.gettingStartedProgress', { done, total: view.steps.length })}
								</div>
								<ul
									style={{
										margin: 'var(--space-0)',
										paddingLeft: 'var(--space-4)',
										display: 'flex',
										flexDirection: 'column',
										gap: 'var(--space-1)',
									}}
								>
									{view.steps.map((step) => (
										<li
											key={step.id}
											style={{
												font: `var(--text-sm) ${T.sans}`,
												color: step.done ? T.ter : T.ink,
												textDecoration: step.done ? 'line-through' : 'none',
											}}
										>
											{step.label}
										</li>
									))}
								</ul>
								{view.status === 'complete' && (
									<div
										style={{
											font: `var(--text-sm) ${T.sans}`,
											color: T.ter,
											marginTop: 'var(--space-1-5)',
										}}
									>
										{t('help.gettingStartedComplete')}
									</div>
								)}
							</>
						) : (
							<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
								{t('help.gettingStartedParticipant')}
							</div>
						)}
					</section>

					<section aria-label={t('help.guides')}>
						<h3 style={{ ...SECTION_HEADING, marginBottom: 'var(--space-1-5)' }}>
							{t('help.guides')}
						</h3>
						<div lang="en" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
							{GUIDE_IDS.map((id) => (
								<Button key={id} variant="secondary" size="sm" onClick={() => setChoice(id)}>
									{readGuide(GUIDE_MARKDOWN[id], tier).title}
								</Button>
							))}
						</div>
					</section>

					<section aria-label={t('help.whatsNew')}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								marginBottom: 'var(--space-1-5)',
							}}
						>
							<h3 style={SECTION_HEADING}>{t('help.whatsNew')}</h3>
							{showNew && (
								<Badge status="neutral" icon={null} data-testid="whats-new-chip">
									{t('help.whatsNewNew')}
								</Badge>
							)}
						</div>
						{listOpen && <ReleaseNotes />}
					</section>

					<section aria-label={t('help.keyboardShortcuts')}>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => setShortcutsOpen(true)}
							title={t('help.keyboardShortcutsBody')}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 'var(--space-1-5)',
								minHeight: 'var(--space-12)',
							}}
						>
							<Icon name="info" />
							{t('help.keyboardShortcuts')}
						</Button>
						<div
							style={{
								font: `var(--text-sm) ${T.sans}`,
								color: T.ter,
								marginTop: 'var(--space-1-5)',
							}}
						>
							{t('help.keyboardShortcutsBody')}
						</div>
					</section>
				</div>
				{shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
			</Dialog>
			<Dialog
				open={open && guide !== null}
				onClose={onClose}
				title={guide?.title ?? ''}
				icon="info"
				size="md"
				footer={
					<Button variant="secondary" icon="chevron-left" onClick={() => setChoice('list')}>
						{t('help.allTopics')}
					</Button>
				}
			>
				<article lang="en">{guide && renderMarkdown(guide.body, { t })}</article>
			</Dialog>
		</>
	);
}
