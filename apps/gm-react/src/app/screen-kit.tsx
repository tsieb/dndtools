import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, ProgressMeter, Skeleton } from '../ds';
import { useI18n } from '../i18n';
import { useListDetailSplit, useViewport } from './useViewport';

/**
 * screen-kit — the shared token shorthand + layout primitives ported verbatim from the online
 * prototype's app.jsx, so the section ports translate 1:1. `T` maps short keys to the exact design
 * tokens; `Page`/`Panel`/`Seg`/`SetRow`/`BackBar` are the recurring layout helpers. Colors/spacing/
 * type all resolve through the byte-identical token CSS vars.
 */

/**
 * ARIA radio-group keyboard contract for HAND-ROLLED radiogroups (a grid of choice cards, where the
 * compact `Seg` below is the wrong visual). Arrows move the selection — selection follows focus,
 * wrapping — so Tab treats the group as one stop. Pair it with a roving `tabIndex` on the radios.
 *
 * Lives here because three surfaces had grown their own byte-identical copy (Onboarding, Community)
 * or were missing it entirely (Settings' tool preferences).
 */
export function radioGroupKeyDown(e: ReactKeyboardEvent) {
	const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
	if (!keys.includes(e.key)) return;
	// The focused radio has to be located among ALL radios, but only ENABLED ones are landing sites:
	// arrowing onto a disabled radio moved focus to a control that cannot take the selection, and
	// since selection follows focus here it also silently dropped the user's choice on the floor.
	const all = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
	const enabled = all.filter(
		(r) => r.getAttribute('aria-disabled') !== 'true' && !(r as HTMLButtonElement).disabled,
	);
	if (enabled.length < 2) return;
	// Home/End are part of the ARIA radiogroup keyboard contract (WAI-ARIA APG), and this group can
	// be a wrapped grid of cards where "the first one" is not one arrow press away.
	if (e.key === 'Home' || e.key === 'End') {
		if (all.indexOf(e.target as HTMLElement) === -1) return;
		e.preventDefault();
		const edge = e.key === 'Home' ? enabled[0] : enabled[enabled.length - 1];
		edge?.focus();
		edge?.click();
		return;
	}
	const at = enabled.indexOf(e.target as HTMLElement);
	if (at === -1) return;
	e.preventDefault();
	const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
	const next = enabled[(at + delta + enabled.length) % enabled.length];
	next?.focus();
	next?.click();
}

export const T = {
	bg: 'var(--color-bg)',
	surf: 'var(--color-surface)',
	raised: 'var(--color-surface-raised)',
	alt: 'var(--color-surface-alt)',
	sunken: 'var(--color-surface-sunken)',
	overlay: 'var(--color-surface-overlay)',
	bd: 'var(--color-border)',
	bdS: 'var(--color-border-strong)',
	ink: 'var(--color-text-primary)',
	sub: 'var(--color-text-secondary)',
	ter: 'var(--color-text-tertiary)',
	acc: 'var(--color-accent)',
	accSub: 'var(--color-accent-subtle)',
	accBd: 'var(--color-accent-border)',
	accFg: 'var(--color-accent-foreground)',
	sans: 'var(--font-sans)',
	disp: 'var(--font-display)',
	mono: 'var(--font-mono)',
	ok: 'var(--color-status-success)',
	warn: 'var(--color-status-warning)',
	err: 'var(--color-status-error)',
	info: 'var(--color-status-info)',
	dm: 'var(--color-dm-only-badge)',
	hover: 'var(--color-interactive-hover)',
	space: {
		zero: 'var(--space-0)',
		half: 'var(--space-0-5)',
		one: 'var(--space-1)',
		oneHalf: 'var(--space-1-5)',
		two: 'var(--space-2)',
		three: 'var(--space-3)',
		four: 'var(--space-4)',
		five: 'var(--space-5)',
		six: 'var(--space-6)',
		eight: 'var(--space-8)',
		ten: 'var(--space-10)',
		twelve: 'var(--space-12)',
		sixteen: 'var(--space-16)',
		twenty: 'var(--space-20)',
		twentyFour: 'var(--space-24)',
	},
	radius: {
		none: 'var(--radius-none)',
		sm: 'var(--radius-sm)',
		md: 'var(--radius-md)',
		lg: 'var(--radius-lg)',
		xl: 'var(--radius-xl)',
		full: 'var(--radius-full)',
	},
	shadow: {
		sm: 'var(--shadow-sm)',
		md: 'var(--shadow-md)',
		lg: 'var(--shadow-lg)',
	},
	z: {
		base: 'var(--z-base)',
		raised: 'var(--z-raised)',
		dropdown: 'var(--z-dropdown)',
		sticky: 'var(--z-sticky)',
		overlay: 'var(--z-overlay)',
		modal: 'var(--z-modal)',
		sheet: 'var(--z-sheet)',
		toast: 'var(--z-toast)',
		tooltip: 'var(--z-tooltip)',
		command: 'var(--z-command)',
		titlebar: 'var(--z-titlebar)',
		dmBoundary: 'var(--z-dm-boundary)',
	},
	duration: {
		instant: 'var(--duration-instant)',
		micro: 'var(--duration-micro)',
		fast: 'var(--duration-fast)',
		standard: 'var(--duration-standard)',
		moderate: 'var(--duration-moderate)',
		slow: 'var(--duration-slow)',
		crawl: 'var(--duration-crawl)',
	},
	// The active `data-density` set (tokens/spacing.css). Read these instead of a fixed size so a
	// surface follows Standard/Comfortable/Compact and the touch lock.
	density: {
		touch: 'var(--density-touch-target)',
		focus: 'var(--density-focus-target)',
		nav: 'var(--density-nav-height)',
		navItem: 'var(--density-nav-item-height)',
		cardPad: 'var(--density-card-padding)',
		listGap: 'var(--density-list-gap)',
		icon: 'var(--density-icon-size)',
		input: 'var(--density-input-height)',
		button: 'var(--density-button-height)',
		font: 'var(--density-font-size)',
	},
	// Preserve the previous shadow aliases while migration uses the grouped token form above.
	smd: 'var(--shadow-md)',
	ssm: 'var(--shadow-sm)',
} as const;

