import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askCopilot, copilotAvailability } from './copilot';
const state = vi.hoisted(() => ({ mode: 'private-e2ee', approved: false }));
vi.mock('./vaultMode', () => ({ vaultPrivacyMode: () => state.mode }));
vi.mock('@dndtools/core', async (importOriginal) => {
	const core = await importOriginal<typeof import('@dndtools/core')>();
	return {
		...core,
		securityDecisionRecordForVaultMode: (mode: import('@dndtools/core').VaultPrivacyMode) => ({
			...core.securityDecisionRecordForVaultMode(mode),
			approved: state.approved,
		}),
	};
});
const question = { version: 1, vaultId: 'vault', revision: 'r1', question: 'Who guards the gate?' };
const answer = {
	version: 1,
	revision: 'r1',
	status: 'answered',
	answer: 'The watch.',
	citations: [{ sourceId: 'note', chunkId: 'note:secret', revision: 'r1' }],
};
beforeEach(() => {
	state.mode = 'private-e2ee';
	state.approved = false;
});
describe('Copilot client contract', () => {
	it('exposes honest gated presentation states and never sends private questions', async () => {
		const transport = vi.fn();
		expect(copilotAvailability(transport)).toMatchObject({
			available: false,
			reason: 'private-vault',
		});
		await expect(askCopilot(question, transport)).rejects.toThrow('Private vaults');
		state.mode = 'cloud-enhanced';
		expect(copilotAvailability(transport)).toMatchObject({
			available: false,
			reason: 'security-review',
		});
		await expect(askCopilot(question, transport)).rejects.toThrow('security review');
		expect(transport).not.toHaveBeenCalled();
	});
	it('does not invent an endpoint after security approval', async () => {
		state.mode = 'cloud-enhanced';
		state.approved = true;
		expect(copilotAvailability()).toMatchObject({ available: false, reason: 'not-configured' });
		await expect(askCopilot(question)).rejects.toThrow('not configured');
	});
	it('round-trips the server wire shape and forwards cancellation', async () => {
		state.mode = 'cloud-enhanced';
		state.approved = true;
		const transport = vi.fn().mockResolvedValue(answer);
		const controller = new AbortController();
		await expect(askCopilot(question, transport, controller.signal)).resolves.toEqual(answer);
		expect(transport).toHaveBeenCalledWith(question, controller.signal);
		controller.abort();
		transport.mockClear();
		await expect(askCopilot(question, transport, controller.signal)).rejects.toThrow();
		expect(transport).not.toHaveBeenCalled();
	});
	it('rejects stale responses and consent revocation during a request', async () => {
		state.mode = 'cloud-enhanced';
		state.approved = true;
		await expect(askCopilot(question, async () => ({ ...answer, revision: 'r2' }))).rejects.toThrow(
			'Invalid Copilot answer',
		);
		await expect(
			askCopilot(question, async () => {
				state.mode = 'private-e2ee';
				return answer;
			}),
		).rejects.toThrow('Private vaults');
	});
});
