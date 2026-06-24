import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Isolated React prototype app. It consumes @dndtools/core directly from its TypeScript
// source (the core package's "exports" points at ./src/index.ts), so Vite/esbuild transforms
// the framework-agnostic Processing Core with no separate build step — exactly how the
// production SvelteKit app consumes it.
export default defineConfig({
	plugins: [react()],
	server: { port: 5273, strictPort: false },
	preview: { port: 4273, strictPort: false },
});
