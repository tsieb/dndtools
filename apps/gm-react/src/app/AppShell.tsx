import { useEffect, useState, type ReactNode } from 'react';
import { Toaster, ToastViewport } from '../ds';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { CommandPalette } from './CommandPalette';
import { useCompactTopBar, useViewport } from './useViewport';
import { T } from './screen-kit';
import { SceneDisplayOverlay, useSceneDisplayBroadcast } from './SceneDisplayOverlay';
import { getSceneDisplayForActor } from '@dndtools/core';
import { Sidebar } from './shell/Sidebar';
import { RailNav } from './shell/RailNav';
import { TopBar } from './shell/TopBar';
import { Footer } from './shell/Footer';

/**
 * AppShell — the React port of the online prototype's shell (app.jsx Sidebar + Topbar): a 264px
 * sidebar (brand · campaign chip · Run the table / Scenes / Library / Platform / Recent · player +
 * settings + DM account) beside a calm top bar (title, ⌘K search, view-as + projection).
 *
 * Everything is wired to the live Processing Core through `useRuntime()`: the Scenes list, library
 * counts, and the DM account come from the real actor-filtered read model, scene rows open the real
 * `/scene/:id` editor, and the topbar carries the working command palette, "view as" actor switch,
 * and projection control. A single ToastViewport is mounted here so any screen's `Toaster.*` call
 * surfaces a confirmation.
 */

/* ── Responsive breakpoints (UX nav-profiles): ≥1025px the full sidebar, 641–1024px the icon
 * NavRail (same IA, presentation change only), ≤640px a BottomTabBar of the hot destinations
 * plus a "More" sheet. The matchMedia hook lives in ./useViewport (shared with detail screens). */

