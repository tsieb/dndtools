// Local, read-only project status dashboard. `pnpm dashboard` → http://127.0.0.1:4990
// Serves one page plus /api/status, which fans out to the collectors (AWS CloudFormation,
// GCP, GitHub Actions/releases/PRs, git, HTTPS probes) with a 30s cache so hammering
// refresh can't hammer the cloud APIs. Safety posture: binds loopback only, GET only,
// fixed command set (execFile in collectors.mjs), no mutation endpoints, CSP-locked page.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectAll } from './collectors.mjs';
import { pageHtml } from './page.mjs';

const PORT = Number(process.env.DASHBOARD_PORT || 4990);
const CACHE_TTL_MS = 30_000;
const here = path.dirname(fileURLToPath(import.meta.url));

let cache = null; // { at, payload }
let inflight = null;

async function status(force) {
	if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS)
		return { ...cache.payload, cached: true };
	inflight ??= collectAll().finally(() => {
		inflight = null;
	});
	const payload = await inflight;
	cache = { at: Date.now(), payload };
	return payload;
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, 'http://localhost');
	if (req.method !== 'GET') {
		res.writeHead(405).end();
		return;
	}
	try {
		if (url.pathname === '/') {
			res.writeHead(200, {
				'content-type': 'text/html; charset=utf-8',
				'content-security-policy':
					"default-src 'none'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'",
				'x-content-type-options': 'nosniff',
				'cache-control': 'no-store',
			});
			res.end(pageHtml());
		} else if (url.pathname === '/lib.mjs') {
			res.writeHead(200, {
				'content-type': 'text/javascript; charset=utf-8',
				'cache-control': 'no-store',
			});
			res.end(await readFile(path.join(here, 'lib.mjs'), 'utf8'));
		} else if (url.pathname === '/api/status') {
			const payload = await status(url.searchParams.get('refresh') === '1');
			res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
			res.end(JSON.stringify(payload));
		} else {
			res.writeHead(404).end();
		}
	} catch (err) {
		res.writeHead(500, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ error: String(err.message || err) }));
	}
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`dndtools status dashboard → http://127.0.0.1:${PORT}`);
	console.log('Read-only: CloudFormation describe, gcloud list, gh reads, git log, HTTPS probes.');
});