/**
 * The app-wide eyebrow: a small uppercase section label. It was `--color-text-tertiary`, which is
 * `#837057` in parchment — 4.01:1 on `--color-bg` and 3.54:1 on `--color-surface-sunken`, i.e. below
 * WCAG 1.4.3's 4.5:1 for 11px text. That token is tuned for `--color-surface-raised` only (its own
 * comment in `tokens/colors.css` says so), and under `forced-colors: active` it maps to `GrayText`,
 * so every eyebrow rendered in the system's DISABLED colour — including the four structural `<h2>`
 * section headings on the Command Center, the app's landing surface. `--color-text-secondary` is
 * 6.28:1 on sunken and maps to `CanvasText`.
 */
export const eb: CSSProperties = {
	font: `600 11px ${T.sans}`,
	letterSpacing: '.09em',
	textTransform: 'uppercase',
	color: T.sub,
};

export const mono: CSSProperties = { fontFamily: T.mono };

/** Present to assistive tech, absent from the layout. */
export const srOnly: CSSProperties = {
	position: 'absolute',
	width: 1,
	height: 1,
	margin: -1,
	padding: 0,
	border: 0,
	overflow: 'hidden',
	clip: 'rect(0 0 0 0)',
	clipPath: 'inset(50%)',
	whiteSpace: 'nowrap',
};

/**
 * LoadingRegion — a skeleton placeholder that actually announces itself.
 *
 * The seven `role="status" aria-label="Loading …"` regions this replaces wrapped nothing but
 * `<Skeleton>`, and Skeleton is `aria-hidden` at all three of its return paths — so the live region
 * was permanently EMPTY. `aria-label` names a region; it is not CONTENT, and a live region announces
 * its content. Both the start of loading and its completion were therefore silent, on exactly the
 * panels (devices, invites, vault connections, marketplace listings) where a screen-reader user has
 * no visual shimmer to fall back on. Carrying the text inside fixes it once for every call site.
 *
 * RC-DSN-3.4 — two first-load presets and a determinate mode, so screens stop hand-rolling them:
 * - `skeleton="list"` (with `rows`) or `skeleton="canvas"` renders the DS skeleton for that shape
 *   when the call site passes no bespoke children.
 * - `progress` swaps the hidden label for a labelled meter with time-left copy, for work long
 *   enough to deserve one (import, backup, sync, generation). The label is the region's only
 *   spoken content; the percentage and ETA ride on the bar's `aria-valuetext`, so the polite region
 *   announces "Backing up vault" once instead of every tick.
 */
