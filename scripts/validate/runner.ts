// The scheduler. Selects checks, detects capabilities, then runs them in ordered
// stages. Within a stage, checks that share a `group` run sequentially (they hit
// the same dev server); distinct groups run concurrently up to a jobs cap.
// Managed servers are started once per stage that needs them and torn down at the end.

import os from 'node:os';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Capability, Check, CheckContext, CheckResult, RunReport } from './types.ts';
import { REPO_ROOT, c, exec, fmtDuration } from './util.ts';
import { ServerManager } from './servers.ts';

export interface RunOptions {
	checks: Check[]; // already selected/filtered
	selectionLabel: string;
	logDir: string;
	jobs: number;
}

function detectCapabilities(needed: Set<Capability>): Promise<Set<Capability>> {
	const have = new Set<Capability>();
	const tasks: Promise<void>[] = [];
	if (needed.has('display')) {
		if (process.platform === 'darwin' || process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
			have.add('display');
	}
	if (needed.has('electron')) {
		if (existsSync(path.join(REPO_ROOT, 'node_modules/electron'))) have.add('electron');
	}
	if (needed.has('aws')) {
		tasks.push(
			exec(`aws sts get-caller-identity --profile ${process.env.DNDTOOLS_PROFILE ?? 'dndtools'}`, {
				timeoutMs: 20_000,
			}).then((r) => {
				if (r.code === 0) have.add('aws');
			}),
		);
	}
	return Promise.all(tasks).then(() => have);
}

async function runOne(
	check: Check,
	logDir: string,
	shared: Record<string, string>,
	caps: Set<Capability>,
): Promise<CheckResult> {
	const logPath = path.join(logDir, `${check.id.replace(/[^\w.-]/g, '_')}.log`);
	const base: CheckResult = {
		id: check.id,
		title: check.title,
		layer: check.layer,
		status: 'pass',
		durationMs: 0,
		summary: '',
		logPath,
	};

	// Capability gate.
	const missing = (check.requires ?? []).filter((r) => !caps.has(r));
	if (missing.length) {
		return {
			...base,
			status: 'skip',
			skipReason: `missing capability: ${missing.join(', ')}`,
			logPath: undefined,
		};
	}

	const start = Date.now();
	console.log(c.dim(`   ▶ ${check.id}`));
	try {
		if (check.run) {
			const buffer: string[] = [];
			const ctx: CheckContext = {
				repoRoot: REPO_ROOT,
				logDir,
				shared,
				capabilities: caps,
				stage: String(check.stage),
				log: (line) => buffer.push(line),
				exec: async (command, opts) => {
					const r = await exec(command, {
						timeoutMs: opts?.timeoutMs ?? check.timeoutMs,
						env: opts?.env,
					});
					buffer.push(`$ ${command}`, r.tail);
					return { code: r.code, tail: r.tail, durationMs: r.durationMs };
				},
			};
			const outcome = await check.run(ctx);
			mkdirSync(logDir, { recursive: true });
			writeFileSync(logPath, buffer.join('\n'));
			let status = outcome.status;
			if (status === 'fail' && check.optional) status = 'warn';
			return {
				...base,
				status,
				durationMs: Date.now() - start,
				summary: outcome.summary ?? '',
				detail: outcome.detail,
			};
		}
		// Shell command check.
		const r = await exec(check.command!, { timeoutMs: check.timeoutMs, logPath });
		const ok = r.code === 0;
		let status: CheckResult['status'] = ok ? 'pass' : 'fail';
		if (!ok && check.optional) status = 'warn';
		const summary = ok
			? 'ok'
			: r.timedOut
				? `timed out after ${fmtDuration(r.durationMs)}`
				: `exit ${r.code}: ${r.tail.split('\n').slice(-2).join(' ').slice(0, 160)}`;
		return { ...base, status, durationMs: Date.now() - start, summary };
	} catch (err) {
		return {
			...base,
			status: check.optional ? 'warn' : 'fail',
			durationMs: Date.now() - start,
			summary: (err as Error).message,
		};
	}
}

/** Run a set of group-tasks with a concurrency cap. */
async function pool<T>(items: (() => Promise<T>)[], cap: number): Promise<T[]> {
	const results: T[] = new Array(items.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(cap, items.length) }, async () => {
		while (cursor < items.length) {
			const i = cursor++;
			results[i] = await items[i]();
		}
	});
	await Promise.all(workers);
	return results;
}

