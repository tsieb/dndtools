// Read-only data collectors for the project status dashboard. Every collector shells out
// to a fixed, argument-array command (execFile, never a shell string) with a hard timeout,
// and returns { ok, ms, data | error } so one broken CLI/credential never takes the page
// down. Nothing here mutates cloud state: CloudFormation describe, gcloud list, gh reads,
// git log/status, and HTTPS GET probes only.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { latestRunPerWorkflow, httpsOutputs } from './lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const AWS_PROFILE = process.env.DASHBOARD_AWS_PROFILE || 'dndtools';
const AWS_REGION = process.env.DASHBOARD_AWS_REGION || 'ca-central-1';

function run(cmd, args, { timeout = 20_000 } = {}) {
	return new Promise((resolve) => {
		execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
			if (err) resolve({ ok: false, error: (stderr || err.message || '').trim().slice(0, 500) });
			else resolve({ ok: true, stdout });
		});
	});
}

async function timed(fn) {
	const started = Date.now();
	try {
		const data = await fn();
		return { ok: true, ms: Date.now() - started, data };
	} catch (err) {
		return { ok: false, ms: Date.now() - started, error: String(err.message || err).slice(0, 500) };
	}
}

function must(result, what) {
	if (!result.ok) throw new Error(`${what}: ${result.error}`);
	return result.stdout;
}

async function collectRepo() {
	// A fetch keeps ahead/behind honest; tolerate offline (local refs still render).
	await run('git', ['fetch', '--quiet', 'origin', 'main'], { timeout: 10_000 });
	const [branch, dirty, counts, tag, log, head] = await Promise.all([
		run('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
		run('git', ['status', '--porcelain']),
		run('git', ['rev-list', '--left-right', '--count', 'origin/main...HEAD']),
		run('git', ['describe', '--tags', '--abbrev=0']),
		run('git', ['log', '-8', '--pretty=format:%h%x1f%s%x1f%an%x1f%cI']),
		run('git', ['log', '-1', '--pretty=format:%H']),
	]);
	const [behind, ahead] = must(counts, 'git rev-list').trim().split(/\s+/).map(Number);
	const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
	return {
		version: pkg.version,
		branch: must(branch, 'git branch').trim(),
		dirtyFiles: must(dirty, 'git status').split('\n').filter(Boolean).length,
		ahead,
		behind,
		headSha: must(head, 'git head').trim().slice(0, 8),
		latestTag: tag.ok ? tag.stdout.trim() : null,
		commits: must(log, 'git log')
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				const [sha, subject, author, when] = line.split('\x1f');
				return { sha, subject, author, when };
			}),
	};
}

async function collectActions() {
	const out = must(
		await run('gh', [
			'run', 'list', '--limit', '50',
			'--json', 'workflowName,name,displayTitle,headBranch,status,conclusion,createdAt,updatedAt,url,event',
		]),
		'gh run list',
	);
	const runs = JSON.parse(out);
	return { latest: latestRunPerWorkflow(runs), recent: runs.slice(0, 20) };
}

async function collectReleases() {
	// gh api includes draft releases (gh release list hides asset/draft detail).
	const out = must(await run('gh', ['api', 'repos/{owner}/{repo}/releases?per_page=10']), 'gh api releases');
	return JSON.parse(out).map((r) => ({
		tag: r.tag_name,
		name: r.name,
		draft: r.draft,
		prerelease: r.prerelease,
		createdAt: r.created_at,
		publishedAt: r.published_at,
		assets: (r.assets || []).map((a) => ({ name: a.name, downloads: a.download_count })),
		url: r.html_url,
	}));
}

async function collectPulls() {
	const out = must(
		await run('gh', ['pr', 'list', '--limit', '10', '--json', 'number,title,updatedAt,url,headRefName']),
		'gh pr list',
	);
	return JSON.parse(out);
}

async function collectAws() {
	const out = must(
		await run('aws', [
			'cloudformation', 'describe-stacks',
			'--profile', AWS_PROFILE, '--region', AWS_REGION, '--output', 'json',
		], { timeout: 30_000 }),
		'aws describe-stacks',
	);
	const stacks = JSON.parse(out).Stacks || [];
	stacks.sort((a, b) => a.StackName.localeCompare(b.StackName));
	return {
		profile: AWS_PROFILE,
		region: AWS_REGION,
		stacks: stacks.map((s) => ({
			name: s.StackName,
			status: s.StackStatus,
			updated: s.LastUpdatedTime || s.CreationTime,
			description: s.Description || '',
		})),
		endpoints: httpsOutputs(stacks),
	};
}

async function collectGcp() {
	const project = await run('gcloud', ['config', 'get-value', 'project'], { timeout: 15_000 });
	const projectId = project.ok ? project.stdout.trim() : null;
	if (!projectId || projectId === '(unset)') throw new Error('no gcloud project configured');
	const services = JSON.parse(
		must(
			await run('gcloud', ['services', 'list', '--enabled', '--project', projectId, '--format', 'json'], {
				timeout: 30_000,
			}),
			'gcloud services list',
		),
	).map((s) => s.config?.name || '');
	return {
		project: projectId,
		enabledServices: services.length,
		keyApis: {
			'Google Docs API': services.includes('docs.googleapis.com'),
			'Google Drive API': services.includes('drive.googleapis.com'),
		},
	};
}

async function probe(url) {
	const started = Date.now();
	try {
		const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8_000) });
		await res.body?.cancel();
		return { url, httpStatus: res.status, ms: Date.now() - started };
	} catch {
		return { url, httpStatus: null, ms: Date.now() - started };
	}
}

async function collectProbes(awsSection) {
	const targets = new Map();
	for (const ep of awsSection?.ok ? awsSection.data.endpoints : []) targets.set(ep.url, ep.source);
	const results = await Promise.all(
		[...targets.entries()].map(async ([url, source]) => ({ ...(await probe(url)), source })),
	);
	return results;
}

/** Run every collector concurrently; probes consume the AWS stack outputs. */
export async function collectAll() {
	const [repo, actions, releases, pulls, aws, gcp] = await Promise.all([
		timed(collectRepo),
		timed(collectActions),
		timed(collectReleases),
		timed(collectPulls),
		timed(collectAws),
		timed(collectGcp),
	]);
	const probes = await timed(() => collectProbes(aws));
	return { generatedAt: new Date().toISOString(), sections: { repo, actions, releases, pulls, aws, gcp, probes } };
}
