import { availableParallelism } from 'node:os';

// Worker cap shared by every Vitest config in the repo (root tooling/cloud/app suites and
// packages/core). Vitest's default is one forked worker per logical CPU; on a 16-core box that is
// 16 Node processes each holding a transformed copy of `packages/core`, and several suites (or
// several checkouts — the RC loop runs five) at once saturate CPU and memory. The cap keeps the
// suites identical in what they test and merely bounds how many files run at the same time.
//
//   DNDTOOLS_TEST_WORKERS=N   explicit cap (the RC loop sets a per-slot budget)
//   otherwise                 half the logical CPUs, clamped to 2..8
//
// The CLI flag `--maxWorkers=N` still overrides either.
export function testWorkers(): number {
	const fromEnv = Number(process.env.DNDTOOLS_TEST_WORKERS);
	if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.floor(fromEnv);
	return Math.max(2, Math.min(8, Math.floor(availableParallelism() / 2)));
}
