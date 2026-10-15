import { IMPORT_HUB_EVENT } from '../importHub/registry';
import { BETA_FEEDBACK_URL } from '../../platform/desktopFeedback';
export { BETA_FEEDBACK_URL } from '../../platform/desktopFeedback';
import {
	lazy,
	Suspense,
	useEffect,
	useState,
	useSyncExternalStore,
	type CSSProperties,
} from 'react';
import { Button } from '../../ds';
import { useI18n } from '../../i18n';
import { FIRST_SESSION_NAME_EVENT } from '../widgets/builtin/GettingStartedBody';
import {
	PREFERENCE_KEYS,
	readPreference,
	removePreference,
	writePreference,
} from '../../platform/preferences';
import { ONBOARDED_KEY, REPLAY_EVENT } from '../onboarding/shared';
import { openExternalUrl } from '../../platform/capabilities';
import { appVersion } from '../../platform/appVersion';

const ImportHub = lazy(() =>
	import('../importHub/ImportHub').then((module) => ({ default: module.ImportHub })),
);
const HelpMenu = lazy(() => import('./HelpPanel').then((module) => ({ default: module.HelpMenu })));

/** Device-local: the last "What's new" version the DM has opened. A display preference, not a
 * durable vault fact (Contract 1) — mirrors the onboarding tier's own localStorage flag. */
const SEEN_VERSION_KEY = PREFERENCE_KEYS.whatsNewSeen;

export function readSeenWhatsNewVersion(): string | null {
	return readPreference(SEEN_VERSION_KEY);
}

export function markWhatsNewSeen(version: string): void {
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
	// RC-UX-6.3 — the first-session guide's "Name it" (in the widget or in this menu) reopens
	// onboarding on its campaign step, exactly as Settings › Account's replay does. The host answers it
	// because it is mounted once on every route.
	useEffect(() => {
		const replay = () => {
			removePreference(ONBOARDED_KEY);
			window.dispatchEvent(new Event(REPLAY_EVENT));
		};
		window.addEventListener(FIRST_SESSION_NAME_EVENT, replay);
		return () => window.removeEventListener(FIRST_SESSION_NAME_EVENT, replay);
	}, []);
	// RC-ENG-3.2 — the panel (guides, release notes, markdown) and the import hub load on first use,
	// then stay mounted so their dialogs can close in place.
	const [panelWanted, setPanelWanted] = useState(open);
	if (open && !panelWanted) setPanelWanted(true);
	const [hubWanted, setHubWanted] = useState(false);
	useEffect(() => {
		const want = () => setHubWanted(true);
		window.addEventListener(IMPORT_HUB_EVENT, want);
		return () => window.removeEventListener(IMPORT_HUB_EVENT, want);
	}, []);
	return (
		<Suspense fallback={null}>
			{hubWanted && <ImportHub defaultOpen />}
			{panelWanted && <HelpMenu open={open} onClose={() => setHelpOpen(false)} />}
		</Suspense>
	);
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

export function BetaFeedbackAction() {
	const { t } = useI18n();
	const [fallback, setFallback] = useState(false);
	async function sendFeedback() {
		try {
			setFallback(!(await openExternalUrl(BETA_FEEDBACK_URL)));
		} catch {
			setFallback(true);
		}
	}
	return (
		<section aria-label={t('help.sendFeedback')}>
			<Button variant="secondary" size="sm" onClick={() => void sendFeedback()}>
				{t('help.sendFeedback')}
			</Button>
			<p>{t('help.feedbackPrivacy')}</p>
			{fallback && (
				<div role="status">
					<p>{t('help.feedbackFallback')}</p>
					<code style={{ overflowWrap: 'anywhere' }}>{BETA_FEEDBACK_URL}</code>
				</div>
			)}
		</section>
	);
}
