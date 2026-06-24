import { Component, Suspense, lazy, type CSSProperties, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RuntimeProvider, useRuntime } from './runtime/RuntimeContext';
import { AppShell } from './app/AppShell';
import { CommandCenter } from './screens/CommandCenter';
import { ScenesCreator } from './screens/ScenesCreator';
import { SceneEditor } from './screens/SceneEditor';
import { Board } from './screens/Board';
import { Session } from './screens/Session';
import { Characters } from './screens/Characters';
import { Atlas } from './screens/Atlas';
import { Campaign } from './screens/Campaign';
import { Knowledge } from './screens/Knowledge';
import { Settings } from './screens/Settings';
import { Graph } from './screens/Graph';
import { Audio } from './screens/Audio';
import { Extensions } from './screens/Extensions';
import { Community } from './screens/Community';
import { Player } from './screens/Player';

// New design-package surfaces, lazily mounted at the paths their screen agents will fill in:
//   /upgrade → src/screens/Upgrade.tsx     (named export `Upgrade`) — the prototype `pricing`
//              section ("Plans & cloud"); renders INSIDE the DM shell like any other section.
//   /play    → src/screens/PlayerView.tsx  (named export `PlayerView`) — the standalone,
//              permission-tiered player companion app (player-view-app.jsx). It brings its OWN
//              sidebar/topbar, so it is mounted CHROME-LESS, outside <AppShell> (see Shell below).
// These are distinct from the existing `/player` → Player.tsx (the in-shell "Mara Quill" section).
const Upgrade = lazy(() => import('./screens/Upgrade').then((m) => ({ default: m.Upgrade })));
const PlayerView = lazy(() => import('./screens/PlayerView').then((m) => ({ default: m.PlayerView })));

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

/** Every routed section that lives inside the DM shell (sidebar + topbar). */
function ShelledRoutes() {
	return (
		<AppShell>
			<Suspense fallback={<Boot />}>
				<Routes>
					<Route path="/" element={<CommandCenter />} />
					<Route path="/scenes" element={<ScenesCreator />} />
					<Route path="/scene/:id" element={<SceneEditor />} />
					<Route path="/session" element={<Session />} />
					<Route path="/board" element={<Board />} />
					<Route path="/characters" element={<Characters />} />
					<Route path="/atlas" element={<Atlas />} />
					<Route path="/campaign" element={<Campaign />} />
					<Route path="/knowledge" element={<Knowledge />} />
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
			<Route path="/*" element={<ShelledRoutes />} />
		</Routes>
	);
}

/**
 * App — the React prototype root. The Processing Core is loaded once by the RuntimeProvider; until
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
			<BrowserRouter>
				<ErrorBoundary>
					<Shell />
				</ErrorBoundary>
			</BrowserRouter>
		</RuntimeProvider>
	);
}
