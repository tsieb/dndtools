// Shared types for the whole-application validation harness (`pnpm validate`).
// A "check" is one runnable verification; checks are grouped into layers and
// executed in ordered stages so independent work runs in parallel while the
// few checks that share a dev/preview server or a build artifact stay serialized.

export type CheckStatus = 'pass' | 'fail' | 'skip' | 'warn';

/** Named runtime environments a check can require before it is allowed to run. */
export type Capability = 'aws' | 'display' | 'electron';

/** Coarse grouping used for reporting and `--layer` selection. */
export type Layer =
	| 'static' // lint / typecheck / gates — no servers, no build
	| 'unit' // vitest suites (core / gm / tooling / cloud) — no servers
	| 'build' // production builds that gate browser + desktop checks
	| 'browser' // headless-browser driven checks against a live dev/preview server
	| 'desktop' // packaged Electron smoke (needs a display)
	| 'cloud' // live AWS dev-stack validation (opt-in via --live)
	| 'audit'; // static analysis: feature-gap / requirement drift

/** A long-lived server process a browser check runs against. Ref-counted by the runner. */
export interface ServerSpec {
	name: string;
	/** Shell command to launch the server (run from repo root). */
	command: string;
	/** TCP port to wait for before declaring the server ready. */
	port: number;
	/** How long to wait for the port to open, ms. */
	readyTimeoutMs: number;
	/** Optional human note shown in logs. */
	note?: string;
}

export interface CheckContext {
	repoRoot: string;
	logDir: string;
	/** Values resolved by earlier checks (e.g. live cloud coordinates from SSM). */
	shared: Record<string, string>;
	/** Detected capabilities for this run. */
	capabilities: Set<Capability>;
	stage: string;
	/** Convenience: run a shell command, tee output to the check's log, return exit info. */
	exec: (
		command: string,
		opts?: { timeoutMs?: number; env?: Record<string, string> },
	) => Promise<{ code: number; tail: string; durationMs: number }>;
	/** Append a line to the check's own log file. */
	log: (line: string) => void;
}

export interface CheckOutcome {
	status: CheckStatus;
	/** One-line human summary shown in the console + report. */
	summary?: string;
	/** Optional structured detail (rendered into the HTML report). */
	detail?: unknown;
}

export interface Check {
	id: string;
	title: string;
	layer: Layer;
	/** Ordered execution stage. Lower stages complete before higher ones start. */
	stage: number;
	/**
	 * Checks that share a `group` within a stage run sequentially (used when they
	 * hit the same server and must not race). Distinct groups run in parallel.
	 * Defaults to the check id (fully parallel).
	 */
	group?: string;
	/** Servers that must be up before this check runs. */
	servers?: string[];
	/** Capabilities that must be present, else the check is skipped with a reason. */
	requires?: Capability[];
	/** A failure downgrades to `warn` (informational) instead of failing the run. */
	optional?: boolean;
	/** Excluded from the default run; only runs when explicitly selected or flagged. */
	offByDefault?: boolean;
	/** One-line description of what the check protects. */
	description: string;
	/** Shell command form. */
	command?: string;
	/** Programmatic form (cloud probes, feature audit). Takes precedence over command. */
	run?: (ctx: CheckContext) => Promise<CheckOutcome>;
	/** Per-check timeout override, ms. */
	timeoutMs?: number;
}

export interface CheckResult {
	id: string;
	title: string;
	layer: Layer;
	status: CheckStatus;
	durationMs: number;
	summary: string;
	logPath?: string;
	detail?: unknown;
	skipReason?: string;
}

export interface RunReport {
	startedAt: string;
	finishedAt: string;
	durationMs: number;
	selection: string;
	capabilities: Capability[];
	results: CheckResult[];
	counts: Record<CheckStatus, number>;
	ok: boolean;
}
