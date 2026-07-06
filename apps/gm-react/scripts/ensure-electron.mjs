// Ensure Electron's prebuilt binary is present before `desktop:dev` runs `electron .`.
//
// pnpm gates dependency build scripts, and on some machines it skips Electron's postinstall (the step
// that downloads the ~200 MB platform binary). This resolves the installed electron package and runs
// its install.js when the binary is missing — a no-op when it's already there. Version-agnostic (no
// hard-coded path into the .pnpm store).
//
// NOTE: the *packaging* path (electron-builder) does NOT need this — electron-builder downloads its own
// Electron distributable via @electron/get. This is only for running the app in dev.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronDir = path.dirname(require.resolve('electron/package.json'));
const pathFile = path.join(electronDir, 'path.txt');
const installJs = path.join(electronDir, 'install.js');

if (existsSync(pathFile)) {
	process.exit(0); // binary already fetched
}

console.log('[ensure-electron] Electron binary missing — downloading (one-time, ~200 MB)…');
execFileSync(process.execPath, [installJs], { stdio: 'inherit', cwd: electronDir });
console.log('[ensure-electron] done.');
