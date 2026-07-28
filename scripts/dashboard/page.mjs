// The dashboard page: one self-contained HTML string (inline CSS + a module script that
// imports the shared classification helpers from /lib.mjs). All dynamic content is
// rendered via textContent — commit subjects, workflow titles, and API errors are never
// interpolated as HTML. Colors follow the repo-neutral dataviz chrome/status palette;
// status is always icon + label, never color alone.

export function pageHtml() {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>dndtools status</title>
<style>
	:root {
		color-scheme: light;
		--page: #f9f9f7; --surface: #fcfcfb;
		--ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
		--hairline: #e1e0d9; --ring: rgba(11, 11, 11, 0.1);
		--good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;
		--good-text: #006300;
	}
	@media (prefers-color-scheme: dark) {
		:root {
			color-scheme: dark;
			--page: #0d0d0d; --surface: #1a1a19;
			--ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
			--hairline: #2c2c2a; --ring: rgba(255, 255, 255, 0.1);
			--good-text: #0ca30c;
		}
	}
	* { box-sizing: border-box; }
	body {
		margin: 0; background: var(--page); color: var(--ink);
		font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
	}
	main { max-width: 1100px; margin: 0 auto; padding: 20px 16px 48px; }
	header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; margin-bottom: 16px; }
	header h1 { font-size: 18px; margin: 0; }
	header .meta { color: var(--muted); font-size: 12px; }
	header button {
		margin-left: auto; font: inherit; font-size: 13px; padding: 4px 12px;
		border: 1px solid var(--ring); border-radius: 6px; background: var(--surface);
		color: var(--ink); cursor: pointer;
	}
	header button:hover { border-color: var(--muted); }
	.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 18px; }
	.tile {
		background: var(--surface); border: 1px solid var(--ring); border-radius: 10px;
		padding: 12px 14px; min-width: 0;
	}
	.tile .k { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
	.tile .v { font-size: 19px; margin: 3px 0 2px; overflow-wrap: anywhere; }
	.tile .s { color: var(--ink-2); font-size: 12px; overflow-wrap: anywhere; }
	section.card {
		background: var(--surface); border: 1px solid var(--ring); border-radius: 10px;
		padding: 14px 16px; margin-bottom: 14px;
	}
	section.card h2 { font-size: 14px; margin: 0 0 10px; }
	section.card h2 .sub { color: var(--muted); font-weight: normal; font-size: 12px; margin-left: 8px; }
	.tablewrap { overflow-x: auto; }
	table { border-collapse: collapse; width: 100%; }
	th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; }
	th, td { padding: 6px 14px 6px 0; border-bottom: 1px solid var(--hairline); vertical-align: top; }
	tr:last-child td { border-bottom: none; }
	td.time { color: var(--ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
	td.num { font-variant-numeric: tabular-nums; }
	a { color: inherit; }
	.chip { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
	.chip .dot {
		width: 10px; height: 10px; border-radius: 3px; flex: none;
		display: inline-grid; place-items: center; font-size: 8px; color: #fff;
	}
	.chip.good .dot { background: var(--good); }
	.chip.warning .dot { background: var(--warning); }
	.chip.serious .dot { background: var(--serious); }
	.chip.critical .dot { background: var(--critical); }
	.chip.neutral .dot { background: var(--muted); }
	.chip .lbl { font-size: 12.5px; }
	.strip { display: flex; gap: 3px; margin: 8px 0 4px; flex-wrap: wrap; }
	.strip span { width: 14px; height: 14px; border-radius: 4px; background: var(--muted); }
	.strip span.good { background: var(--good); }
	.strip span.warning { background: var(--warning); }
	.strip span.serious { background: var(--serious); }
	.strip span.critical { background: var(--critical); }
	.legend { color: var(--ink-2); font-size: 12px; display: flex; gap: 14px; flex-wrap: wrap; }
	.err { color: var(--ink-2); font-size: 12.5px; white-space: pre-wrap; overflow-wrap: anywhere; }
	ul.plain { list-style: none; margin: 0; padding: 0; }
	ul.plain li { padding: 4px 0; border-bottom: 1px solid var(--hairline); }
	ul.plain li:last-child { border-bottom: none; }
	.commit .sha { color: var(--muted); font-family: ui-monospace, monospace; font-size: 12px; margin-right: 8px; }
	.commit .who { color: var(--muted); font-size: 12px; margin-left: 8px; }
	footer { color: var(--muted); font-size: 12px; margin-top: 20px; }
</style>
</head>
<body>
<main>
	<header>
		<h1>dndtools status</h1>
		<span class="meta" id="stamp">loading…</span>
		<button id="refresh" type="button">Refresh now</button>
	</header>
	<div class="tiles" id="tiles"></div>
	<div id="sections"></div>
	<footer id="foot">Read-only dashboard · localhost only · auto-refreshes every 60s (server caches collectors for 30s)</footer>
</main>
<script type="module">
import { classifyStackStatus, classifyRun, classifyProbe, formatAgo } from '/lib.mjs';

const $tiles = document.getElementById('tiles');
const $sections = document.getElementById('sections');
const $stamp = document.getElementById('stamp');

function el(tag, attrs = {}, children = []) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'text') node.textContent = v;
		else if (v != null) node.setAttribute(k, v);
	}
	for (const child of children) node.append(child);
	return node;
}

