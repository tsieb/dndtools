// Regression coverage for the status dashboard's pure helpers (scripts/dashboard/lib.mjs):
// the status classifications drive the page's icon+label chips, so a misclassification
// (e.g. UPDATE_ROLLBACK_COMPLETE reading as "good") would silently misreport cloud health.
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import {
	classifyStackStatus,
	classifyRun,
	classifyProbe,
	latestRunPerWorkflow,
	formatAgo,
	httpsOutputs,
} from '../../scripts/dashboard/lib.mjs';

describe('classifyStackStatus', () => {
	it('reads healthy terminal states as good', () => {
		expect(classifyStackStatus('CREATE_COMPLETE').level).toBe('good');
		expect(classifyStackStatus('UPDATE_COMPLETE').level).toBe('good');
	});
	it('reads rollbacks as serious even though they end in COMPLETE', () => {
		expect(classifyStackStatus('UPDATE_ROLLBACK_COMPLETE').level).toBe('serious');
		expect(classifyStackStatus('ROLLBACK_COMPLETE').level).toBe('serious');
	});
	it('reads failures/deletes as critical and transitions as warning', () => {
		expect(classifyStackStatus('CREATE_FAILED').level).toBe('critical');
		expect(classifyStackStatus('DELETE_COMPLETE').level).toBe('critical');
		expect(classifyStackStatus('UPDATE_IN_PROGRESS').level).toBe('warning');
		expect(classifyStackStatus(undefined).level).toBe('neutral');
	});
});

describe('classifyRun', () => {
	it('maps live states to warning regardless of conclusion', () => {
		expect(classifyRun('in_progress', null)).toEqual({ level: 'warning', label: 'running' });
		expect(classifyRun('queued', null).level).toBe('warning');
	});
	it('maps conclusions onto the status palette', () => {
		expect(classifyRun('completed', 'success').level).toBe('good');
		expect(classifyRun('completed', 'failure').level).toBe('critical');
		expect(classifyRun('completed', 'timed_out').label).toBe('timed out');
		expect(classifyRun('completed', 'action_required').level).toBe('serious');
		expect(classifyRun('completed', 'skipped').level).toBe('neutral');
	});
});

describe('classifyProbe', () => {
	it('treats 2xx/3xx as good, 4xx as up-but-gated, 5xx/unreachable as critical', () => {
		expect(classifyProbe(200).level).toBe('good');
		expect(classifyProbe(301).level).toBe('good');
		expect(classifyProbe(403).level).toBe('warning');
		expect(classifyProbe(500).level).toBe('critical');
		expect(classifyProbe(null).level).toBe('critical');
	});
});

describe('latestRunPerWorkflow', () => {
	it('keeps the first (newest) run per workflow in input order', () => {
		const runs = [
			{ workflowName: 'CI', conclusion: 'failure' },
			{ workflowName: 'Deploy', conclusion: 'success' },
			{ workflowName: 'CI', conclusion: 'success' },
		];
		const latest = latestRunPerWorkflow(runs);
		expect(latest).toHaveLength(2);
		expect(latest[0]).toEqual({ workflowName: 'CI', conclusion: 'failure' });
	});
});

describe('formatAgo', () => {
	const now = Date.parse('2026-07-27T12:00:00Z');
	it('formats compact relative times', () => {
		expect(formatAgo('2026-07-27T11:59:30Z', now)).toBe('30s ago');
		expect(formatAgo('2026-07-27T09:00:00Z', now)).toBe('3h ago');
		expect(formatAgo('2026-07-20T12:00:00Z', now)).toBe('7d ago');
		expect(formatAgo(null, now)).toBe('—');
		expect(formatAgo('not-a-date', now)).toBe('—');
	});
});

describe('httpsOutputs', () => {
	it('extracts deduplicated https outputs with their stack/key source', () => {
		const stacks = [
			{
				StackName: 'web',
				Outputs: [
					{ OutputKey: 'Url', OutputValue: 'https://example.cloudfront.net' },
					{ OutputKey: 'Wss', OutputValue: 'wss://sockets.example.com' },
				],
			},
			{ StackName: 'api', Outputs: [{ OutputKey: 'Alias', OutputValue: 'https://example.cloudfront.net' }] },
		];
		expect(httpsOutputs(stacks)).toEqual([
			{ url: 'https://example.cloudfront.net', source: 'web / Url' },
		]);
		expect(httpsOutputs(undefined)).toEqual([]);
	});
});
