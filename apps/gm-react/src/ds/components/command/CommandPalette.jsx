import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { registerBackHandler } from '../../../platform/backNavigation';

/**
 * CommandPalette — the ⌘K hot path. One overlay that lets the DM jump to any destination or fire
 * any action by typing, without leaving the table. It is the keyboard spine of the seven-section
 * IA the voice guide already promises ("⌘K on desktop") and the reserved `--z-command` token was
 * always waiting for.
 *
 * Behaviour & a11y contract:
 *  - role=dialog, aria-modal, labelled by the search box; opens focused on the input.
 *  - A combobox/listbox pairing: the input owns aria-activedescendant; ↑/↓ move the active row
 *    (wrapping, skipping disabled), Home/End jump, Enter runs it, Esc closes. Pointer hover also
 *    sets active so mouse and keyboard never disagree.
 *  - Substring match over each command's label + keywords; empty query surfaces a Recent section
 *    (from `recentIds`) above the authored groups, then a calm empty state when nothing matches.
 *  - Active row uses the system's selected treatment — gold tint + a gold left rail — never colour
 *    alone; group headers are UPPERCASE tracked eyebrows; command labels stay sentence case.
 *  - Top-anchored (not centred) so the eye lands where typing happens; scrim click + Esc close.
 *
 * Renders inline (fixed-position, token z-index) like Dialog/Popover — no portal, no ReactDOM dep.
 */
function matches(q, c) {
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

function buildSections(commands, q, recentIds, groupOrder) {
	const visible = commands.filter((c) => matches(q, c));
	const order = (items) => {
		const seen = [];
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
		const recent = recentIds.map((id) => byId.get(id)).filter(Boolean);
		const recentSet = new Set(recentIds);
		const rest = visible.filter((c) => !recentSet.has(c.id));
		return [{ label: 'Recent', icon: 'recent', items: recent }, ...order(rest)].filter(
			(s) => s.items.length,
		);
	}
	return order(visible).filter((s) => s.items.length);
}

function Kbd({ children }) {
	return (
		<kbd
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				minWidth: 18,
				height: 18,
				padding: '0 5px',
				fontFamily: 'var(--font-mono)',
				fontSize: 'var(--text-2xs)',
				fontWeight: 'var(--font-weight-medium)',
				lineHeight: 1,
				color: 'var(--color-text-tertiary)',
				background: 'var(--color-surface-sunken)',
				border: '1px solid var(--color-border)',
				borderRadius: 'var(--radius-sm)',
			}}
		>
			{children}
		</kbd>
	);
}

