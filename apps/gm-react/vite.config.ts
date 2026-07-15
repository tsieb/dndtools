import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function originOf(value: string, protocol: 'https:' | 'wss:'): string | null {
	try {
		const url = new URL(value);
		return url.protocol === protocol ? url.origin : null;
	} catch {
		return null;
	}
}

/** Emit the exact public origins compiled into this build for Electron's main-process allowlist. */
function electronNetworkPolicy(env: Record<string, string>): Plugin {
	const cloudOrigins = new Set<string>();
	for (const [key, protocol] of [
		['VITE_SIGNALING_WS_URL', 'wss:'],
		['VITE_SYNC_API_URL', 'https:'],
		['VITE_APP_API_URL', 'https:'],
	] as const) {
		const origin = originOf(env[key] ?? '', protocol);
		if (origin) cloudOrigins.add(origin);
	}
	const region = env.VITE_CLOUD_REGION?.trim();
	if (region && /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) {
		cloudOrigins.add(`https://cognito-idp.${region}.amazonaws.com`);
	}
	const aiOrigins = new Set<string>();
	for (const value of (env.VITE_AI_ALLOWED_ORIGINS ?? '').split(/\s+/)) {
		const origin = originOf(value, 'https:');
		if (origin) aiOrigins.add(origin);
	}
	return {
		name: 'electron-network-policy',
		apply: 'build',
		generateBundle() {
			this.emitFile({
				type: 'asset',
				fileName: 'electron-network-policy.json',
				source: `${JSON.stringify(
					{
						version: 1,
						cloudOrigins: [...cloudOrigins].sort(),
						aiOrigins: [...aiOrigins].sort(),
					},
					null,
					2,
				)}\n`,
			});
		},
	};
}

/** Stable cache boundaries for startup dependencies shared by every lazy route. */
function appManualChunk(id: string): string | undefined {
	const normalized = id.replaceAll('\\', '/');
	if (normalized.includes('/packages/core/src/')) return 'processing-core';
	if (!normalized.includes('/node_modules/')) return undefined;
	if (
		[
			'/node_modules/react/',
			'/node_modules/react-dom/',
			'/node_modules/react-router/',
			'/node_modules/react-router-dom/',
			'/node_modules/@remix-run/router/',
			'/node_modules/scheduler/',
		].some((part) => normalized.includes(part))
	) {
		return 'vendor-react';
	}
	if (normalized.includes('/node_modules/dexie/')) return 'vendor-storage';
	if (normalized.includes('/node_modules/zod/')) return 'vendor-validation';
	if (
		[
			'/node_modules/amazon-cognito-identity-js/',
			'/node_modules/buffer/',
			'/node_modules/js-cookie/',
			'/node_modules/unfetch/',
		].some((part) => normalized.includes(part))
	) {
		return 'vendor-auth';
	}
	return undefined;
}

// The React GM app. It consumes @dndtools/core directly from its TypeScript source (the core
// package's "exports" points at ./src/index.ts), so Vite/esbuild transforms the framework-agnostic
// Processing Core with no separate build step.
//
// Two build targets, one codebase:
//   • `build`       (default mode) → dist/       — the standard app; first run shows onboarding.
//   • `build:demo`  (--mode demo)  → dist-demo/  — boots straight into the seeded sample campaign.
// The only difference is the `VITE_DEMO_MODE` flag defined below for the `demo` mode, which
// `src/main.tsx` reads to skip the first-run onboarding overlay. Defining it here (rather than in a
// gitignored `.env.demo`) keeps the demo build fully reproducible and committed.
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	return {
		// Relative asset base so the built index.html references `./assets/…` instead of origin-absolute
		// `/assets/…`. This resolves correctly from the Electron app document and a hosted web origin.
		base: './',
		plugins: [react(), electronNetworkPolicy(env)],
		define: {
			'import.meta.env.VITE_DEMO_MODE': JSON.stringify(mode === 'demo' ? '1' : ''),
			// `amazon-cognito-identity-js` pulls in `buffer@4.x`, whose module init reads a bare
			// `global` — undefined in the browser, so the whole app (AuthProvider wraps the root)
			// throws `global is not defined` and never mounts. Map it to `globalThis` at build time
			// (compile-time, so it also works under the strict prod/Electron CSP — no inline shim).
			global: 'globalThis',
		},
		build: {
			// The offline processing core and on-demand monster catalog are intentionally dense but
			// compress well. Keep warning headroom tight enough to catch a new monolithic route.
			chunkSizeWarningLimit: 650,
			rollupOptions: { output: { manualChunks: appManualChunk } },
		},
		server: { port: 5273, strictPort: false },
		preview: { port: 4273, strictPort: false },
	};
});