export function AppShell({ children }: { children: ReactNode }) {
	const { t } = useI18n();
	const [paletteOpen, setPaletteOpen] = useState(false);
	// I11 S11.2.2 — the in-window fullscreen scene display (Ctrl+Shift+S toggles; Escape exits).
	const [displayOpen, setDisplayOpen] = useState(false);
	const viewport = useViewport();
	const compactToolbar = useCompactTopBar();
	const runtime = useRuntime();
	// I11 S11.2.2 — keep any open second-screen window live with the DM window's edits.
	useSceneDisplayBroadcast(runtime);
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
			// The palette is itself `aria-modal`, so the overlay guard below used to swallow the very
			// keystroke that should dismiss it — Cmd/Ctrl+K could open the palette but never close it.
			// Handle the closing direction first, before the guard sees the palette as "some overlay".
			if (cmdK && paletteOpen) {
				e.preventDefault();
				setPaletteOpen(false);
				return;
			}
			// A full-screen editor overlay (e.g. the map editor) owns the keyboard while open and provides
			// its own command palette / shortcuts; don't double-fire the global shortcuts beneath it.
			if (
				document.querySelector(
					'[data-fullscreen-overlay], [aria-modal="true"]:not([data-scene-display-overlay])',
				)
			)
				return;
			if (cmdK) {
				e.preventDefault();
				setPaletteOpen(true);
				return;
			}
			// Ctrl/Cmd+Right is the OS "move by word" binding and Ctrl+Shift+S is a common save-as, so
			// firing them while the DM is typing (a handout body, a note, a scene name) hijacks the
			// caret and silently advances the players' queue. ⌘K stays deliberately global.
			const el = e.target as HTMLElement | null;
			const typing =
				!!el &&
				(el.tagName === 'INPUT' ||
					el.tagName === 'TEXTAREA' ||
					el.tagName === 'SELECT' ||
					el.isContentEditable);
			// I11 S11.2.2 — Ctrl/Cmd+Shift+S enters/exits the fullscreen scene display.
			if (!typing && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
				e.preventDefault();
				setDisplayOpen((v) => !v);
				return;
			}
			// I11 S11.2.3 — Ctrl/Cmd+Right advances the scene queue during play (only when a card is queued).
			if (!typing && (e.metaKey || e.ctrlKey) && e.key === 'ArrowRight') {
				const display = getSceneDisplayForActor(
					runtime.state.session,
					runtime.state.permissions,
					runtime.defaultActorId,
				);
				if (display.queuedCount > 0) {
					e.preventDefault();
					// The visible effect of this shortcut happens on the PLAYER display — a second
					// screen the DM may not be looking at — so a bare `void dispatch` made "worked",
					// "refused" and "storage is full" completely indistinguishable. (`dispatchNow`
					// also rethrows a persist failure, which was landing as an unhandled rejection.)
					void (async () => {
						try {
							const result = await runtime.dispatch({
								type: 'scene-card.advance',
								actorId: runtime.defaultActorId,
								payload: {},
							});
							if (result.status === 'rejected') Toaster.error("That card couldn't be shown.");
							else Toaster.success('Showing the next card.');
						} catch {
							Toaster.error("That change couldn't be saved to this device.");
						}
					})();
				} else {
					// The shortcut is advertised in SceneCardsPanel's help line, and its whole effect
					// is on a second screen — so an empty queue used to make it indistinguishable from
					// a dead key. Say why rather than swallowing the press.
					e.preventDefault();
					Toaster.error('Queue a scene card first.');
				}
				return;
			}
			// Exit the fullscreen display on Escape. `preventDefault` has to happen HERE, while the
			// event is still being dispatched — calling it inside the setState updater ran it on the
			// next render, long after the browser had already taken its default action.
			if (e.key === 'Escape' && displayOpen) {
				e.preventDefault();
				setDisplayOpen(false);
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [runtime, displayOpen, paletteOpen]);
	return (
		<div
			className="app-shell"
			style={{
				display: 'flex',
				height: '100%',
				position: 'relative',
				overflow: 'hidden',
				background: T.bg,
				backgroundImage:
					'radial-gradient(1200px 620px at 50% -240px, var(--color-accent-subtle), transparent 70%)',
			}}
		>
			<a
				href="#main-content"
				// Declares "I am a skip link parked off-viewport until focused" to the responsive
				// clipped-control audit (tests/e2e/responsive.spec.ts), which would otherwise read the
				// resting position as clipping. /play carries the same marker on its own skip link.
				data-skip-link="true"
				// The app is a HashRouter, so the hash IS the route. Letting the browser follow this
				// href rewrites `#/session` to `#main-content`, desyncing the URL from the rendered
				// screen and sending a reload to the catch-all route. Move focus ourselves instead;
				// `<main>` already carries tabIndex={-1} to receive it.
				onClick={(e) => {
					e.preventDefault();
					document.getElementById('main-content')?.focus();
				}}
				style={{
					position: 'fixed',
					left: 8,
					top: 'calc(var(--native-titlebar-height) + var(--safe-area-top, 0px) - 48px)',
					zIndex: 100,
					padding: '8px 14px',
					borderRadius: 8,
					background: 'var(--color-accent)',
					color: 'var(--color-accent-foreground)',
					font: '600 13px var(--font-sans)',
					textDecoration: 'none',
					transition: 'top var(--duration-fast) var(--easing-standard)',
				}}
				onFocus={(e) =>
					(e.currentTarget.style.top =
						'calc(var(--native-titlebar-height) + var(--safe-area-top, 0px) + 8px)')
				}
				onBlur={(e) =>
					(e.currentTarget.style.top =
						'calc(var(--native-titlebar-height) + var(--safe-area-top, 0px) - 48px)')
				}
			>
				{t('shell.skipToContent')}
			</a>
			{viewport === 'desktop' && <Sidebar onOpenPalette={() => setPaletteOpen(true)} />}
			{viewport === 'rail' && <RailNav onOpenPalette={() => setPaletteOpen(true)} />}
			<div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
				<TopBar
					onOpenPalette={() => setPaletteOpen(true)}
					viewport={viewport}
					compactToolbar={compactToolbar}
				/>
				<main
					id="main-content"
					tabIndex={-1}
					style={{
						flex: 1,
						// A flex child defaults to `min-height: auto`, which can make its contents grow
						// behind the phone navigation rather than becoming the shell's scroll region.
						// This is the shell contract: one bounded, independently scrollable main pane.
						minHeight: 0,
						overflowY: 'auto',
						overflowX: 'hidden',
						overscrollBehavior: 'contain',
						WebkitOverflowScrolling: 'touch',
						// NO `outline: 'none'` here. An inline style beats the stylesheet, so it silently
						// killed the global `:focus-visible` ring — and this element is the skip link's
						// destination, so activating "Skip to content" confirmed nothing at all. The ring
						// is drawn INSIDE the pane (the global +2px offset would land outside a
						// viewport-filling box and never paint).
						outlineOffset: '-3px',
						boxSizing: 'border-box',
						paddingLeft: viewport === 'phone' ? 'var(--safe-area-left, 0px)' : 0,
						paddingRight: 'var(--safe-area-right, 0px)',
					}}
				>
					{children}
				</main>
				{viewport === 'phone' && <Footer />}
			</div>
			<CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
			<SceneDisplayOverlay open={displayOpen} onClose={() => setDisplayOpen(false)} />
			{/* On phone the tab bar owns the bottom edge (52px buttons + --space-1 padding + 1px
			    border) PLUS the bottom safe area, which the bar also pads for — omitting it here put
			    toasts on top of the primary nav on any device with a home indicator. */}
			<ToastViewport
				placement="bottom-right"
				data-testid="app-toast-viewport"
				style={
					viewport === 'phone'
						? {
								bottom: 'calc(52px + 2 * var(--space-1) + 1px + var(--safe-area-bottom, 0px))',
							}
						: undefined
				}
			/>
		</div>
	);
}