const ICON = { good: '✓', warning: '…', serious: '!', critical: '✕', neutral: '–' };
function chip(cls) {
	return el('span', { class: 'chip ' + cls.level }, [
		el('span', { class: 'dot', text: ICON[cls.level] || '' , 'aria-hidden': 'true' }),
		el('span', { class: 'lbl', text: cls.label }),
	]);
}

function timeCell(iso, now) {
	return el('td', { class: 'time', title: iso || '', text: formatAgo(iso, now) });
}

function card(title, sub, body) {
	const h = el('h2', { text: title });
	if (sub) h.append(el('span', { class: 'sub', text: sub }));
	return el('section', { class: 'card' }, [h, body]);
}

function errCard(title, section) {
	return card(title, null, el('div', {}, [
		chip({ level: 'critical', label: 'collector failed' }),
		el('div', { class: 'err', text: section.error || 'unknown error' }),
	]));
}

function table(headers, rows) {
	const thead = el('thead', {}, [el('tr', {}, headers.map((t) => el('th', { text: t })))]);
	return el('div', { class: 'tablewrap' }, [el('table', {}, [thead, el('tbody', {}, rows)])]);
}

function tile(k, v, s) {
	const t = el('div', { class: 'tile' }, [el('div', { class: 'k', text: k })]);
	t.append(v instanceof Node ? el('div', { class: 'v' }, [v]) : el('div', { class: 'v', text: v }));
	if (s) t.append(el('div', { class: 's', text: s }));
	return t;
}

