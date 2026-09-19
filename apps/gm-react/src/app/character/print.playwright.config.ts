import { fileURLToPath } from 'node:url';
import base from '../../../playwright.config';
import { defineConfig } from '@playwright/test';
const server = base.webServer;
if (!server || Array.isArray(server)) throw new Error('Expected one app dev server');
export default defineConfig({
	...base,
	webServer: { ...server, cwd: fileURLToPath(new URL('../../../', import.meta.url)) },
	testDir: '.',
	testMatch: 'print.spec.ts',
	projects: [{ name: 'desktop-chromium', use: { browserName: 'chromium' } }],
});
