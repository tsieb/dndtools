import { openImportHub } from '../importHub/registry';
import { useEffect, useState, type CSSProperties } from 'react';
import { hasUnseenWhatsNew, markWhatsNewSeen } from './HelpMenu';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolveOnboarding } from '@dndtools/core';
import { Badge, Button, Dialog, Icon } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { T } from '../screen-kit';
import {
	FirstSessionGuideList,
	FirstSessionProgress,
	useGuideCommand,
} from '../widgets/builtin/GettingStartedBody';
import { useViewport } from '../useViewport';
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

const SECTION_HEADING: CSSProperties = {
	margin: 'var(--space-0)',
	font: `600 var(--text-xs) ${T.sans}`,
	letterSpacing: 'var(--tracking-wide)',
	textTransform: 'uppercase',
	color: T.ter,
};

/**
 * RC-UX-3.4 — the Help menu: a consistent-location (WCAG 3.2.6) entry point onto Getting started
 * (RC-UX-6.3: the first-session guide, the same list `GettingStartedBody` shows on the Command Center,
 * and the way to put that widget back once it was hidden), the user guides, What's new (the "For players and GMs" notes of the latest release
 * in `CHANGELOG.md`), and the keyboard shortcut overlay (RC-UX-3.3's registry).
 *
 * RC-UX-6.6 — Help opens on the guide for the current route (`guideForRoute`), with this full list
 * one level up behind "All help topics". A route no guide covers opens on the list.
 */
export function HelpMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const runGuideCommand = useGuideCommand();
	const tier = useViewport() === 'phone' ? 'touch' : 'keyboard';
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	// null: the route's own guide (or the list, when the route has none). Reset on every close, so
	// the next open lands on whatever screen the GM is on then.
	const [choice, setChoice] = useState<GuideId | 'list' | null>(null);
	const [showNew, setShowNew] = useState(false);
	const guideId = choice === 'list' ? null : (choice ?? guideForRoute(pathname));
	const guide = guideId ? readGuide(GUIDE_MARKDOWN[guideId], tier) : null;
	const listOpen = open && guide === null;
	const firstSession = resolveOnboarding(runtime.state, runtime.defaultActorId).guide;
	const restore = firstSession.restore;

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
					<Button
						variant="secondary"
						icon="import"
						onClick={() => {
							onClose();
							openImportHub();
						}}
					>
						{t('importHub.open')}
					</Button>
					<section aria-label={t('help.gettingStarted')}>
						<h3 style={{ ...SECTION_HEADING, marginBottom: 'var(--space-1-5)' }}>
							{t('help.gettingStarted')}
						</h3>
						{firstSession.canSetup ? (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
								<div
									style={{
										display: 'flex',
										flexWrap: 'wrap',
										alignItems: 'center',
										gap: 'var(--space-2)',
									}}
								>
									<FirstSessionProgress guide={firstSession} />
									{restore && (
										<Button
											variant="secondary"
											size="sm"
											icon="sparkle"
											onClick={() => {
												void runGuideCommand(restore, 'firstSession.restored').then((back) => {
													if (!back) return;
													onClose();
													navigate('/');
												});
											}}
										>
											{t('firstSession.restore')}
										</Button>
									)}
								</div>
								<FirstSessionGuideList
									guide={firstSession}
									idPrefix="help-first-session"
									onLeave={onClose}
								/>
							</div>
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
				{/* Focusable, like the shortcut overlay's list: a guide is prose with no controls, and the
				    dialog body scrolls, so a keyboard user needs a stop inside it to scroll it. */}
				<article lang="en" tabIndex={0} aria-label={guide?.title}>
					{guide && renderMarkdown(guide.body, { t })}
				</article>
			</Dialog>
		</>
	);
}
