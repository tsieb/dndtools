import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.STAGE = 'dev';
process.env.METRIC_NAMESPACE = 'dndtools/Analytics';

const { handler } = await import('./telemetry.ts');

// RC-CLD-1.4 — the ingestion side. Two properties: it counts only what the core taxonomy accepts,
// and every outcome looks the same from outside (a flat 202, so a prober learns nothing).
const logs: string[] = [];
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logs.length = 0;
	logSpy?.mockRestore();
	logSpy = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
		logs.push(String(line));
	});
});

const invoke = async (body: unknown) =>
	(await handler(
		{ body: typeof body === 'string' ? body : JSON.stringify(body) } as never,
		{} as never,
		(() => undefined) as never,
	)) as { statusCode: number; body: string };

const batch = (events: unknown[]) => ({ version: 1, appVersion: '0.3', platform: 'web', events });

describe('RC-CLD-1.4 ingestion', () => {
	it('counts a valid batch as CloudWatch metrics and stores nothing', async () => {
		const res = await invoke(
			batch([
				{ name: 'screen.viewed', props: { screen: 'session' } },
				{ name: 'screen.viewed', props: { screen: 'session' } },
				{ name: 'feature.used', props: { feature: 'dice-roll' } },
			]),
		);
		expect(res.statusCode).toBe(202);
		expect(res.body).toBe('{}');
		expect(logs).toHaveLength(2);

		const emitted = logs.map((l) => JSON.parse(l) as Record<string, unknown>);
		const viewed = emitted.find((e) => e.Event === 'screen.viewed');
		expect(viewed?.Events).toBe(2);
		expect(viewed?.Stage).toBe('dev');
		expect(viewed?.platform).toBe('web');
		expect(
			(viewed?._aws as { CloudWatchMetrics: { Namespace: string }[] }).CloudWatchMetrics[0]
				.Namespace,
		).toBe('dndtools/Analytics');
		expect(emitted.find((e) => e.Event === 'feature.used')?.Events).toBe(1);
	});

	it('keeps the metric dimensions coarse — one metric per event name, not per property', async () => {
		await invoke(
			batch([
				{ name: 'screen.viewed', props: { screen: 'session' } },
				{ name: 'screen.viewed', props: { screen: 'atlas' } },
			]),
		);
		expect(logs).toHaveLength(1);
		const emitted = JSON.parse(logs[0]!) as Record<string, unknown>;
		const meta = emitted._aws as { CloudWatchMetrics: { Dimensions: string[][] }[] };
		expect(meta.CloudWatchMetrics[0]!.Dimensions).toEqual([['Stage', 'Event']]);
		expect(emitted.detail).toEqual({
			'screen.viewed|screen=session': 1,
			'screen.viewed|screen=atlas': 1,
		});
	});

	it('counts nothing from an off-taxonomy batch and still answers 202', async () => {
		for (const body of [
			batch([{ name: 'note.opened', props: { title: 'The Sunless Citadel' } }]),
			batch([{ name: 'screen.viewed', props: { screen: 'Aldric the Grim' } }]),
			{ ...batch([{ name: 'app.launched', props: { platform: 'web' } }]), version: 2 },
			batch([]),
			'not json at all',
			'',
		]) {
			const res = await invoke(body);
			expect(res.statusCode).toBe(202);
		}
		expect(logs).toEqual([]);
	});

	it('rejects an oversized body without parsing it', async () => {
		const res = await invoke('x'.repeat(17 * 1024));
		expect(res.statusCode).toBe(202);
		expect(logs).toEqual([]);
	});

	it('ignores identity-shaped fields a caller tries to attach', async () => {
		await invoke({
			...batch([{ name: 'app.launched', props: { platform: 'web' } }]),
			accountId: 'us-east-1:abc',
			email: 'dm@example.test',
		});
		expect(logs).toHaveLength(1);
		expect(logs[0]).not.toContain('example.test');
		expect(logs[0]).not.toContain('us-east-1:abc');
	});
});
