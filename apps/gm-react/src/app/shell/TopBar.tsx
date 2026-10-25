import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Icon, IconButton, Sheet, StatusDot } from '../../ds';
import { useI18n } from '../../i18n';
import { ViewAsControl, takePreviewReturnFocus } from '../ViewAsControl';
import { ProjectionControl } from '../ProjectionControl';
import { HostSessionButton, AccountButton } from '../../net/SessionPanel';
import { useViewport } from '../useViewport';
import { matchesMedia, subscribeMedia } from '../../platform/preferences';
import { HelpHost, HelpTrigger } from '../help/HelpMenu';
import { activeSectionId, sectionLabelKey, sectionSubtitleKey } from '../nav';
import { T } from '../screen-kit';
import { useSessionPosture } from './session-posture';
import { useScreenRouteName } from '../../screens/screen/useScreens';
import { useRuntime } from '../../runtime/RuntimeContext';

/* The calm top bar — title / subtitle, ⌘K search, the table controls, and on constrained widths the
 * Table controls sheet that holds them. Extracted from AppShell.tsx unchanged (RC-STB-2.6).
 *
 * RC-ENG-15.2 (IA_REVIEW, "Four unlabeled icons") — the table controls are never bare glyphs. A wide
 * top bar (desktop ≥1440px) shows each with its label: Host table, Preview as player, Start / End
 * session and Account. Anything narrower (compact desktop, rail, phone) shows ONE labelled Table
 * controls button that opens a sheet listing the same controls as named rows. Help keeps its place
 * above 640px either way. */

// RC-ENG-15.2 — the four labelled controls, Help and the search field take ~950px. Below 1440px
// (measured at 1280: a 1016px bar) they squeezed the page title to its first four letters, so the
// labelled row is for 1440px and up; everything narrower collects the controls in the sheet.
const WIDE_TOP_BAR_QUERY = '(min-width: 1440px)';

function useWideTopBar(): boolean {
	const [wide, setWide] = useState(() => matchesMedia(WIDE_TOP_BAR_QUERY));
	useEffect(
		() => subscribeMedia([WIDE_TOP_BAR_QUERY], () => setWide(matchesMedia(WIDE_TOP_BAR_QUERY))),
		[],
	);
	return wide;
}

