import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PreviewSelection } from '@dndtools/core';
import { Icon, Toaster } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { registerBackHandler } from '../platform/backNavigation';
import { T } from './screen-kit';

/**
 * ViewAsControl — the "view as" / preview switcher (was entirely absent in the visual port despite
 * the runtime shipping the model). It drives the real `SceneRuntime` preview: previewing as a
 * player/observer projects the actor-filtered, player-safe view and makes every mutation read-only
 * (the runtime rejects writes while previewing); "Back to DM" exits. DM-only, fail-closed.
 */
export function ViewAsControl({ compact = false }: { compact?: boolean } = {}) {
	const runtime = useRuntime();
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const preview = runtime.preview;

	// Move focus into the menu when it opens so the open menu is keyboard-operable. The selector used
	// to be `[role="menuitem"]`, but every row is a `menuitemradio` — it matched nothing, focus stayed
	// on the trigger, and since Escape and the arrow keys are bound to the menu container they were
	// both dead until the user manually Tabbed in. Prefer the checked row, as ARIA menus do.
	useEffect(() => {
		if (!open) return;
		const menu = menuRef.current;
		const target =
			menu?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]') ??
			menu?.querySelector<HTMLElement>('[role="menuitemradio"]');
		target?.focus();
	}, [open]);
	useEffect(() => {
		if (!open) return undefined;
		return registerBackHandler('overlay', () => {
			setOpen(false);
			triggerRef.current?.focus();
			return true;
		});
	}, [open]);

	function close(restoreFocus = false) {
		setOpen(false);
		if (restoreFocus) triggerRef.current?.focus();
	}
	const ownerActor = runtime.state.permissions.actors[runtime.defaultActorId];
	const isDm =
		runtime.actors.some((a) => a.role === 'dm' && a.id === runtime.defaultActorId) ||
		ownerActor?.role === 'dm';

	const players = runtime.actors.filter((a) => a.role === 'player');
	const coDms = runtime.actors.filter((a) => a.role === 'co-dm');

	// Both use close(true): picking an item with the keyboard used to drop focus to <body>, so the
	// next Tab restarted from the top of the top bar (WCAG 2.4.3).
	function preview_(selection: PreviewSelection, label: string) {
		runtime.enterPreview(selection);
		Toaster.info(`Previewing as ${label} · changes are read-only`);
		close(true);
	}
	function exit() {
		runtime.exitPreview();
		Toaster.success('Back to your DM view');
		close(true);
	}

	// Only the device-owner DM may preview; a non-DM owner shouldn't see the control.
	if (!isDm && !preview) return null;

	const label = preview ? preview.label : 'DM view';

	return (
		<div style={{ position: 'relative', flex: '0 0 auto' }}>
			<button
				ref={triggerRef}
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label={preview ? `Previewing as ${label}` : 'Preview as another role'}
				title={preview ? `Previewing as ${label}` : 'Preview as another role'}
				onClick={() => setOpen((v) => !v)}
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: compact ? 0 : 8,
					width: compact ? 44 : undefined,
					height: compact ? 44 : undefined,
					padding: compact ? 0 : '6px 11px',
					borderRadius: 9,
					background: preview ? T.accSub : T.surf,
					border: `1px solid ${preview ? T.accBd : T.bd}`,
					cursor: 'pointer',
					color: preview ? T.acc : T.sub,
				}}
			>
				<Icon name="visibility-players" size="sm" />
				{!compact && (
					<span style={{ font: `12px ${T.sans}`, whiteSpace: 'nowrap' }}>
						{preview ? `Preview: ${label}` : 'View as'}
					</span>
				)}
				{!compact && <Icon name="chevron-down" size={12} />}
			</button>
			{open && (
				<>
					<div
						className="app-fixed-viewport"
						onClick={() => close()}
						style={{ position: 'fixed', inset: 0, zIndex: 40 }}
					/>
					<div
						role="menu"
						ref={menuRef}
						onKeyDown={(e) => {
							if (e.key === 'Escape') {
								e.preventDefault();
								close(true);
								return;
							}
							// ARIA menus are arrow-navigated, not Tab-navigated. Without this the only way
							// through a full party's preview list was Tab, which also walked straight out of
							// the menu into the page behind it. Tabbing out now dismisses the menu rather
							// than leaving it open over controls the invisible click-catcher still covers.
							if (e.key === 'Tab') {
								// `close(true)` — restore focus to the trigger. Without it the menu
								// unmounted from under the focused row, focus fell to <body>, and the
								// native Tab that follows restarted from the TOP of the document
								// instead of continuing past the trigger (WCAG 2.4.3). The two other
								// dismissals in this file already pass `true` for exactly this reason.
								close(true);
								return;
							}
							const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
							if (!keys.includes(e.key)) return;
							const items = Array.from(
								menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ??
									[],
							);
							if (items.length === 0) return;
							e.preventDefault();
							const at = items.indexOf(document.activeElement as HTMLButtonElement);
							const to =
								e.key === 'Home'
									? 0
									: e.key === 'End'
										? items.length - 1
										: e.key === 'ArrowDown'
											? at < 0
												? 0
												: (at + 1) % items.length
											: at < 0
												? items.length - 1
												: (at - 1 + items.length) % items.length;
							items[to]?.focus();
						}}
						style={{
							position: 'absolute',
							right: 0,
							top: 'calc(100% + 6px)',
							zIndex: 50,
							minWidth: 220,
							// A full party (6+ players plus co-DMs) ran the menu past the viewport, and
							// the fixed click-catcher behind it swallows wheel/touch, so the overflowing
							// rows were unreachable.
							maxHeight: 'min(70vh, 420px)',
							overflowY: 'auto',
							background: T.overlay,
							border: `1px solid ${T.bdS}`,
							borderRadius: 10,
							boxShadow: T.smd,
							padding: 6,
							display: 'flex',
							flexDirection: 'column',
							gap: 1,
						}}
					>
						<MenuItem icon="dm-only" label="DM view" active={!preview} onClick={exit} />
						<div
							role="separator"
							style={{ height: 1, background: T.bd, margin: '4px 0' }}
						/>
						<MenuLabel>Preview as</MenuLabel>
						<MenuItem
							icon="visibility-players"
							label="Any player"
							active={!!preview && preview.role === 'player' && !preview.specific}
							onClick={() => preview_({ role: 'player' }, 'Player')}
						/>
						<MenuItem
							icon="eye"
							label="Observer"
							active={!!preview && preview.role === 'observer'}
							onClick={() => preview_({ role: 'observer' }, 'Observer')}
						/>
						<MenuItem
							icon="session-bolt"
							label="Co-DM"
							active={!!preview && preview.role === 'co-dm' && !preview.specific}
							onClick={() => preview_({ role: 'co-dm' }, 'Co-DM')}
						/>
						{coDms.map((c) => (
							<MenuItem
								key={c.id}
								icon="session-bolt"
								label={c.displayName}
								active={!!preview && preview.specific && preview.actorId === c.id}
								onClick={() => preview_({ role: 'co-dm', playerActorId: c.id }, c.displayName)}
							/>
						))}
						{players.length > 0 && <MenuLabel>Specific players</MenuLabel>}
						{players.map((p) => (
							<MenuItem
								key={p.id}
								icon="characters-person"
								label={p.displayName}
								active={!!preview && preview.specific && preview.actorId === p.id}
								onClick={() => preview_({ role: 'player', playerActorId: p.id }, p.displayName)}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}

function MenuLabel({ children }: { children: ReactNode }) {
	return (
		<div
			// A bare div is not a valid owned child of role="menu" (axe `aria-required-children`), and the
			// group headings are decorative — the following items carry their own names.
			role="presentation"
			style={{
				font: `600 10px ${T.sans}`,
				letterSpacing: '.08em',
				textTransform: 'uppercase',
				color: T.ter,
				padding: '6px 8px 2px',
			}}
		>
			{children}
		</div>
	);
}

function MenuItem({
	icon,
	label,
	active,
	onClick,
}: {
	icon: string;
	label: string;
	active?: boolean;
	onClick: () => void;
}) {
	const [hov, setHov] = useState(false);
	return (
		<button
			type="button"
			// The items are a mutually-exclusive set (exactly one view is active), and `active` was
			// conveyed only by gold text + a decorative check glyph — invisible to AT and to anyone
			// who cannot separate gold from cream. menuitemradio + aria-checked states it.
			role="menuitemradio"
			aria-checked={!!active}
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				width: '100%',
				padding: '8px 9px',
				border: 'none',
				borderRadius: 7,
				cursor: 'pointer',
				textAlign: 'left',
				background: active ? T.accSub : hov ? T.hover : 'transparent',
				color: active ? T.acc : T.ink,
				font: `${active ? 600 : 500} 12.5px ${T.sans}`,
			}}
		>
			<Icon name={icon} size="sm" color={active ? T.acc : T.sub} />
			<span style={{ flex: 1 }}>{label}</span>
			{active && <Icon name="check" size="sm" color={T.acc} />}
		</button>
	);
}