export function LoadingRegion({
	label,
	children,
	style,
	skeleton,
	rows,
	progress,
}: {
	label: string;
	children?: ReactNode;
	style?: CSSProperties;
	skeleton?: 'list' | 'canvas';
	/** Row count for `skeleton="list"`; match the rows the list usually opens with. */
	rows?: number;
	progress?: LoadingProgress;
}) {
	return (
		<div role="status" style={style}>
			{progress ? (
				<LoadingProgressMeter label={label} progress={progress} />
			) : (
				<span style={srOnly}>{label}</span>
			)}
			{children ?? (skeleton ? <Skeleton variant={skeleton} rows={rows} /> : null)}
		</div>
	);
}

/** Determinate progress for long work. Pass `remainingMs` when the work reports it, or `startedAt`
 * to have it extrapolated from the rate so far. */
export type LoadingProgress = {
	value: number;
	max?: number;
	/** Epoch ms the work began. */
	startedAt?: number;
	/** Time left as reported by the work itself; wins over the extrapolation. */
	remainingMs?: number;
	/** The clock, for tests; defaults to render time. */
	now?: number;
};

// Too little signal to extrapolate from: the first second, or the first 2%, of an import or backup
// is dominated by setup (a handshake, a directory walk) and projects a finish that is wildly wrong.
const ETA_MIN_ELAPSED_MS = 1000;
const ETA_MIN_FRACTION = 0.02;

/** Time left on determinate work at the rate so far, or `null` when there is nothing honest to
 * say: no progress yet, already done, or too early to have a rate. */
export function estimateRemainingMs({
	value,
	max = 100,
	startedAt,
	now = Date.now(),
}: {
	value: number;
	max?: number;
	startedAt: number;
	now?: number;
}): number | null {
	if (!(max > 0) || !(value > 0) || value >= max) return null;
	const elapsed = now - startedAt;
	if (!(elapsed >= ETA_MIN_ELAPSED_MS) || value / max < ETA_MIN_FRACTION) return null;
	return (elapsed * (max - value)) / value;
}

/** Coarsens a time left for copy: five-second steps under a minute, whole minutes under an hour.
 * Rounded UP, so the promise is one the work tends to beat, and coarse so the copy doesn't change
 * on every progress event. */
export function roundEtaMs(ms: number): number {
	const second = 1000;
	const minute = 60 * second;
	if (ms < minute) return Math.max(5, Math.ceil(ms / (5 * second)) * 5) * second;
	if (ms < 60 * minute) return Math.ceil(ms / minute) * minute;
	return ms;
}

function LoadingProgressMeter({ label, progress }: { label: string; progress: LoadingProgress }) {
	const { formatRelativeTime } = useI18n();
	const { value, max = 100, startedAt, remainingMs, now = Date.now() } = progress;
	const left =
		remainingMs != null && Number.isFinite(remainingMs) && remainingMs >= 0
			? remainingMs
			: startedAt != null
				? estimateRemainingMs({ value, max, startedAt, now })
				: null;
	// Intl's relative time ("in 2 minutes", "dentro de 2 minutos") localizes the copy without a
	// catalog string per duration.
	const eta =
		left != null && value < max ? formatRelativeTime(now + roundEtaMs(left), now) : undefined;
	return <ProgressMeter label={label} value={value} max={max} eta={eta} />;
}

/**
 * Panel — the app's card. Its padding defaults to the density card padding (16px, 12px compact;
 * RC-DSN-1.4). The old fixed 18px never followed Settings › Appearance › Density.
 */
export function Panel({
	title,
	action,
	children,
	style,
	// Keep card gutters bounded when the user enlarges text; leave room for the content.
	pad = `min(${T.density.cardPad}, 16px)`,
	accent,
}: {
	title?: ReactNode;
	action?: ReactNode;
	children?: ReactNode;
	style?: CSSProperties;
	pad?: number | string;
	accent?: boolean;
}) {
	return (
		<section
			style={{
				minWidth: 0,
				display: 'flex',
				flexDirection: 'column',
				gap: 12,
				background: T.raised,
				border: `1px solid ${accent ? T.accBd : T.bd}`,
				borderRadius: 10,
				padding: pad,
				boxShadow: accent ? T.smd : 'none',
				...style,
			}}
		>
			{title && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: 10,
						flexWrap: 'wrap',
					}}
				>
					<h2 style={{ font: `700 14px ${T.disp}`, color: T.ink, margin: 0 }}>{title}</h2>
					{action}
				</div>
			)}
			{children}
		</section>
	);
}

