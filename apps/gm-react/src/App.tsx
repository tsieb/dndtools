import { Component, Suspense, lazy, useEffect, type CSSProperties, type ReactNode } from 'react';
// HashRouter (not BrowserRouter): the built app is loaded from disk in the Electron desktop shell
// (`file://` via loadFile), where the History API's path-based URLs 404 on reload/deep-link. Hash
// routing resolves entirely client-side, so it works identically under `file://` and a web origin —
// the only web-visible difference is a cosmetic `#` in the URL.
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RuntimeProvider, useRuntime } from './runtime/RuntimeContext';
import { AuthProvider } from './cloud/AuthContext';
import { EntitlementsProvider } from './cloud/entitlements';
import { CloudSyncProvider } from './cloud/CloudSyncContext';
import { SessionProvider } from './net/SessionContext';
import { ensureAudioPlayback } from './runtime/audio-playback';
import { AppShell } from './app/AppShell';
import { Onboarding } from './app/Onboarding';
import { CommandCenter } from './screens/CommandCenter';

// Route-level code-splitting: every section except the landing Command Center is a lazy chunk, so
// the boot bundle carries only the shell + hub and each surface loads on first visit (all behind
// the one <Suspense> below — same Boot fallback everywhere). `/play` (PlayerView) brings its OWN
// chrome, so it mounts OUTSIDE <AppShell>; `/player` is the in-shell player section.
const ScenesCreator = lazy(() => import('./screens/ScenesCreator').then((m) => ({ default: m.ScenesCreator })));
const SceneEditor = lazy(() => import('./screens/SceneEditor').then((m) => ({ default: m.SceneEditor })));
const Board = lazy(() => import('./screens/Board').then((m) => ({ default: m.Board })));
const Session = lazy(() => import('./screens/Session').then((m) => ({ default: m.Session })));
const Characters = lazy(() => import('./screens/Characters').then((m) => ({ default: m.Characters })));
const Atlas = lazy(() => import('./screens/Atlas').then((m) => ({ default: m.Atlas })));
const Campaign = lazy(() => import('./screens/Campaign').then((m) => ({ default: m.Campaign })));
const Knowledge = lazy(() => import('./screens/Knowledge').then((m) => ({ default: m.Knowledge })));
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })));
const Graph = lazy(() => import('./screens/Graph').then((m) => ({ default: m.Graph })));
const Audio = lazy(() => import('./screens/Audio').then((m) => ({ default: m.Audio })));
const Extensions = lazy(() => import('./screens/Extensions').then((m) => ({ default: m.Extensions })));
const Community = lazy(() => import('./screens/Community').then((m) => ({ default: m.Community })));
const Player = lazy(() => import('./screens/Player').then((m) => ({ default: m.Player })));
const Upgrade = lazy(() => import('./screens/Upgrade').then((m) => ({ default: m.Upgrade })));
const PlayerView = lazy(() => import('./screens/PlayerView').then((m) => ({ default: m.PlayerView })));
const Join = lazy(() => import('./screens/Join').then((m) => ({ default: m.Join })));
const WikiReader = lazy(() => import('./screens/WikiReader').then((m) => ({ default: m.WikiReader })));
// I11 S11.2.2 — the chrome-less scene DISPLAY surface for the second screen / projector window
// (opened via `window.open('#/display')`). Like `/play` it mounts OUTSIDE the DM AppShell.
const SceneDisplay = lazy(() => import('./screens/SceneDisplay').then((m) => ({ default: m.SceneDisplay })));

const CENTERED: CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	justifyContent: 'center',
	gap: 16,
	height: '100vh',
	padding: 24,
	textAlign: 'center',
	background: 'var(--color-bg)',
	color: 'var(--color-text-secondary)',
	fontFamily: 'var(--font-sans)',
	fontSize: 'var(--text-sm)',
};

/** A calm, chrome-less boot/suspense state shown until the first core load resolves (and while a
 * lazy surface is fetched) so nothing renders against an empty, un-seeded slice. */
function Boot() {
	return (
		<div style={{ ...CENTERED, color: 'var(--color-text-tertiary)' }} role="status" aria-live="polite">
			Loading your vault…
		</div>
	);
}

/** A recoverable failure surface with a retry/reload action, used for both a thrown initial load
 * (Dexie unavailable / corrupt slice) and an uncaught render error (the ErrorBoundary fallback). */
function FailScreen({ title, detail, actionLabel, onAction }: { title: string; detail?: string | null; actionLabel: string; onAction: () => void }) {
	return (
		<div style={CENTERED} role="alert">
			<div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</div>
			{detail ? <div style={{ maxWidth: 420, color: 'var(--color-text-tertiary)' }}>{detail}</div> : null}
			<button
				type="button"
				onClick={onAction}
				style={{
					marginTop: 4,
					padding: '8px 18px',
					borderRadius: 'var(--radius-md, 6px)',
					border: '1px solid var(--color-border)',
					background: 'var(--color-accent)',
					color: 'var(--color-accent-contrast, #1a140c)',
					font: '600 13px var(--font-sans)',
					cursor: 'pointer',
				}}
			>
				{actionLabel}
			</button>
		</div>
	);
}

