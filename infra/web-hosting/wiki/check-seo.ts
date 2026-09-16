/** Reproducible Lighthouse check against the production renderer, with no cloud credentials. */
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	wikiDocument,
	type WikiDocument,
} from '../../../packages/cloud-fns/src/app-api/wiki-documents';

const require = createRequire(new URL('../../../apps/gm-react/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const wiki: WikiDocument = {
	wikiId: 'campaign1234',
	title: 'The Copper Coast',
	access: 'public',
	updatedAt: '2026-09-01',
	pages: [
		{
			slug: 'harbour',
			title: 'Harbour Ward',
			markdown:
				'Ships at anchor on the Copper Coast. Merchants gather on the docks to trade stories and supplies.',
			folder: 'Places',
		},
		{
			slug: 'recap',
			title: 'First voyage',
			markdown: 'The party discovered a sunken crypt beneath the harbour.',
			kind: 'recap',
			folder: 'Session recaps',
		},
	],
};
let origin = '';
const server = createServer((req, res) => {
	const url = new URL(req.url ?? '/', origin);
	if (url.pathname === '/robots.txt') {
		res.writeHead(200, { 'content-type': 'text/plain' });
		res.end('User-agent: *\nAllow: /\n');
		return;
	}
	if (!url.pathname.startsWith(`/wikis/${wiki.wikiId}/`)) {
		res.writeHead(404);
		res.end('Not found');
		return;
	}
	const response = wikiDocument(
		wiki,
		origin,
		url.pathname.split('/').at(-1)!,
		Object.fromEntries(url.searchParams),
		// This harness stands in for the shared distribution, where the documents and the SPA share
		// one origin. A custom domain passes the separate WEB_ORIGIN instead.
		origin,
	);
	res.writeHead(response.statusCode, response.headers);
	res.end(response.body);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing local port');
origin = `http://127.0.0.1:${address.port}`;
const output = join(await mkdtemp(join(tmpdir(), 'wiki-seo-')), 'lighthouse.json');
try {
	await promisify(execFile)(
		'pnpm',
		[
			'dlx',
			'lighthouse@12.8.2',
			`${origin}/wikis/${wiki.wikiId}/reader`,
			'--only-categories=seo',
			'--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
			'--output=json',
			`--output-path=${output}`,
			'--quiet',
		],
		{
			env: { ...process.env, CHROME_PATH: chromium.executablePath() },
			timeout: 110_000,
			maxBuffer: 2_000_000,
		},
	);
	const report = JSON.parse(await readFile(output, 'utf8'));
	const score = report.categories.seo.score * 100;
	const summary = {
		lighthouseVersion: report.lighthouseVersion,
		score,
		threshold: 90,
		fixture: 'Public campaign with folder note and session recap',
		audits: Object.fromEntries(
			report.categories.seo.auditRefs.map(({ id }: { id: string }) => [
				id,
				{ score: report.audits[id].score, displayMode: report.audits[id].scoreDisplayMode },
			]),
		),
	};
	// Tabs, to match the repo's Prettier config: a space-indented artifact makes every re-run dirty
	// the tree and trip the formatting gate, so the committed score could never be reproduced as-is.
	await writeFile(
		new URL('./seo-result.json', import.meta.url),
		`${JSON.stringify(summary, null, '\t')}\n`,
	);
	console.log(JSON.stringify({ ...summary, fullReport: output }));
	if (score < 90) throw new Error(`Reader SEO ${score} is below 90`);
} finally {
	server.close();
	server.closeAllConnections();
}