/** Which pane of a split list/detail screen a subtree renders in; `null` = an ordinary full page. */
const PaneContext = createContext<'list' | 'detail' | null>(null);

/**
 * True when screen content should lay out as ONE column: on a phone, or inside a split list/detail
 * pane (RC-UX-4.3), which is phone-width by construction. Detail views branch on this rather than on
 * the viewport — at 820px the viewport says `rail`, but a character sheet in its ~480px detail pane
 * would otherwise lay out two ~200px columns and overflow them, exactly as it once did on a phone.
 */
export function useSingleColumn(): boolean {
	const viewport = useViewport();
	const pane = useContext(PaneContext);
	return viewport === 'phone' || pane !== null;
}

export function Page({
	children,
	max = 1180,
	style,
}: {
	children?: ReactNode;
	max?: number;
	style?: CSSProperties;
}) {
	const viewport = useViewport();
	const pane = useContext(PaneContext);
	return (
		<div
			style={{
				width: '100%',
				minWidth: 0,
				// A split list/detail pane is phone-width but has no tab bar beneath it: tighter gutters
				// than a full rail page, without the phone's bottom clearance.
				padding:
					viewport === 'phone'
						? '16px 14px 76px'
						: pane
							? `${T.space.four} ${T.space.four} ${T.space.twelve}`
							: '24px 28px 56px',
				maxWidth: max,
				margin: '0 auto',
				...style,
			}}
		>
			{children}
		</div>
	);
}

/** The list pane's width once a detail is open: room for one ~230px card, never more than 360px. */
const LIST_PANE_WIDTH = 'clamp(280px, 34%, 360px)';

const paneScroll: CSSProperties = {
	minWidth: 0,
	minHeight: 0,
	overflowY: 'auto',
	overflowX: 'hidden',
	overscrollBehavior: 'contain',
};

/** A wrapper that is only there to hold a React position: it generates no box of its own. */
const CONTENTS: CSSProperties = { display: 'contents' };

/**
 * ListDetail — RC-UX-4.3's right detail panel contract for the list/detail screens (Characters,
 * Knowledge, Campaign, Atlas).
 *
 * Split (`useListDetailSplit`: the rail tier at ≥768px): the list keeps a column on the left and the
 * open detail takes a RIGHT panel beside it, so a tablet user moves between items without losing the
 * list. Both panes fill `<main>` (`height:100%`, the same bounded-pane contract as `/board`) and
 * scroll on their own; `<main>` itself never scrolls. The detail pane is a labelled region, and the
 * list stays mounted across open / close / switch, so its filters, scroll position and roving tab
 * stop survive. Content inside either pane reads `useSingleColumn()` as true. The detail brings its
 * own close affordance (a BackBar, a Cancel); closing it gives the list the full width back.
 *
 * With `detailKey` — the detail is something the user OPENED (a route id, an editor) — opening or
 * switching moves focus into the pane and scrolls it to the top, and closing returns focus to the
 * control that opened it. Omit it for a detail that is simply always shown (Atlas's selected map),
 * where following the selection would pull focus out of the list on every pick.
 *
 * Not split (desktop, phone, a narrow rail window): the open detail replaces the list as a full page,
 * exactly as these screens always behaved — the wrappers below collapse to `display:contents`, so the
 * page lays out as a direct child of `<main>` the way it did before this component existed.
 *
 * BOTH modes render the same two slots in the same order. Returning a bare fragment when not split
 * made the open detail a DIFFERENT position in the tree, so crossing the split width — a tablet
 * rotating from 820×1180 to 1180×820 — unmounted the whole detail and silently threw away whatever
 * was in it: a half-typed quest, an unsaved sheet edit. Keeping the slots means a rotation only
 * re-styles the panes.
 */
