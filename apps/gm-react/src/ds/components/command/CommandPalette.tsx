import { dsCopy } from '../../copy';

export interface Command {
	id: string;
	label: string;
	/** Section heading the command lives under (UPPERCASE-rendered). Defaults to "Commands". */
	group?: string;
	/** Semantic Icon registry name shown in the leading tile. */
	icon?: string;
	/** One-line secondary text under the label. */
	description?: React.ReactNode;
	/** Extra terms to match against beyond the label. */
	keywords?: string | string[];
	/** Keycaps rendered on the right, e.g. ['⌘', 'K'] or 'G'. */
	shortcut?: string | string[];
	/** Right-aligned plain meta text (alternative to a shortcut), e.g. "Session". */
	meta?: React.ReactNode;
	/** Arbitrary trailing node (a VisibilityChip, Badge, …). */
	trailing?: React.ReactNode;
	/** Tints the active-row icon tile. Defaults to accent. */
	tone?: 'accent' | 'danger' | 'warning' | 'success' | 'info' | 'dm-only';
	disabled?: boolean;
	/** Invoked on Enter / click; the palette closes afterward. */
	run?: () => void;
}

export interface CommandPaletteProps extends Omit<
	React.HTMLAttributes<HTMLDivElement>,
	'children'
> {
	open?: boolean;
	onClose?: () => void;
	commands?: Command[];
	/** Command ids surfaced under a "Recent" section when the query is empty. */
	recentIds?: string[];
	/** Explicit section order; groups not listed fall to the end in first-seen order. */
	groupOrder?: string[];
	placeholder?: string;
	emptyTitle?: string;
	emptyDescription?: React.ReactNode;
	/** Show the ↑↓ / ↵ / esc hint bar. Default true. */
	showFooter?: boolean;
	labels?: {
		title?: string;
		results?: string;
		recent?: string;
		navigate?: string;
		select?: string;
		close?: string;
		resultCount?: (count: number) => string;
	};
	emptyIllustration?: React.ComponentProps<typeof Illustration>['name'];
}

import React from 'react';
import { Illustration } from '../../illustrations';
import { Icon } from '../core/Icon';
import { Kbd, PaletteRow } from './CommandPaletteRow.jsx';
import { registerBackHandler } from '../../../platform/backNavigation';
import { ownsEscape, popEscapeLayer, pushEscapeLayer } from '../../../platform/escapeLayers';
import { restoreReturnFocus } from '../../../platform/returnFocus';

/** Keyboard-driven modal combobox: arrows skip disabled rows, Enter runs, Escape closes.
 * Recent commands precede authored groups; active rows use both tint and a rail.
 * Fixed-position inline rendering follows the shared Dialog focus/back contract. */
function matches(q: string, c: Command) {
	if (!q) return true;
	const hay = (
		c.label +
		' ' +
		(c.keywords ? (Array.isArray(c.keywords) ? c.keywords.join(' ') : c.keywords) : '') +
		' ' +
		(c.group || '')
	).toLowerCase();
	return q.split(/\s+/).every((t) => hay.includes(t));
}

interface CommandSection {
	label: string;
	icon?: string;
	items: Command[];
}
function buildSections(
	commands: Command[],
	q: string,
	recentIds: string[] | undefined,
	groupOrder: string[] | undefined,
	recentLabel: string,
): CommandSection[] {
	const visible = commands.filter((c) => matches(q, c));
	const order = (items: Command[]) => {
		const seen: string[] = [];
		for (const c of items) {
			const g = c.group || 'Commands';
			if (!seen.includes(g)) seen.push(g);
		}
		const sorted =
			groupOrder && groupOrder.length
				? [...seen].sort((a, b) => {
						const ia = groupOrder.indexOf(a),
							ib = groupOrder.indexOf(b);
						return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
					})
				: seen;
		return sorted.map((g) => ({
			label: g,
			items: items.filter((c) => (c.group || 'Commands') === g),
		}));
	};
	if (!q && recentIds && recentIds.length) {
		const byId = new Map(commands.map((c) => [c.id, c]));
		const recent = recentIds.map((id) => byId.get(id)).filter(Boolean) as Command[];
		const recentSet = new Set(recentIds);
		const rest = visible.filter((c) => !recentSet.has(c.id));
		return [{ label: recentLabel, icon: 'recent', items: recent }, ...order(rest)].filter(
			(s) => s.items.length,
		);
	}
	return order(visible).filter((s) => s.items.length);
}

