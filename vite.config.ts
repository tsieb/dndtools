import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: false,
			includeAssets: ['app-icon.svg', 'robots.txt', 'app-icon.ico'],
			manifest: {
				name: 'DND Tools',
				short_name: 'DND Tools',
				description:
					'Local-first tabletop campaign manager with offline vault, linking, and session tooling.',
				theme_color: '#1f2937',
				background_color: '#f5e9d6',
				display: 'standalone',
				start_url: '/',
				scope: '/',
				icons: [
					{
						src: '/pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png',
					},
					{
						src: '/pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
					},
					{
						src: '/pwa-maskable-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable',
					},
				],
				screenshots: [
					{
						src: '/screenshots/pwa-desktop.png',
						sizes: '1280x720',
						type: 'image/png',
						form_factor: 'wide',
						label: 'Campaign notes and session dashboard',
					},
					{
						src: '/screenshots/pwa-mobile.png',
						sizes: '720x1280',
						type: 'image/png',
						label: 'Mobile browser session workflow',
					},
				],
			},
			workbox: {
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				skipWaiting: true,
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
				runtimeCaching: [
					{
						urlPattern: ({ sameOrigin, request }) =>
							sameOrigin && ['script', 'style', 'worker'].includes(request.destination),
						handler: 'StaleWhileRevalidate',
						options: {
							cacheName: 'dndtools-app-shell',
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: ({ sameOrigin, request }) =>
							sameOrigin && ['image', 'font'].includes(request.destination),
						handler: 'CacheFirst',
						options: {
							cacheName: 'dndtools-static-assets',
							cacheableResponse: {
								statuses: [0, 200],
							},
							expiration: {
								maxEntries: 240,
								maxAgeSeconds: 60 * 60 * 24 * 60,
							},
						},
					},
				],
			},
		}),
	],
	test: {
		include: [
			'src/**/*.test.ts',
			'tests/unit/**/*.test.ts',
			'mcp/**/*.test.ts',
			'electron/**/*.test.ts',
		],
		environment: 'jsdom',
		globals: true,
		hookTimeout: 30_000,
		testTimeout: 30_000,
		setupFiles: ['./tests/setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			include: ['src/lib/**'],
			exclude: ['src/lib/types/**', '**/*.test.ts'],
			thresholds: {
				statements: 80,
				branches: 75,
				functions: 80,
				lines: 80,
			},
		},
	},
});
