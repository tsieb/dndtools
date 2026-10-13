import { afterEach, expect, it, vi } from 'vitest';
import { captureGraphUpdates } from '../../scripts/perf/graph-update';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function fixture(status: string, visible: boolean) {
	let title = '';
	const dispatch = vi.fn(async (command: { payload: { title: string } }) => {
		title = command.payload.title;
		return { status };
	});
	vi.stubGlobal('window', { __rt: { dispatch } });
	vi.stubGlobal('document', {
		querySelector: () => ({ querySelectorAll: () => (visible ? [{ textContent: title }] : []) }),
	});
	vi.stubGlobal('requestAnimationFrame', (done: () => void) => done());
	return dispatch;
}

it('retains a sample for every accepted and rendered graph update', async () => {
	const dispatch = fixture('accepted', true);
	const samples = await captureGraphUpdates({ actor: 'dm', runs: 5 });
	expect(samples).toHaveLength(5);
	expect(samples.every((sample) => Number.isFinite(sample) && sample >= 0)).toBe(true);
	expect(dispatch).toHaveBeenCalledTimes(5);
	expect(dispatch.mock.calls[4]?.[0].payload.title).toBe('Perf indexed note 4');
});

it('invalidates the batch instead of dropping a rejected command from the samples', async () => {
	const dispatch = fixture('rejected', false);
	await expect(captureGraphUpdates({ actor: 'dm', runs: 5 })).rejects.toThrow('command rejected');
	expect(dispatch).toHaveBeenCalledTimes(1);
});

it('invalidates the batch when an accepted update never renders', async () => {
	fixture('accepted', false);
	let now = 0;
	vi.spyOn(performance, 'now').mockImplementation(() => (now += 6000));
	await expect(captureGraphUpdates({ actor: 'dm', runs: 1 })).rejects.toThrow('did not render');
});