export function CommandPalette({
	open = false,
	onClose,
	commands = [],
	recentIds = [],
	groupOrder,
	placeholder = 'Search destinations and actions…',
	emptyTitle = 'No matches',
	emptyDescription = 'Try a different word, or check your spelling.',
	showFooter = true,
	labels = {},
	emptyIllustration,
	style,
	...rest
}: CommandPaletteProps) {
	const [query, setQuery] = React.useState('');
	const [active, setActive] = React.useState(0);
	const inputRef = React.useRef<HTMLInputElement | null>(null);
	const listRef = React.useRef<HTMLDivElement | null>(null);
	const panelRef = React.useRef<HTMLDivElement | null>(null);
	const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
	const returnFocusRef = React.useRef<HTMLElement | null>(null);
	const onCloseRef = React.useRef(onClose);
	onCloseRef.current = onClose;
	const baseId = React.useId();

	const q = query.trim().toLowerCase();
	const sections = React.useMemo(
		() => buildSections(commands, q, recentIds, groupOrder, labels.recent ?? 'Recent'),
		[commands, q, recentIds, groupOrder, labels.recent],
	);
	const flat = React.useMemo(() => sections.flatMap((s) => s.items), [sections]);

	React.useEffect(() => {
		if (!open) return undefined;
		returnFocusRef.current = document.activeElement as HTMLElement | null;
		setQuery('');
		setActive(0);
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const unregisterBack = registerBackHandler('overlay', () => {
			void (onCloseRef.current && onCloseRef.current());
			return true;
		});
		const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
		return () => {
			clearTimeout(t);
			unregisterBack();
			document.body.style.overflow = prevOverflow;
			// Palette commands NAVIGATE, so the opener is usually gone by the time this cleanup
			// runs and `.focus()` on a detached node is a silent no-op — focus fell to <body> and the
			// next Tab restarted at the browser chrome (WCAG 2.4.3). `restoreReturnFocus` is the shared
			// policy Dialog and Sheet already use: reclaim only when closing STRANDED focus, and fall
			// back to the page's `<main>` landmark when the opener died with the action it performed.
			restoreReturnFocus(returnFocusRef.current);
		};
	}, [open]);

	// Escape is owned on `document` in CAPTURE, like Dialog/Sheet/Popover, not by the input: the
	// input only takes focus on the next tick, so an Escape pressed straight after opening landed
	// on the opener, was dropped, and the palette then grabbed focus and stayed up over the page.
	// A layout effect, so the listener is live before the palette is ever painted.
	React.useLayoutEffect(() => {
		if (!open) return undefined;
		const escapeToken = pushEscapeLayer(() => panelRef.current);
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || !ownsEscape(escapeToken)) return;
			e.preventDefault();
			e.stopPropagation();
			void (onCloseRef.current && onCloseRef.current());
		};
		document.addEventListener('keydown', onKey, true);
		return () => {
			document.removeEventListener('keydown', onKey, true);
			popEscapeLayer(escapeToken);
		};
	}, [open]);

	// keep active in-range and on an enabled row
	React.useEffect(() => {
		setActive((a) => {
			let i = Math.min(Math.max(0, a), Math.max(0, flat.length - 1));
			let guard = 0;
			while (flat[i] && flat[i].disabled && guard < flat.length) {
				i = (i + 1) % flat.length;
				guard++;
			}
			return i;
		});
	}, [flat.length, q]);

	// scroll active row into view without scrollIntoView
	React.useEffect(() => {
		const el = itemRefs.current[active];
		const list = listRef.current;
		if (!el || !list) return;
		const top = el.offsetTop;
		const bottom = top + el.offsetHeight;
		if (top < list.scrollTop) list.scrollTop = top - 8;
		else if (bottom > list.scrollTop + list.clientHeight)
			list.scrollTop = bottom - list.clientHeight + 8;
	}, [active, q, flat.length]);

	if (!open) return null;

	const step = (dir: number) => {
		if (!flat.length) return;
		setActive((a) => {
			let i = a;
			for (let n = 0; n < flat.length; n++) {
				i = (i + dir + flat.length) % flat.length;
				if (!flat[i].disabled) return i;
			}
			return a;
		});
	};
	const run = (cmd: Command | undefined) => {
		if (!cmd || cmd.disabled) return;
		if (cmd.run) cmd.run();
		if (onClose) onClose();
	};
	const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			step(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			step(-1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			setActive(flat.findIndex((c) => !c.disabled));
		} else if (e.key === 'End') {
			e.preventDefault();
			for (let i = flat.length - 1; i >= 0; i--) {
				if (!flat[i].disabled) {
					setActive(i);
					break;
				}
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			run(flat[active]);
		} else if (e.key === 'Tab') {
			// The panel declares aria-modal but the input is its only focusable child, so an
			// untrapped Tab moved focus into the shell behind the scrim. Results are driven by
			// Arrow/Enter, so there is nowhere for Tab to legitimately go.
			e.preventDefault();
		}
	};

	let counter = -1;
	itemRefs.current = [];

	return (
		<div
			className="app-fixed-viewport"
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 'var(--z-command)',
				display: 'flex',
				alignItems: 'flex-start',
				justifyContent: 'center',
				padding:
					'max(14vh, calc(var(--safe-area-top, 0px) + var(--space-6))) max(var(--space-6), var(--safe-area-right, 0px)) max(var(--space-6), var(--safe-area-bottom, 0px)) max(var(--space-6), var(--safe-area-left, 0px))',
				background: 'var(--color-backdrop)',
				animation: 'dndScrimIn var(--duration-fast) var(--easing-standard)',
			}}
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) void (onClose && onClose());
			}}
		>
			<style>
				{
					'@keyframes dndScrimIn{from{opacity:0}to{opacity:1}}@keyframes dndCmdIn{from{opacity:0;transform:translateY(-10px) scale(.99)}to{opacity:1;transform:none}}'
				}
			</style>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-label={labels.title ?? dsCopy['ds.commandPalette.commandPalette']}
				style={{
					width: 620,
					maxWidth: '100%',
					maxHeight: '70vh',
					display: 'flex',
					flexDirection: 'column',
					background: 'var(--color-surface-raised)',
					border: '1px solid var(--color-border-strong)',
					borderRadius: 'var(--radius-lg)',
					boxShadow: 'var(--shadow-lg)',
					color: 'var(--color-text-primary)',
					overflow: 'hidden',
					animation: 'dndCmdIn var(--duration-standard) var(--easing-decelerate)',
					...style,
				}}
				{...rest}
			>
				{/* search row */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-3)',
						padding: 'var(--space-3) var(--space-4)',
						borderBottom: '1px solid var(--color-border)',
					}}
				>
					<Icon
						name="search"
						size="sm"
						style={{ color: 'var(--color-text-secondary)', flex: '0 0 auto' }}
					/>
					<input
						ref={inputRef}
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setActive(0);
						}}
						onKeyDown={onKey}
						placeholder={placeholder}
						role="combobox"
						aria-expanded="true"
						aria-controls={`${baseId}-list`}
						aria-activedescendant={flat[active] ? `${baseId}-opt-${active}` : undefined}
						aria-autocomplete="list"
						spellCheck={false}
						autoComplete="off"
						style={{
							flex: 1,
							minWidth: 0,
							border: 'none',
							// NO inline `outline: 'none'` — an inline style beats the global `:focus-visible`
							// rule in `styles/tokens/base.css`, and this input is the palette's only focusable
							// control. This is the regression class the repo has now shipped four times.
							background: 'transparent',
							fontFamily: 'var(--font-sans)',
							fontSize: 'var(--text-md)',
							color: 'var(--color-text-primary)',
						}}
					/>
					<Kbd>esc</Kbd>
				</div>

				{/* results */}
				<div
					ref={listRef}
					id={`${baseId}-list`}
					role="listbox"
					aria-label={labels.results ?? dsCopy['ds.commandPalette.results']}
					style={{
						position: 'relative',
						overflowY: 'auto',
						flex: '1 1 auto',
						padding: 'var(--space-2)',
					}}
				>
					{flat.length === 0 ? (
						<div
							role="option"
							aria-disabled="true"
							aria-selected="false"
							style={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								textAlign: 'center',
								gap: 'var(--space-2)',
								padding: 'var(--space-6) var(--space-5)',
								color: 'var(--color-text-secondary)',
							}}
						>
							{emptyIllustration ? (
								<Illustration name={emptyIllustration} />
							) : (
								<Icon name="search" size="lg" />
							)}
							<div
								style={{
									fontFamily: 'var(--font-sans)',
									fontSize: 'var(--text-base)',
									fontWeight: 'var(--font-weight-semibold)',
									color: 'var(--color-text-secondary)',
								}}
							>
								{emptyTitle}
							</div>
							{emptyDescription && (
								<div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)' }}>
									{emptyDescription}
								</div>
							)}
						</div>
					) : (
						sections.map((sec) => (
							<div
								key={sec.label}
								role="group"
								aria-label={sec.label}
								style={{ marginBottom: 'var(--space-1)' }}
							>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 'var(--space-1-5)',
										padding: 'var(--space-2) var(--space-2) var(--space-1)',
										fontFamily: 'var(--font-sans)',
										fontSize: 'var(--text-2xs)',
										fontWeight: 'var(--font-weight-semibold)',
										letterSpacing: 'var(--tracking-wider)',
										textTransform: 'uppercase',
										color: 'var(--color-text-secondary)',
									}}
								>
									{sec.icon && <Icon name={sec.icon} size="micro" />}
									<span>{sec.label}</span>
								</div>
								{sec.items.map((cmd) => {
									counter += 1;
									const idx = counter;
									return (
										<PaletteRow
											key={cmd.id}
											cmd={cmd}
											id={`${baseId}-opt-${idx}`}
											isActive={idx === active}
											rowRef={(el: HTMLDivElement | null) => {
												itemRefs.current[idx] = el;
											}}
											onActivate={() => setActive(idx)}
											onRun={() => run(cmd)}
										/>
									);
								})}
							</div>
						))
					)}
				</div>

				{/* footer hint bar */}
				{showFooter && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-4)',
							flexWrap: 'wrap',
							padding: 'var(--space-2) var(--space-4)',
							borderTop: '1px solid var(--color-border)',
							background: 'var(--color-surface)',
							fontFamily: 'var(--font-sans)',
							fontSize: 'var(--text-xs)',
							color: 'var(--color-text-secondary)',
						}}
					>
						<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
							<Kbd>↑</Kbd>
							<Kbd>↓</Kbd> {labels.navigate ?? dsCopy['ds.commandPalette.navigate']}
						</span>
						<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
							<Kbd>↵</Kbd> {labels.select ?? dsCopy['ds.commandPalette.select']}
						</span>
						<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
							<Kbd>esc</Kbd> {labels.close ?? dsCopy['ds.commandPalette.close']}
						</span>
						<span
							// The app's primary search returned its result count as plain text, so a screen-reader
							// user typing here heard nothing change (WCAG 4.1.3). The span is permanent and only
							// its contents update, which is what a polite region needs to announce reliably.
							role="status"
							aria-live="polite"
							aria-atomic="true"
							style={{
								marginLeft: 'auto',
								fontFamily: 'var(--font-mono)',
								fontSize: 'var(--text-2xs)',
								letterSpacing: 'var(--tracking-wide)',
							}}
						>
							{labels.resultCount
								? labels.resultCount(flat.length)
								: `${flat.length} ${flat.length === 1 ? 'result' : 'results'}`}
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