export async function run(opts: RunOptions): Promise<RunReport> {
	const { checks, logDir, jobs } = opts;
	mkdirSync(logDir, { recursive: true });
	const startedAt = new Date().toISOString();
	const startMs = Date.now();

	const neededCaps = new Set<Capability>();
	for (const ch of checks) for (const r of ch.requires ?? []) neededCaps.add(r);
	if (neededCaps.size)
		console.log(c.dim(`Detecting capabilities: ${[...neededCaps].join(', ')} …`));
	const caps = await detectCapabilities(neededCaps);
	if (neededCaps.size) console.log(c.dim(`Available: ${[...caps].join(', ') || 'none'}`));

	const servers = new ServerManager(logDir);
	const shared: Record<string, string> = {};
	const results: CheckResult[] = [];

	const stages = [...new Set(checks.map((ch) => ch.stage))].sort((a, b) => a - b);
	try {
		for (const stage of stages) {
			const stageChecks = checks.filter((ch) => ch.stage === stage);
			const runnable = stageChecks.filter((ch) => (ch.requires ?? []).every((r) => caps.has(r)));
			const skipped = stageChecks.filter((ch) => !runnable.includes(ch));

			console.log(
				c.bold(
					`\n▄ Stage ${stage} — ${runnable.length} check(s)${skipped.length ? `, ${skipped.length} skipped` : ''}`,
				),
			);

			// Ensure servers for this stage's runnable checks (sequentially, to avoid start races).
			// A server that fails to start fails only the checks that need it, not the whole run.
			const stageServers = [...new Set(runnable.flatMap((ch) => ch.servers ?? []))];
			const failedServers = new Set<string>();
			for (const s of stageServers) {
				try {
					await servers.ensure(s);
				} catch (err) {
					failedServers.add(s);
					console.log(c.red(`   ✘ server ${s}: ${(err as Error).message}`));
				}
			}

			// Group tasks: same group → sequential; distinct groups → parallel.
			const groups = new Map<string, Check[]>();
			for (const ch of runnable) {
				const key = ch.group ?? ch.id;
				(groups.get(key) ?? groups.set(key, []).get(key)!).push(ch);
			}
			const glyph = {
				pass: c.green('✔'),
				fail: c.red('✘'),
				warn: c.yellow('▲'),
				skip: c.gray('–'),
			};
			const groupTasks = [...groups.values()].map((groupChecks) => async () => {
				for (const ch of groupChecks) {
					const deadServer = (ch.servers ?? []).find((s) => failedServers.has(s));
					const res = deadServer
						? {
								id: ch.id,
								title: ch.title,
								layer: ch.layer,
								status: 'fail' as const,
								durationMs: 0,
								summary: `required server '${deadServer}' failed to start`,
							}
						: await runOne(ch, logDir, shared, caps);
					results.push(res);
					console.log(
						`   ${glyph[res.status]} ${res.id.padEnd(24)} ${c.gray(fmtDuration(res.durationMs))}  ${res.status === 'skip' ? c.gray(res.skipReason ?? '') : res.summary}`,
					);
				}
			});
			await pool(groupTasks, jobs);

			for (const ch of skipped)
				results.push({
					id: ch.id,
					title: ch.title,
					layer: ch.layer,
					status: 'skip',
					durationMs: 0,
					summary: '',
					skipReason: `missing capability: ${(ch.requires ?? []).filter((r) => !caps.has(r)).join(', ')}`,
				});
		}
	} finally {
		await servers.shutdown();
	}

	// Preserve registry order in the report for stable reading.
	const order = new Map(checks.map((ch, i) => [ch.id, i]));
	results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

	const counts = { pass: 0, fail: 0, warn: 0, skip: 0 } as RunReport['counts'];
	for (const r of results) counts[r.status]++;
	const finishedAt = new Date().toISOString();
	return {
		startedAt,
		finishedAt,
		durationMs: Date.now() - startMs,
		selection: opts.selectionLabel,
		capabilities: [...caps],
		results,
		counts,
		ok: counts.fail === 0,
	};
}

export function defaultJobs(): number {
	return Math.max(2, Math.min((os.cpus()?.length ?? 4) - 1, 6));
}