export function ListDetail({
	list,
	detail,
	detailLabel,
	detailKey,
}: {
	list: ReactNode;
	/** The open detail, or null/false when nothing is open. */
	detail: ReactNode;
	/** Accessible name of the detail region — the open item's own name. */
	detailLabel: string;
	detailKey?: string | null;
}) {
	const split = useListDetailSplit();
	const open = detail !== null && detail !== undefined && detail !== false;
	const detailRef = useRef<HTMLElement>(null);
	const openerRef = useRef<HTMLElement | null>(null);
	const shownKey = useRef(detailKey ?? null);

	useEffect(() => {
		if (detailKey === undefined) return;
		const previous = shownKey.current;
		shownKey.current = detailKey;
		if (!split || previous === detailKey) return;
		const pane = detailRef.current;
		if (detailKey !== null) {
			// Remember the list control that opened it — but not a link followed from INSIDE the pane
			// (a backlink), which should hand focus back to the original opener on close.
			const active = document.activeElement;
			if (active instanceof HTMLElement && active !== document.body && !pane?.contains(active)) {
				openerRef.current = active;
			}
			if (pane) {
				pane.scrollTop = 0;
				pane.focus({ preventScroll: true });
			}
			return;
		}
		const opener = openerRef.current;
		openerRef.current = null;
		// Only when closing left focus nowhere (the pane's own BackBar / Cancel unmounted with it) —
		// never pull focus back from somewhere the user has since moved it.
		const active = document.activeElement;
		if (opener?.isConnected && (active === null || active === document.body)) opener.focus();
	}, [split, detailKey]);

	return (
		<div
			data-list-detail={split ? '' : undefined}
			style={
				split
					? {
							display: 'grid',
							gridTemplateColumns: open ? `${LIST_PANE_WIDTH} minmax(0,1fr)` : 'minmax(0,1fr)',
							height: '100%',
							minHeight: 0,
						}
					: CONTENTS
			}
		>
			{/* Not split, with the detail open, the list is not rendered at all — the detail IS the page,
			    as it has always been on desktop and on a phone. */}
			{(split || !open) && (
				<div
					data-pane={split ? 'list' : undefined}
					style={
						split
							? { ...paneScroll, borderInlineEnd: open ? `1px solid ${T.bd}` : 'none' }
							: CONTENTS
					}
				>
					<PaneContext.Provider value={split && open ? 'list' : null}>{list}</PaneContext.Provider>
				</div>
			)}
			{open && (
				// Nameless and not focusable off the split tier: a bare <section> is generic, so the full
				// page keeps the accessibility tree it had before.
				<section
					ref={detailRef}
					tabIndex={split ? -1 : undefined}
					aria-label={(split && detailLabel) || undefined}
					data-pane={split ? 'detail' : undefined}
					style={split ? { ...paneScroll, outlineOffset: '-3px' } : CONTENTS}
				>
					<PaneContext.Provider value={split ? 'detail' : null}>{detail}</PaneContext.Provider>
				</section>
			)}
		</div>
	);
}