/** Catches a rejected lazy `import()` or any render-time throw so a single screen error (or a stale
 * chunk after a deploy) shows a recoverable reload prompt instead of unwinding the tree to a blank
 * page. `<Suspense>` alone does NOT catch these. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
	state: { error: Error | null } = { error: null };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	render() {
		if (this.state.error) {
			return (
				<FailScreen
					title="Something went wrong"
					detail={this.state.error.message}
					actionLabel="Reload"
					onAction={() => window.location.reload()}
				/>
			);
		}
		return this.props.children;
	}
}

/** Every routed section that lives inside the DM shell (sidebar + topbar). The first-run
 * onboarding overlay mounts here (not around `/play`) so a joining player never sees DM setup;
 * it self-gates on its localStorage flag and renders null once completed or skipped. */
function ShelledRoutes() {
	return (
		<AppShell>
			<Onboarding />
			<Suspense fallback={<Boot />}>
				<Routes>
					<Route path="/" element={<CommandCenter />} />
					<Route path="/scenes" element={<ScenesCreator />} />
					<Route path="/scene/:id" element={<SceneEditor />} />
					<Route path="/session" element={<Session />} />
					<Route path="/board" element={<Board />} />
					{/* `:id?` — the roster and the sheet share one screen; a present id deep-links the
					    sheet so cross-links (Story cards, palette hits, note mentions) can target an
					    entity instead of dumping the user on the list. */}
					<Route path="/characters/:id?" element={<Characters />} />
					<Route path="/atlas" element={<Atlas />} />
					<Route path="/campaign" element={<Campaign />} />
					<Route path="/knowledge/:id?" element={<Knowledge />} />
					<Route path="/graph" element={<Graph />} />
					<Route path="/audio" element={<Audio />} />
					<Route path="/extensions" element={<Extensions />} />
					<Route path="/community" element={<Community />} />
					<Route path="/upgrade" element={<Upgrade />} />
					<Route path="/player" element={<Player />} />
					<Route path="/settings" element={<Settings />} />
					<Route path="*" element={<Navigate to="/" replace />} />
				</Routes>
			</Suspense>
		</AppShell>
	);
}

function Shell() {
	const runtime = useRuntime();
	// The app-lifetime audio driver (idempotent per runtime): session `audioPlayback` state makes
	// sound no matter which screen is mounted — Session's now-playing and the Audio screen both
	// write the same core state this driver reconciles against a single <audio> element.
	useEffect(() => {
		if (runtime.loaded) ensureAudioPlayback(runtime);
	}, [runtime, runtime.loaded]);
	if (runtime.hasLoadError) {
		return (
			<FailScreen
				title="Couldn’t open your vault"
				detail={runtime.lastError ?? 'Local storage may be unavailable in this browser.'}
				actionLabel="Try again"
				onAction={() => void runtime.load()}
			/>
		);
	}
	if (!runtime.loaded) return <Boot />;
	// `/play` is the standalone player-view app: it renders its own chrome, so it sits OUTSIDE the
	// DM AppShell. Everything else mounts inside the shell via the splat route below.
	return (
		<Routes>
			<Route
				path="/play"
				element={
					<Suspense fallback={<Boot />}>
						<PlayerView />
					</Suspense>
				}
			/>
			{/* invite-redeem landing: chrome-less like /play — an invitee has no vault and must
			    never be dropped into DM onboarding. */}
			<Route
				path="/join"
				element={
					<Suspense fallback={<Boot />}>
						<Join />
					</Suspense>
				}
			/>
			{/* public campaign-wiki reader: chrome-less like /join — a reader has no vault and reads a
			    published wiki by its high-entropy id (`#/wiki?id=…`) with no account. */}
			<Route
				path="/wiki"
				element={
					<Suspense fallback={<Boot />}>
						<WikiReader />
					</Suspense>
				}
			/>
			{/* I11 S11.2.2 — the second-screen scene display: chrome-less like /play, driven live by
			    the primary window over a BroadcastChannel. */}
			<Route
				path="/display"
				element={
					<Suspense fallback={<Boot />}>
						<SceneDisplay />
					</Suspense>
				}
			/>
			<Route path="/*" element={<ShelledRoutes />} />
		</Routes>
	);
}

/**
 * App — the application root. The Processing Core is loaded once by the RuntimeProvider; until
 * the first load resolves the shell shows a calm boot state so no screen renders against an empty,
 * un-seeded slice. After load most routes render inside the shared AppShell; `/play` is the lone
 * chrome-less route (the standalone player-view app brings its own sidebar/topbar).
 *
 * Routes mirror the design package IA: `/` is the Command Center launcher hub, `/board` the spatial
 * widget board, `/scene/:id` the scene canvas editor, `/upgrade` the Plans & cloud (pricing) surface,
 * `/play` the player companion app, and the remaining sections each port their design-package screen.
 */
export function App() {
	return (
		<RuntimeProvider>
			<AuthProvider>
				<EntitlementsProvider>
					<CloudSyncProvider>
						<SessionProvider>
							<HashRouter>
								<ErrorBoundary>
									<Shell />
								</ErrorBoundary>
							</HashRouter>
						</SessionProvider>
					</CloudSyncProvider>
				</EntitlementsProvider>
			</AuthProvider>
		</RuntimeProvider>
	);
}
