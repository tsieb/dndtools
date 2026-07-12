// The catalog of every check the harness can run, across all layers and
// environments. Each entry maps to an existing npm script or a programmatic
// probe. Stages order execution (0 = fast fail-early wave); groups serialize
// checks that share a dev server; requires[] gates on detected capabilities.
//
// Design notes:
//  - The React browser checks (Playwright e2e / axe + verify-*) need the DEV `window.__rt`
//    seam, so they run against the managed `react-dev` server and share the `react` group to
//    avoid IndexedDB races between gates hitting the same origin. Playwright's own webServer
//    reuses that existing server when not in CI.

import type { Check } from './types.ts';
import { runFeatureAudit } from './feature-audit.ts';
import { CLOUD_CHECKS } from './cloud-live.ts';

export const CHECKS: Check[] = [
	// ---- Stage 0: static analysis (no servers, no build) --------------------
	{
		id: 'format',
		title: 'Prettier format check',
		layer: 'static',
		stage: 0,
		optional: true,
		description: 'Repo-wide formatting is consistent (non-blocking).',
		command: 'pnpm format:check',
	},
	{
		id: 'eslint',
		title: 'ESLint',
		layer: 'static',
		stage: 0,
		description: 'Lint the React app + core + cloud-fns + tooling (typescript-eslint + react-hooks).',
		command: 'pnpm exec eslint .',
	},
	{
		id: 'lint:boundary',
		title: 'Architecture boundary lint',
		layer: 'static',
		stage: 0,
		description: 'GUI/route code may not import platform primitives; core stays framework-free.',
		command: 'pnpm lint:boundary',
	},
	{
		id: 'gates',
		title: 'Quality-gate meta-gate',
		layer: 'static',
		stage: 0,
		description: 'Gate registry, support-status, and CON-001..006 architecture constraints.',
		command: 'pnpm gates',
	},
	{
		id: 'audit:repo',
		title: 'CI guardrail audit',
		layer: 'static',
		stage: 0,
		description: 'Gate enforcement cannot be silently removed from package.json / CI.',
		command: 'pnpm audit:repo',
	},
	{
		id: 'tokens:contrast',
		title: 'Text contrast (WCAG 2.2)',
		layer: 'static',
		stage: 0,
		description: 'Every fg/bg token pair meets its contrast ratio in all themes.',
		command: 'pnpm tokens:contrast',
	},
	{
		id: 'a11y:contrast',
		title: 'Non-text contrast (WCAG 1.4.11)',
		layer: 'static',
		stage: 0,
		description: 'Focus/selection/status graphics reach 3:1 incl. forced-colors fallback.',
		command: 'pnpm a11y:contrast',
	},
	{
		id: 'typecheck:core',
		title: 'Typecheck @dndtools/core',
		layer: 'static',
		stage: 0,
		description: 'Core package type-safety.',
		command: 'pnpm --filter @dndtools/core typecheck',
	},
	{
		id: 'typecheck:react',
		title: 'Typecheck @dndtools/gm-react',
		layer: 'static',
		stage: 0,
		description: 'React app type-safety (tsc --noEmit); part of the default `typecheck`.',
		command: 'pnpm --filter @dndtools/gm-react typecheck',
	},
	{
		id: 'typecheck:cloud-fns',
		title: 'Typecheck @dndtools/cloud-fns',
		layer: 'static',
		stage: 0,
		description: 'Lambda handler type-safety.',
		command: 'pnpm --filter @dndtools/cloud-fns typecheck',
	},

	// ---- Stage 0: unit / integration suites (no servers) --------------------
	{
		id: 'test:core',
		title: 'Core unit suite',
		layer: 'unit',
		stage: 0,
		description: 'Processing core, E2EE crypto, sync/permission policy (vitest).',
		command: 'pnpm --filter @dndtools/core test',
	},
	{
		id: 'test:tooling',
		title: 'Repo tooling suite',
		layer: 'unit',
		stage: 0,
		description: 'Control-plane guardrails + a11y policy (root vitest).',
		command: 'pnpm test:tooling',
	},
	{
		id: 'test:cloud',
		title: 'Cloud + transport unit suite',
		layer: 'unit',
		stage: 0,
		description: 'Lambda handlers + client net/cloud modules (part of the default `test`).',
		command: 'pnpm test:cloud',
	},
	{
		id: 'test:app',
		title: 'React app unit suite',
		layer: 'unit',
		stage: 0,
		description: 'gm-react component/logic/AI/view-model vitest suite (vitest.app.config.ts).',
		command: 'pnpm test:app',
	},
	{
		id: 'verify:p2p',
		title: 'P2P crypto gate (offline)',
		layer: 'unit',
		stage: 0,
		description: 'AES-GCM seal/open + connection-code round-trip under Node WebCrypto.',
		command: 'pnpm --filter @dndtools/gm-react verify:p2p',
	},

	// ---- Stage 0: static feature/requirement drift audit --------------------
	{
		id: 'feature-audit',
		title: 'Feature-gap drift audit',
		layer: 'audit',
		stage: 0,
		optional: true,
		description: 'Reconcile FEATURE-GAPS.md claims against live code; surface stubs/drift.',
		run: (ctx) => runFeatureAudit({ repoRoot: ctx.repoRoot, writeTo: ctx.logDir }),
	},

	// ---- Stage 1: production build (gate desktop; standalone build health) ---
	{
		id: 'build',
		title: 'Build core + React app',
		layer: 'build',
		stage: 1,
		description: 'Production build of @dndtools/core and @dndtools/gm-react succeeds.',
		command: 'pnpm build',
	},

	// ---- Stage 2: browser-driven checks -------------------------------------
	// react group: managed `react-dev` server (DEV `window.__rt` seam), sequential to avoid
	// IndexedDB races. Playwright's own webServer reuses this existing server when not in CI.
	{
		id: 'e2e',
		title: 'React E2E (desktop + mobile)',
		layer: 'browser',
		stage: 2,
		group: 'react',
		servers: ['react-dev'],
		timeoutMs: 25 * 60_000,
		description: 'Playwright critical-path specs (collab, sync, canvas, permissions) on both profiles.',
		// Match the CI gate's tolerance: playwright.config uses retries:2 under CI but 0 locally,
		// so a run here would be STRICTER than CI and red on a known-flaky timing race. Force
		// retries:2 (keeping parallel workers) so a genuine failure still fails, but flake self-heals.
		command: 'pnpm --filter @dndtools/gm-react exec playwright test --retries=2',
	},
	{
		id: 'a11y:axe',
		title: 'Axe accessibility scan',
		layer: 'browser',
		stage: 2,
		group: 'react',
		servers: ['react-dev'],
		description: 'Axe-core scan on both device profiles (writes per-worker artifacts).',
		command: 'pnpm a11y:axe',
	},
	{
		id: 'a11y:report',
		title: 'Axe gate report',
		layer: 'browser',
		stage: 2,
		group: 'react',
		description: 'Merge axe artifacts + apply the release policy (fails on regressions).',
		command: 'pnpm a11y:report',
	},
	{
		id: 'verify:routes',
		title: 'React route-mount smoke',
		layer: 'browser',
		stage: 2,
		group: 'react',
		servers: ['react-dev'],
		description: 'Every React route mounts clean (no page/console error, real DOM).',
		command: 'pnpm verify:routes',
	},
	{
		id: 'verify:roundtrip',
		title: 'React persistence round-trip',
		layer: 'browser',
		stage: 2,
		group: 'react',
		servers: ['react-dev'],
		description: 'load → dispatch → persist → reload against real IndexedDB; preview read-only.',
		command: 'pnpm verify:roundtrip',
	},
	{
		id: 'verify:canvas',
		title: 'React canvas wiring',
		layer: 'browser',
		stage: 2,
		group: 'react',
		servers: ['react-dev'],
		description: '/board + /scene wired to the Processing core; content mutation round-trip.',
		command: 'pnpm verify:canvas',
	},
	{
		id: 'verify:ui',
		title: 'React UI-driven dispatch',
		layer: 'browser',
		stage: 2,
		group: 'react',
		servers: ['react-dev'],
		description: 'Click a real button per screen; assert the core op-log actually grew.',
		command: 'pnpm verify:ui',
	},
	{
		id: 'verify:p2p-live',
		title: 'P2P live WebRTC handshake',
		layer: 'browser',
		stage: 2,
		group: 'react',
		servers: ['react-dev'],
		timeoutMs: 8 * 60_000,
		description: 'Two browser contexts form a WebRTC data channel; host replicates snapshot.',
		command: 'pnpm --filter @dndtools/gm-react verify:p2p-live',
	},

	// ---- Stage 3: packaged desktop (opt-in; needs a display) ----------------
	{
		id: 'desktop:smoke',
		title: 'Electron desktop smoke',
		layer: 'desktop',
		stage: 3,
		offByDefault: true,
		requires: ['electron', 'display'],
		timeoutMs: 15 * 60_000,
		description: 'Packaged app boots from file://, honors CSP, persists IndexedDB across restart.',
		command: 'pnpm desktop:smoke',
	},

	// ---- Stage 4: live AWS cloud validation (opt-in via --live) -------------
	...CLOUD_CHECKS,
];
