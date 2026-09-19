#!/usr/bin/env node
// RC-DSN-4.1 — size budget for the committed visual baselines. The repo does not use Git LFS, so
// every baseline lives in ordinary history and every re-baseline adds its full size again. This
// caps both one image (a full-page capture or a device-scale-factor slip shows up here first) and
// the whole set (a new route or theme multiplies it), and it fails closed on an empty set.
//
//   node apps/gm-react/tests/visual/check-baseline-budget.mjs
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('./__screenshots__/', import.meta.url));
// Three themes × three tiers × ~15 surfaces is ~135 PNGs; the total leaves room for five themes.
const MAX_FILE_BYTES = 320 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

let files;
try {
	files = walk(ROOT);
} catch {
	files = [];
}
const failures = [];
let total = 0;
for (const file of files) {
	const name = relative(ROOT, file);
	if (!name.endsWith('.png')) failures.push(`${name}: only PNG baselines belong here`);
	const size = statSync(file).size;
	total += size;
	if (size > MAX_FILE_BYTES) failures.push(`${name}: ${kib(size)} > ${kib(MAX_FILE_BYTES)}`);
}
if (files.length === 0) failures.push(`no baselines under ${ROOT}`);
if (total > MAX_TOTAL_BYTES) failures.push(`total ${kib(total)} > ${kib(MAX_TOTAL_BYTES)}`);

console.log(`visual baselines: ${files.length} files, ${kib(total)} of ${kib(MAX_TOTAL_BYTES)}`);
if (failures.length > 0) {
	console.error(failures.map((failure) => `  - ${failure}`).join('\n'));
	process.exit(1);
}
