import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Isolated React prototype app. It consumes @dndtools/core directly from its TypeScript
// source (the core package's "exports" points at ./src/index.ts), so Vite/esbuild transforms
// the framework-agnostic Processing Core with no separate build step — exactly how the
// production SvelteKit app consumes it.
//
// Two build targets, one codebase:
//   • `build`       (default mode) → dist/       — the standard app; first run shows onboarding.
//   • `build:demo`  (--mode demo)  → dist-demo/  — boots straight into the seeded sample campaign.
// The only difference is the `VITE_DEMO_MODE` flag defined below for the `demo` mode, which
// `src/main.tsx` reads to skip the first-run onboarding overlay. Defining it here (rather than in a
// gitignored `.env.demo`) keeps the demo build fully reproducible and committed.
export default defineConfig(({ mode }) => ({
	// Relative asset base so the built index.html references `./assets/…` instead of origin-absolute
	// `/assets/…`. Absolute paths 404 when the bundle is loaded from disk (`file://`) in the Electron
	// desktop shell; `./` resolves correctly both there and when served from a web origin root.
	base: './',
	plugins: [react()],
	define: {
		'import.meta.env.VITE_DEMO_MODE': JSON.stringify(mode === 'demo' ? '1' : ''),
	},
	server: { port: 5273, strictPort: false },
	preview: { port: 4273, strictPort: false },
}));