const TONE_COLOR = {
	accent: 'var(--color-accent)',
	danger: 'var(--color-status-error)',
	warning: 'var(--color-status-warning)',
	success: 'var(--color-status-success)',
	info: 'var(--color-status-info)',
	'dm-only': 'var(--color-dm-only-badge, #a763e8)',
};

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
	style,
	...rest
}) {
	const [query, setQuery] = React.useState('');
	const [active, setActive] = React.useState(0);
	const inputRef = React.useRef(null);
	const listRef = React.useRef(null);
	const panelRef = React.useRef(null);
	const itemRefs = React.useRef([]);
	const returnFocusRef = React.useRef(null);
	const onCloseRef = React.useRef(onClose);
	onCloseRef.current = onClose;
	const baseId = React.useId();

	const q = query.trim().toLowerCase();
	const sections = React.useMemo(
		() => buildSections(commands, q, recentIds, groupOrder),
		[commands, q, recentIds, groupOrder],
	);
	const flat = React.useMemo(() => sections.flatMap((s) => s.items), [sections]);

	React.useEffect(() => {
		if (!open) return undefined;
		returnFocusRef.current = document.activeElement;
		setQuery('');
		setActive(0);
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const unregisterBack = registerBackHandler('overlay', () => {
			onCloseRef.current && onCloseRef.current();
			return true;
		});
		const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
		return () => {
			clearTimeout(t);
			unregisterBack();
			document.body.style.overflow = prevOverflow;
			const rf = returnFocusRef.current;
			if (rf && rf.focus) rf.focus();
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

	const step = (dir) => {
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
	const run = (cmd) => {
		if (!cmd || cmd.disabled) return;
		if (cmd.run) cmd.run();
		if (onClose) onClose();
	};
	const onKey = (e) => {
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
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onClose && onClose();
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
				if (e.target === e.currentTarget) onClose && onClose();
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
				aria-label="Command palette"
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
						style={{ color: 'var(--color-text-tertiary)', flex: '0 0 auto' }}
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
							outline: 'none',
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
					aria-label="Results"
					style={{
						position: 'relative',
						overflowY: 'auto',
						flex: '1 1 auto',
						padding: 'var(--space-2)',
					}}
				>
					{flat.length === 0 ? (
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								textAlign: 'center',
								gap: 'var(--space-2)',
								padding: 'var(--space-7) var(--space-5)',
								color: 'var(--color-text-tertiary)',
							}}
						>
							<Icon name="search" size="lg" style={{ opacity: 0.5 }} />
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
										color: 'var(--color-text-tertiary)',
									}}
								>
									{sec.icon && <Icon name={sec.icon} size="micro" />}
									<span>{sec.label}</span>
								</div>
								{sec.items.map((cmd) => {
									counter += 1;
									const idx = counter;
									const isActive = idx === active;
									const tone = TONE_COLOR[cmd.tone] || 'var(--color-accent)';
									return (
										<div
											key={cmd.id}
											ref={(el) => {
												itemRefs.current[idx] = el;
											}}
											id={`${baseId}-opt-${idx}`}
											role="option"
											aria-selected={isActive}
											aria-disabled={cmd.disabled || undefined}
											onMouseMove={() => {
												if (!cmd.disabled) setActive(idx);
											}}
											onClick={() => run(cmd)}
											style={{
												position: 'relative',
												display: 'flex',
												alignItems: 'center',
												gap: 'var(--space-3)',
												padding: 'var(--space-2) var(--space-2-5)',
												borderRadius: 'var(--radius-md)',
												cursor: cmd.disabled ? 'not-allowed' : 'pointer',
												opacity: cmd.disabled ? 0.45 : 1,
												background: isActive ? 'var(--color-interactive-selected)' : 'transparent',
												transition: 'background var(--duration-fast) var(--easing-standard)',
											}}
										>
											{isActive && (
												<span
													aria-hidden="true"
													style={{
														position: 'absolute',
														left: 0,
														top: 6,
														bottom: 6,
														width: 3,
														borderRadius: 'var(--radius-full)',
														background: 'var(--color-accent)',
													}}
												/>
											)}
											{cmd.icon && (
												<span
													style={{
														display: 'inline-flex',
														alignItems: 'center',
														justifyContent: 'center',
														width: 30,
														height: 30,
														flex: '0 0 auto',
														borderRadius: 'var(--radius-md)',
														background: isActive
															? 'color-mix(in srgb, ' + tone + ' 16%, transparent)'
															: 'var(--color-surface-sunken)',
														color: isActive ? tone : 'var(--color-text-secondary)',
														transition:
															'background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard)',
													}}
												>
													<Icon name={cmd.icon} size="sm" />
												</span>
											)}
											<div
												style={{
													flex: 1,
													minWidth: 0,
													display: 'flex',
													flexDirection: 'column',
													gap: 1,
												}}
											>
												<span
													style={{
														fontFamily: 'var(--font-sans)',
														fontSize: 'var(--text-base)',
														fontWeight: 'var(--font-weight-medium)',
														color: 'var(--color-text-primary)',
														whiteSpace: 'nowrap',
														overflow: 'hidden',
														textOverflow: 'ellipsis',
													}}
												>
													{cmd.label}
												</span>
												{cmd.description && (
													<span
														style={{
															fontFamily: 'var(--font-sans)',
															fontSize: 'var(--text-xs)',
															color: 'var(--color-text-tertiary)',
															whiteSpace: 'nowrap',
															overflow: 'hidden',
															textOverflow: 'ellipsis',
														}}
													>
														{cmd.description}
													</span>
												)}
											</div>
											{cmd.meta && (
												<span
													style={{
														fontFamily: 'var(--font-sans)',
														fontSize: 'var(--text-xs)',
														color: 'var(--color-text-tertiary)',
														flex: '0 0 auto',
													}}
												>
													{cmd.meta}
												</span>
											)}
											{cmd.shortcut && (
												<span
													style={{
														display: 'inline-flex',
														alignItems: 'center',
														gap: 3,
														flex: '0 0 auto',
													}}
												>
													{(Array.isArray(cmd.shortcut) ? cmd.shortcut : [cmd.shortcut]).map(
														(k, i) => (
															<Kbd key={i}>{k}</Kbd>
														),
													)}
												</span>
											)}
											{cmd.trailing && (
												<span
													style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' }}
												>
													{cmd.trailing}
												</span>
											)}
										</div>
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
							color: 'var(--color-text-tertiary)',
						}}
					>
						<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
							<Kbd>↑</Kbd>
							<Kbd>↓</Kbd> navigate
						</span>
						<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
							<Kbd>↵</Kbd> select
						</span>
						<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
							<Kbd>esc</Kbd> close
						</span>
						<span
							style={{
								marginLeft: 'auto',
								fontFamily: 'var(--font-mono)',
								fontSize: 'var(--text-2xs)',
								letterSpacing: 'var(--tracking-wide)',
							}}
						>
							{flat.length} {flat.length === 1 ? 'result' : 'results'}
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