function render(payload) {
	const now = Date.now();
	const { repo, actions, releases, pulls, aws, gcp, probes } = payload.sections;
	$stamp.textContent = 'collected ' + formatAgo(payload.generatedAt, now) +
		(payload.cached ? ' (cached)' : '') + ' · ' + new Date(payload.generatedAt).toLocaleTimeString();
	$tiles.replaceChildren();
	$sections.replaceChildren();

	// ---- headline tiles ----
	if (repo.ok) {
		$tiles.append(tile('Version', 'v' + (repo.data.version || '?'),
			(repo.data.latestTag ? 'tag ' + repo.data.latestTag + ' · ' : '') + repo.data.headSha));
		$tiles.append(tile('Branch', repo.data.branch,
			repo.data.dirtyFiles + ' dirty · ' + repo.data.ahead + ' ahead / ' + repo.data.behind + ' behind origin'));
	}
	if (releases.ok && releases.data[0]) {
		const r = releases.data[0];
		$tiles.append(tile('Latest release', r.tag || r.name || '—',
			(r.draft ? 'DRAFT — unpublished' : 'published ' + formatAgo(r.publishedAt, now)) +
			' · ' + r.assets.length + ' assets'));
	}
	if (actions.ok) {
		const ci = actions.data.latest.find((r) => /ci/i.test(r.workflowName));
		if (ci) $tiles.append(tile('CI', chip(classifyRun(ci.status, ci.conclusion)),
			ci.headBranch + ' · ' + formatAgo(ci.updatedAt, now)));
		const deploy = actions.data.latest.find((r) => /deploy/i.test(r.workflowName));
		if (deploy) $tiles.append(tile('Cloud deploy', chip(classifyRun(deploy.status, deploy.conclusion)),
			deploy.headBranch + ' · ' + formatAgo(deploy.updatedAt, now)));
	}
	if (aws.ok && aws.data.stacks.length) {
		const newest = [...aws.data.stacks].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))[0];
		$tiles.append(tile('Newest stack update', formatAgo(newest.updated, now), newest.name));
	}
	if (probes.ok) {
		const site = probes.data.find((p) => /cloudfront|hosting/i.test(p.source || p.url)) || probes.data[0];
		if (site) $tiles.append(tile('Live site', chip(classifyProbe(site.httpStatus)), site.ms + ' ms'));
	}

	// ---- GitHub Actions ----
	if (actions.ok) {
		const rows = actions.data.latest.map((r) => el('tr', {}, [
			el('td', {}, [el('a', { href: r.url, target: '_blank', rel: 'noopener', text: r.workflowName })]),
			el('td', {}, [chip(classifyRun(r.status, r.conclusion))]),
			el('td', { text: r.headBranch }),
			el('td', { text: r.event }),
			timeCell(r.updatedAt, now),
		]));
		const body = el('div', {}, [table(['Workflow', 'Last run', 'Branch', 'Trigger', 'When'], rows)]);
		const strip = el('div', { class: 'strip' },
			[...actions.data.recent].reverse().map((r) => {
				const c = classifyRun(r.status, r.conclusion);
				return el('span', { class: c.level, title: r.workflowName + ' · ' + c.label + ' · ' + formatAgo(r.updatedAt, now) });
			}));
		body.append(strip, el('div', { class: 'legend' }, [
			el('span', { text: 'Last ' + actions.data.recent.length + ' runs, oldest → newest:' }),
			chip({ level: 'good', label: 'success' }),
			chip({ level: 'warning', label: 'running/queued' }),
			chip({ level: 'critical', label: 'failure' }),
			chip({ level: 'neutral', label: 'skipped/cancelled' }),
		]));
		$sections.append(card('GitHub Actions', 'latest run per workflow', body));
	} else $sections.append(errCard('GitHub Actions', actions));

	// ---- AWS stacks ----
	if (aws.ok) {
		const rows = aws.data.stacks.map((s) => el('tr', {}, [
			el('td', { text: s.name }),
			el('td', {}, [chip(classifyStackStatus(s.status))]),
			timeCell(s.updated, now),
			el('td', { class: 'time', text: (s.updated || '').replace('T', ' ').slice(0, 19) + ' UTC' }),
		]));
		$sections.append(card('AWS CloudFormation', aws.data.profile + ' · ' + aws.data.region,
			table(['Stack', 'Status', 'Updated', 'Timestamp'], rows)));
	} else $sections.append(errCard('AWS CloudFormation', aws));

	// ---- Endpoint probes ----
	if (probes.ok && probes.data.length) {
		const rows = probes.data.map((p) => el('tr', {}, [
			el('td', {}, [el('a', { href: p.url, target: '_blank', rel: 'noopener', text: p.url })]),
			el('td', {}, [chip(classifyProbe(p.httpStatus))]),
			el('td', { class: 'num', text: p.ms + ' ms' }),
			el('td', { text: p.source || '' }),
		]));
		$sections.append(card('Live endpoints', 'from stack outputs · 4xx = up but auth-gated',
			table(['URL', 'Status', 'Latency', 'Source'], rows)));
	}

	// ---- Releases ----
	if (releases.ok) {
		const rows = releases.data.map((r) => el('tr', {}, [
			el('td', {}, [el('a', { href: r.url, target: '_blank', rel: 'noopener', text: r.tag || r.name || '—' })]),
			el('td', {}, [chip(r.draft
				? { level: 'warning', label: 'draft' }
				: r.prerelease ? { level: 'neutral', label: 'pre-release' } : { level: 'good', label: 'published' })]),
			timeCell(r.publishedAt || r.createdAt, now),
			el('td', { class: 'num', text: String(r.assets.length) }),
			el('td', { class: 'num', text: String(r.assets.reduce((n, a) => n + a.downloads, 0)) }),
		]));
		$sections.append(card('GitHub releases', null,
			rows.length ? table(['Tag', 'State', 'Date', 'Assets', 'Downloads'], rows)
				: el('div', { class: 'err', text: 'No releases yet.' })));
	} else $sections.append(errCard('GitHub releases', releases));

	// ---- GCP ----
	if (gcp.ok) {
		const body = el('div', {}, [
			el('div', { class: 'legend' }, Object.entries(gcp.data.keyApis).map(([api, on]) =>
				chip(on ? { level: 'good', label: api + ' enabled' } : { level: 'neutral', label: api + ' disabled' }))),
			el('div', { class: 'err', text: gcp.data.enabledServices +
				' APIs enabled · integration project (Docs/Drive OAuth) — no compute stacks deployed' }),
		]);
		$sections.append(card('GCP', gcp.data.project, body));
	} else $sections.append(errCard('GCP', gcp));

	// ---- Repo activity ----
	if (repo.ok) {
		const items = repo.data.commits.map((c) => el('li', { class: 'commit' }, [
			el('span', { class: 'sha', text: c.sha }),
			el('span', { text: c.subject }),
			el('span', { class: 'who', text: c.author + ' · ' + formatAgo(c.when, now) }),
		]));
		const body = el('div', {}, [el('ul', { class: 'plain' }, items)]);
		if (pulls.ok && pulls.data.length) {
			body.append(el('div', { class: 'legend', style: 'margin-top:10px' },
				[el('span', { text: pulls.data.length + ' open PR(s):' }),
					...pulls.data.map((p) => el('a', { href: p.url, target: '_blank', rel: 'noopener', text: '#' + p.number + ' ' + p.title }))]));
		}
		$sections.append(card('Recent activity', 'main @ origin', body));
	} else $sections.append(errCard('Repo', repo));
}

async function load(force) {
	try {
		const res = await fetch('/api/status' + (force ? '?refresh=1' : ''));
		render(await res.json());
	} catch {
		$stamp.textContent = 'dashboard server unreachable — is "pnpm dashboard" still running?';
	}
}
document.getElementById('refresh').addEventListener('click', () => {
	$stamp.textContent = 'refreshing…';
	load(true);
});
load(false);
setInterval(() => load(false), 60_000);
</script>
</body>
</html>
`;
}