export function Seg({
	options,
	value,
	onChange,
	ariaLabel,
}: {
	options: {
		value: string;
		label: ReactNode;
		disabled?: boolean;
		/**
		 * Why this option is unavailable. Every live `Seg` renders its forbidden options as a mute
		 * 0.4-opacity dead control with no explanation at all — the session phase rail, Graph's
		 * viewpoint picker and seven Settings groups all do it.
		 */
		title?: string;
	}[];
	value: string;
	onChange: (v: string) => void;
	/** Names the group for assistive tech (the control is a radiogroup, WCAG 4.1.2). */
	ariaLabel?: string;
}) {
	const refs = useRef<(HTMLButtonElement | null)[]>([]);
	// ARIA radiogroup: one tab stop for the whole group, Arrow/Home/End move the selection
	// (same roving-tabIndex contract as ds/components/core/Tabs.jsx).
	// The tab stop belongs on the CHECKED radio, disabled or not: `off = o.disabled && !on` below
	// means the checked option is never natively disabled, so it is always focusable. Requiring
	// `!o.disabled` here moved the group's only tab stop to an UNCHECKED option — and when EVERY
	// option is disabled (Settings' AI provider picker does exactly that once a key is stored) the
	// fallback found nothing either, so the whole radiogroup dropped out of the tab order (WCAG 2.1.1).
	const checkedIndex = options.findIndex((o) => o.value === value);
	const tabStopIndex = checkedIndex >= 0 ? checkedIndex : options.findIndex((o) => !o.disabled);
	const moveSelection = (from: number, direction: number) => {
		if (options.length === 0) return;
		for (let offset = 1; offset <= options.length; offset += 1) {
			const index = (from + direction * offset + options.length) % options.length;
			const option = options[index];
			if (!option || (option.disabled && option.value !== value)) continue;
			refs.current[index]?.focus();
			onChange(option.value);
			return;
		}
	};
	return (
		<div
			role="radiogroup"
			aria-label={ariaLabel}
			style={{
				display: 'inline-flex',
				flexWrap: 'wrap',
				maxWidth: '100%',
				gap: 2,
				padding: 3,
				borderRadius: 9,
				background: T.sunken,
				border: `1px solid ${T.bd}`,
			}}
		>
			{options.map((o, index) => {
				const on = o.value === value;
				const off = o.disabled && !on;
				return (
					<button
						key={o.value}
						ref={(node) => {
							refs.current[index] = node;
						}}
						type="button"
						role="radio"
						aria-checked={on}
						title={o.title}
						tabIndex={index === tabStopIndex ? 0 : -1}
						disabled={off}
						onClick={() => !off && onChange(o.value)}
						// `Seg` is the app's most-used radiogroup (15+ live groups) and had no pointer
						// feedback at all on its unselected options, in a repo with no global
						// `button:hover` rule to fall back on. Its DS twin `SegmentedControl` has had
						// one since it shipped.
						onMouseEnter={(event) => {
							if (on || off) return;
							event.currentTarget.style.background = 'var(--color-interactive-hover)';
							event.currentTarget.style.color = 'var(--color-text-primary)';
						}}
						onMouseLeave={(event) => {
							if (on || off) return;
							event.currentTarget.style.background = 'transparent';
							event.currentTarget.style.color = T.sub;
						}}
						onKeyDown={(event) => {
							if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
								event.preventDefault();
								moveSelection(index, 1);
							} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
								event.preventDefault();
								moveSelection(index, -1);
							} else if (event.key === 'Home' || event.key === 'End') {
								event.preventDefault();
								moveSelection(event.key === 'Home' ? -1 : 0, event.key === 'Home' ? 1 : -1);
							}
						}}
						style={{
							padding: '7px 15px',
							borderRadius: 7,
							border: 'none',
							cursor: off ? 'not-allowed' : 'pointer',
							whiteSpace: 'nowrap',
							opacity: off ? 0.4 : 1,
							background: on ? T.accSub : 'transparent',
							color: on ? T.acc : T.sub,
							font: `${on ? 600 : 500} 12.5px ${T.sans}`,
						}}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}

/**
 * BackBar — the prototype's `<nav aria-label="Breadcrumb">` back link used at the top of creator /
 * detail routes (app.jsx `BackBar`). Pass a route `to` (navigated via react-router) or an explicit
 * `onClick`; `label` is the destination name shown beside the chevron.
 */
export function BackBar({
	to,
	label,
	onClick,
}: {
	to?: string;
	label: ReactNode;
	onClick?: () => void;
}) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [hover, setHover] = useState(false);
	return (
		// The negative offsets keep the link optically flush with the content below it now that the
		// button carries real padding — the visual position is unchanged, only the hit box grew.
		<nav aria-label={t('shell.breadcrumb')} style={{ margin: '0 0 8px -8px' }}>
			<button
				type="button"
				onClick={onClick ?? (() => navigate(to ?? '/'))}
				onMouseEnter={() => setHover(true)}
				onMouseLeave={() => setHover(false)}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 6,
					// `padding: 0` around a 16px chevron made the app's back navigation a ~19px-tall
					// target (WCAG 2.5.8 wants 24px), and with no global `button:hover` in this repo it
					// gave no pointer feedback at all. Padding rather than an inline `minHeight`: an
					// inline value would beat `html[data-android] button { min-height: 48px }` in
					// styles/index.css and shrink the target on the one platform that needs it most.
					padding: '4px 8px',
					borderRadius: 8,
					border: 'none',
					background: hover ? T.hover : 'transparent',
					cursor: 'pointer',
					color: hover ? T.ink : T.sub,
					font: `13px ${T.sans}`,
					transition:
						'background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard)',
				}}
			>
				<Icon name="chevron-left" size={16} />
				{label}
			</button>
		</nav>
	);
}

export function SetRow({
	label,
	help,
	control,
}: {
	label: ReactNode;
	help?: ReactNode;
	control?: ReactNode;
}) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 16,
				padding: '14px 0',
				borderBottom: `1px solid ${T.bd}`,
				flexWrap: 'wrap',
			}}
		>
			<div style={{ flex: '1 1 200px', minWidth: 0 }}>
				<div style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>{label}</div>
				{help && <div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 2 }}>{help}</div>}
			</div>
			<div style={{ minWidth: 0, maxWidth: '100%' }}>{control}</div>
		</div>
	);
}