export function TopBar({
	onOpenPalette,
	viewport,
	compactToolbar,
}: {
	onOpenPalette: () => void;
	viewport: ReturnType<typeof useViewport>;
	compactToolbar: boolean;
}) {
	const { t } = useI18n();
	const location = useLocation();
	const [controlsOpen, setControlsOpen] = useState(false);
	const id = activeSectionId(location.pathname);
	// Screen routes share the stored name with the toolbar and document title (RC-CAN-8.4).
	// Other routes retain their translated section label.
	const screenName = useScreenRouteName();
	const title = screenName ?? t(sectionLabelKey(id));
	const subtitleKey = sectionSubtitleKey(id);
	const sub = subtitleKey ? t(subtitleKey) : '';
	const compact = viewport !== 'desktop' || compactToolbar;
	// The labelled controls need the full top bar; every narrower layout collects them in the sheet.
	const wideQuery = useWideTopBar();
	const wide = !compact && wideQuery;
	const runtime = useRuntime();
	// The DS buttons do not forward a ref (React 18), so a `display: contents` wrapper holds it.
	const controlsTriggerRef = useRef<HTMLSpanElement>(null);
	// Back from a companion preview opened from the sheet: the sheet is closed now, so its trigger —
	// the control the GM started from — takes focus (the inline trigger does this itself when wide).
	useEffect(() => {
		if (wide || runtime.preview) return;
		if (takePreviewReturnFocus()) controlsTriggerRef.current?.querySelector('button')?.focus();
		// Mount only, like ViewAsControl's half of the same hand-off.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	// RC-SES-1.1 — the live posture in the top bar is STATUS ONLY (TOPBAR_CHARTER): a non-interactive
	// label that says the table is live and for how long. Starting, pausing and ending a session stay
	// on /session and the projection control; nothing here is clickable. It is deliberately NOT an
	// aria-live region — a clock that ticks every second would talk over everything else.
	const posture = useSessionPosture();
	// On the phone the posture lives in the tab-bar status strip instead: a 375px top bar already
	// carries the title, search and the table-controls button, and a fourth chip would squeeze the
	// title to an ellipsis on the one profile that can least afford it.
	const liveLabel =
		posture.live && viewport !== 'phone'
			? posture.elapsed
				? t('shell.sessionLiveElapsed', { elapsed: posture.elapsed })
				: t('shell.sessionLive')
			: null;
	return (
		<>
			{/* RC-UX-6.1 — the shell's one Help menu. The top bar is the only chrome every tier mounts, so
			    it hosts the instance both triggers open; the Dialog portals to body, outside this bar. */}
			<HelpHost />
			<header
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: compact ? 'var(--space-1-5)' : 'var(--space-3)',
					padding:
						viewport === 'phone'
							? 'calc(10px + var(--safe-area-top, 0px)) max(12px, var(--safe-area-right, 0px)) 10px max(12px, var(--safe-area-left, 0px))'
							: compact
								? 'calc(11px + var(--safe-area-top, 0px)) max(16px, var(--safe-area-right, 0px)) 11px 16px'
								: 'calc(13px + var(--safe-area-top, 0px)) max(24px, var(--safe-area-right, 0px)) 13px 24px',
					borderBottom: `1px solid ${T.bd}`,
					background: 'color-mix(in srgb, var(--color-bg) 86%, transparent)',
					backdropFilter: 'blur(6px)',
					flex: '0 0 auto',
				}}
			>
				<div style={{ minWidth: 0, flex: '1 1 auto' }}>
					<h1
						title={title}
						style={{
							margin: 'var(--space-0)',
							font: '700 var(--text-xl) var(--font-sans)',
							letterSpacing: '-.01em',
							lineHeight: 1.15,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{title}
					</h1>
					{!compact && (
						<div
							title={sub}
							style={{
								font: `12.5px ${T.sans}`,
								color: T.sub,
								marginTop: 'var(--space-0-5)',
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
						>
							{sub}
						</div>
					)}
				</div>
				{liveLabel && (
					<span
						data-testid="topbar-session-live"
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 'var(--space-1-5)',
							flex: '0 0 auto',
							padding: 'var(--space-1) var(--space-2)',
							borderRadius: 'var(--radius-full)',
							background: T.accSub,
							border: `1px solid ${T.accBd}`,
							color: T.ink,
							font: `600 12px ${T.sans}`,
							whiteSpace: 'nowrap',
						}}
					>
						<StatusDot status="live" pulse />
						{liveLabel}
					</span>
				)}
				{compact ? (
					<IconButton
						icon="search"
						label={t('shell.search')}
						variant="outline"
						size="lg"
						style={{ flexShrink: 0 }}
						onClick={onOpenPalette}
					/>
				) : (
					<button
						type="button"
						onClick={onOpenPalette}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-2)',
							padding: 'var(--space-2) var(--space-3)',
							flex: '1 1 150px',
							// The field shares the bar with a title block that grows with its translation, so a
							// bare 46px floor let a long locale squeeze it to a stub: RC-UX-1.5's pseudo locale
							// cut "Search everything…" to under half. `fit-content` only binds while shrinking —
							// English still grows past it — and the title beside it ellipsizes by design.
							minWidth: 'fit-content',
							minHeight: 'var(--touch-target-min)',
							background: T.surf,
							border: `1px solid ${T.bd}`,
							borderRadius: 'var(--radius-md)',
							cursor: 'pointer',
							color: T.sub,
						}}
					>
						<Icon name="search" size="sm" />
						<span
							style={{
								flex: 1,
								textAlign: 'left',
								font: `13px ${T.sans}`,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
						>
							{t('shell.searchEverything')}
						</span>
						<span
							style={{
								font: `11px ${T.mono}`,
								color: T.sub,
								border: `1px solid ${T.bd}`,
								borderRadius: 'var(--radius-sm)',
								padding: 'var(--space-0-5) var(--space-1)',
							}}
						>
							⌘K
						</span>
					</button>
				)}
				{wide ? (
					<>
						<HostSessionButton />
						<ViewAsControl />
						<ProjectionControl />
						{/* RC-DOC-1.3 — Help's consistent location above 640px. The phone reaches the same
						    menu from `Footer.tsx`, which desktop and rail never mount. */}
						<HelpTrigger style={{ flex: '0 0 auto' }} />
						<AccountButton />
					</>
				) : (
					<>
						<span ref={controlsTriggerRef} style={{ display: 'contents' }}>
							{viewport === 'phone' ? (
								// RC-UX-4.2 — the phone top bar's ONE overflow (NAVIGATION.md §4). It announces itself
								// as a dialog opener with its open state, so a screen reader hears where the table
								// controls went instead of a bare "Table controls, button".
								<IconButton
									icon="session-bolt"
									label={t('shell.tableControls')}
									variant="outline"
									size="lg"
									style={{ flexShrink: 0 }}
									aria-haspopup="dialog"
									aria-expanded={controlsOpen}
									onClick={() => setControlsOpen(true)}
								/>
							) : (
								<Button
									variant="secondary"
									size="md"
									icon="session-bolt"
									aria-haspopup="dialog"
									aria-expanded={controlsOpen}
									onClick={() => setControlsOpen(true)}
									style={{ flex: '0 0 auto', minHeight: 'var(--touch-target-min)' }}
								>
									{t('shell.tableControls')}
								</Button>
							)}
						</span>
						{viewport !== 'phone' && <HelpTrigger style={{ flex: '0 0 auto' }} />}
					</>
				)}
			</header>
			{!wide && (
				<Sheet
					open={controlsOpen}
					onClose={() => setControlsOpen(false)}
					side={viewport === 'phone' ? 'bottom' : 'right'}
					size={viewport === 'phone' ? undefined : 380}
					title={t('shell.tableControls')}
					description={t('shell.tableControlsDescription')}
				>
					{/* Named rows, one per control, in the wide top bar's order. */}
					<div
						className="table-controls-sheet"
						style={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'stretch',
							gap: 'var(--space-2)',
							paddingBottom: 'var(--space-2)',
						}}
					>
						<HostSessionButton layout="row" />
						<ViewAsControl layout="row" />
						<ProjectionControl layout="row" />
						<AccountButton layout="row" />
					</div>
				</Sheet>
			)}
		</>
	);
}
