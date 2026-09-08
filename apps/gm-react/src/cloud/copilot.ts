import { isPlaintextUploadPermitted, securityDecisionRecordForVaultMode } from '@dndtools/core';
import {
	parseCopilotAnswer,
	parseCopilotQuestion,
	type CopilotQuestion,
} from '../../../../packages/cloud-fns/src/copilot/contract';
import { vaultPrivacyMode } from './vaultMode';

export type {
	CopilotAnswer,
	CopilotQuestion,
} from '../../../../packages/cloud-fns/src/copilot/contract';

/** No default route: an authenticated phase-2 adapter must be explicitly supplied after review. */
export type CopilotTransport = (
	question: CopilotQuestion,
	signal?: AbortSignal,
) => Promise<unknown>;
export type CopilotAvailability =
	| {
			available: false;
			reason: 'private-vault' | 'security-review' | 'not-configured';
			message: string;
	  }
	| { available: true };

/** Presentation only. Server registration and membership remain authoritative. */
export function copilotAvailability(transport?: CopilotTransport): CopilotAvailability {
	const mode = vaultPrivacyMode();
	if (mode !== 'cloud-enhanced')
		return {
			available: false,
			reason: 'private-vault',
			message: 'Managed Copilot is unavailable for Private vaults.',
		};
	if (!isPlaintextUploadPermitted(mode, securityDecisionRecordForVaultMode(mode)))
		return {
			available: false,
			reason: 'security-review',
			message: 'Managed Copilot is waiting for the Cloud-Enhanced security review.',
		};
	if (!transport)
		return {
			available: false,
			reason: 'not-configured',
			message: 'Managed Copilot is not configured in this build.',
		};
	return { available: true };
}

/** Read-only answers. Any later proposal must enter the existing core review/dispatch path. */
export async function askCopilot(
	input: unknown,
	transport?: CopilotTransport,
	signal?: AbortSignal,
) {
	const availability = copilotAvailability(transport);
	if (!availability.available) throw new Error(availability.message);
	signal?.throwIfAborted();
	const question = parseCopilotQuestion(input);
	const result = await transport!(question, signal);
	signal?.throwIfAborted();
	// Consent may change while a request is in flight; do not show a late answer after revocation.
	const current = copilotAvailability(transport);
	if (!current.available) throw new Error(current.message);
	return parseCopilotAnswer(result, question.revision);
}
