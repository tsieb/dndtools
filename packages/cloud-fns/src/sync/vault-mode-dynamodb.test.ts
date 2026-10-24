import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	GetItemCommand,
	TransactWriteItemsCommand,
	TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';

vi.hoisted(() => {
	process.env.SYNC_OPS_TABLE = 'ops';
	process.env.AWS_REGION = 'ca-central-1';
});

// Exercise the real AWS helper, intercepting only the SDK transport. The route/store fakes
// cannot prove that the active usage condition and the consent put share a DynamoDB transaction.
const { ddb, toItem } = await import('../lib/aws.ts');
const { recordVaultModeConsent, VaultModeConflict } = await import('./vault-mode.ts');
const body = JSON.stringify({ mode: 'cloud-enhanced', consentVersion: 'ADR-042-phase-1' });

afterEach(() => vi.restoreAllMocks());

describe('consent DynamoDB atomicity contract', () => {
	it.each(['alice-sub', 'bob-sub'])(
		'fences %s consent and generation in one transaction without changing quota',
		async (sub) => {
			const pk = `${sub}#primary`;
			let transaction: TransactWriteItemsCommand | undefined;
			vi.spyOn(ddb, 'send').mockImplementation(async (command: unknown) => {
				if (command instanceof GetItemCommand) {
					expect(command.input.ConsistentRead).toBe(true);
					expect(command.input.Key?.vaultId).toEqual({ S: pk });
					return {
						Item:
							command.input.Key?.sk.S === 'usage#quota'
								? toItem({
										vaultId: pk,
										sk: 'usage#quota',
										state: 'active',
										storedBytes: 100,
										operationCount: 2,
									})
								: toItem({
										vaultId: pk,
										sk: 'mode#registration',
										ownerSub: sub,
										mode: 'private-e2ee',
										generation: 3,
										schemaVersion: 1,
										consentedAt: '2026-10-24T00:00:00.000Z',
									}),
					};
				}
				if (command instanceof TransactWriteItemsCommand) {
					transaction = command;
					return {};
				}
				throw new Error('Consent must not use a standalone write');
			});
			await expect(
				recordVaultModeConsent({ sub, vaultId: 'primary' }, body),
			).resolves.toMatchObject({ generation: 4 });
			const actions = transaction!.input.TransactItems!;
			expect(actions).toHaveLength(2);
			const fence = actions[0]!.Update!;
			expect(fence.TableName).toBe('ops');
			expect(fence.Key).toEqual(toItem({ vaultId: pk, sk: 'usage#quota' }));
			expect(fence.ConditionExpression).toContain('#state = :active');
			expect(fence.ExpressionAttributeNames?.['#state']).toBe('state');
			expect(fence.ExpressionAttributeValues).toMatchObject(
				toItem({ ':active': 'active', ':byteDelta': 0, ':operationDelta': 0 }),
			);
			expect(fence.ConditionExpression).not.toMatch(/Limit/);
			const consent = actions[1]!.Put!;
			expect(consent.TableName).toBe('ops');
			expect(consent.Item).toMatchObject(
				toItem({ vaultId: pk, sk: 'mode#registration', ownerSub: sub, generation: 4 }),
			);
			expect(consent.ConditionExpression).toBe('#generation = :generation AND #owner = :owner');
			expect(consent.ExpressionAttributeValues).toEqual(
				toItem({ ':generation': 3, ':owner': sub }),
			);
		},
	);

	it('refuses when deletion wins the active-marker condition, with no cleanup read or write', async () => {
		let canceled = false;
		vi.spyOn(ddb, 'send').mockImplementation(async (command: unknown) => {
			if (canceled) throw new Error('No post-transaction IO is available');
			if (command instanceof GetItemCommand) {
				return {
					Item:
						command.input.Key?.sk.S === 'usage#quota'
							? toItem({ state: 'active', storedBytes: 0, operationCount: 0 })
							: undefined,
				};
			}
			if (command instanceof TransactWriteItemsCommand) {
				canceled = true;
				throw new TransactionCanceledException({
					$metadata: {},
					message: 'Deletion won',
					CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
				});
			}
			throw new Error('Unexpected SDK call');
		});
		await expect(
			recordVaultModeConsent({ sub: 'alice-sub', vaultId: 'primary' }, body),
		).rejects.toBeInstanceOf(VaultModeConflict);
		expect(canceled).toBe(true);
	});
});
