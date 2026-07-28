// Pure helpers for the project status dashboard (scripts/dashboard). Free of I/O so the
// repo-level tooling suite (tests/unit/dashboard-lib.test.ts) can cover the status
// classification and time formatting the dashboard page relies on.

/** Map a CloudFormation stack status onto the fixed status palette. */
export function classifyStackStatus(status) {
	if (!status) return { level: 'neutral', label: 'unknown' };
	if (status.includes('FAILED') || status.includes('DELETE')) return { level: 'critical', label: status };
	if (status.includes('ROLLBACK')) return { level: 'serious', label: status };
	if (status.endsWith('IN_PROGRESS')) return { level: 'warning', label: status };
	if (status.endsWith('COMPLETE')) return { level: 'good', label: status };
	return { level: 'neutral', label: status };
}

/** Map a GitHub Actions run (status + conclusion) onto the fixed status palette. */
export function classifyRun(status, conclusion) {
	if (status === 'queued' || status === 'waiting' || status === 'pending') {
		return { level: 'warning', label: 'queued' };
	}
	if (status === 'in_progress') return { level: 'warning', label: 'running' };
	switch (conclusion) {
		case 'success':
			return { level: 'good', label: 'success' };
		case 'failure':
		case 'timed_out':
		case 'startup_failure':
			return { level: 'critical', label: conclusion.replace(/_/g, ' ') };
		case 'action_required':
			return { level: 'serious', label: 'action required' };
		case 'cancelled':
		case 'skipped':
		case 'neutral':
			return { level: 'neutral', label: conclusion };
		default:
			return { level: 'neutral', label: conclusion || status || 'unknown' };
	}
}

/** Map an HTTP probe result onto the fixed status palette. A 4xx from an API that
 *  expects auth still proves the endpoint is up, so it is warning, not critical. */
export function classifyProbe(httpStatus) {
	if (httpStatus == null) return { level: 'critical', label: 'unreachable' };
	if (httpStatus < 400) return { level: 'good', label: `HTTP ${httpStatus}` };
	if (httpStatus < 500) return { level: 'warning', label: `HTTP ${httpStatus}` };
	return { level: 'critical', label: `HTTP ${httpStatus}` };
}

/** Latest run per workflow, preserving the (newest-first) order of the input list. */
export function latestRunPerWorkflow(runs) {
	const seen = new Map();
	for (const run of runs) {
		const key = run.workflowName || run.name;
		if (!seen.has(key)) seen.set(key, run);
	}
	return [...seen.values()];
}

/** Compact relative time: "3m ago", "2h ago", "5d ago". */
export function formatAgo(iso, nowMs) {
	if (!iso) return '—';
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return '—';
	const sec = Math.round((nowMs - then) / 1000);
	if (sec < 0) return 'in the future';
	if (sec < 60) return `${sec}s ago`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 48) return `${hr}h ago`;
	const day = Math.floor(hr / 24);
	return `${day}d ago`;
}

/** Extract https:// URLs (deduplicated) from CloudFormation stack Outputs. */
export function httpsOutputs(stacks) {
	const found = new Map();
	for (const stack of stacks || []) {
		for (const out of stack.Outputs || []) {
			const value = String(out.OutputValue || '');
			if (value.startsWith('https://') && !found.has(value)) {
				found.set(value, { url: value, source: `${stack.StackName} / ${out.OutputKey}` });
			}
		}
	}
	return [...found.values()];
}
