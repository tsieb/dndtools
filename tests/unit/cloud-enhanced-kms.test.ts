import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

interface KeyStatement {
	Effect: string;
	Principal: unknown;
	NotPrincipal?: unknown;
	Action: string | string[];
	Resource: unknown;
}

interface Resource {
	Type: string;
	Condition?: unknown;
	DeletionPolicy?: string;
	UpdateReplacePolicy?: string;
	Properties: Record<string, unknown>;
}

interface Template {
	Parameters: { Stage: { AllowedValues: string[] } };
	Resources: Record<string, Resource>;
}

function readTemplate(stack: string): Template {
	return YAML.parse(fs.readFileSync(`infra/${stack}/template.yaml`, 'utf-8'), {
		logLevel: 'silent',
		customTags: ['Ref', 'Sub', 'GetAtt'].map((name) => ({
			tag: `!${name}`,
			resolve: (value: string) => ({ [name]: value }),
		})),
	}) as Template;
}

const sync = readTemplate('sync-api');
const key = sync.Resources.CloudEnhancedContentKey!;
const { Statement: statements } = key.Properties.KeyPolicy as { Statement: KeyStatement[] };
const syncPrincipal = { AWS: { GetAtt: 'SyncFnRole.Arn' } };
const adminPrincipal = { AWS: { Sub: 'arn:${AWS::Partition}:iam::${AWS::AccountId}:root' } };

describe('RC-CLD-2.2 Cloud-Enhanced KMS policy', () => {
	it('creates a retained, rotating content key in each stage with stage-specific discovery', () => {
		expect(sync.Parameters.Stage.AllowedValues).toEqual(['dev', 'prod']);
		expect(key.Type).toBe('AWS::KMS::Key');
		expect(key.Condition).toBeUndefined();
		expect(key.DeletionPolicy).toBe('Retain');
		expect(key.UpdateReplacePolicy).toBe('Retain');
		expect(key.Properties.EnableKeyRotation).toBe(true);
		expect(sync.Resources.CloudEnhancedContentKeyAlias!.Properties).toEqual({
			AliasName: { Sub: 'alias/${ProjectName}-${Stage}-cloud-enhanced-content' },
			TargetKeyId: { Ref: 'CloudEnhancedContentKey' },
		});
		expect(sync.Resources.ParamCloudEnhancedContentKeyArn!.Properties).toMatchObject({
			Name: { Sub: '/${ProjectName}/${Stage}/sync/cloud-enhanced-content-key-arn' },
			Value: { GetAtt: 'CloudEnhancedContentKey.Arn' },
		});
	});

	it('limits key principals to this account administration and this stack sync role', () => {
		expect(statements.map((statement) => statement.Principal)).toEqual([
			adminPrincipal,
			syncPrincipal,
		]);
		for (const statement of statements) {
			expect(statement.Effect).toBe('Allow');
			expect(statement.NotPrincipal).toBeUndefined();
			// In a KMS key policy, this means only the key carrying the policy.
			expect(statement.Resource).toBe('*');
		}
	});

	it('does not delegate cryptographic use or grant creation through account IAM policies', () => {
		const admin = statements[0]!;
		const actions = Array.isArray(admin.Action) ? admin.Action : [admin.Action];
		// This allowlist rejects kms:*, crypto permissions, CreateGrant, and future wildcard
		// expansions. IAM administrators may still deliberately change the key policy.
		const managementOnly = new Set([
			'kms:CancelKeyDeletion',
			'kms:CreateAlias',
			'kms:DeleteAlias',
			'kms:DescribeKey',
			'kms:DisableKey',
			'kms:DisableKeyRotation',
			'kms:EnableKey',
			'kms:EnableKeyRotation',
			'kms:GetKeyPolicy',
			'kms:GetKeyRotationStatus',
			'kms:ListGrants',
			'kms:ListKeyPolicies',
			'kms:ListKeyRotations',
			'kms:ListResourceTags',
			'kms:PutKeyPolicy',
			'kms:RevokeGrant',
			'kms:RotateKeyOnDemand',
			'kms:ScheduleKeyDeletion',
			'kms:TagResource',
			'kms:UntagResource',
			'kms:UpdateAlias',
			'kms:UpdateKeyDescription',
		]);
		for (const action of actions) expect(managementOnly, action).toContain(action);
		expect(actions).toEqual(
			expect.arrayContaining([
				'kms:PutKeyPolicy',
				'kms:CreateAlias',
				'kms:UpdateAlias',
				'kms:EnableKeyRotation',
			]),
		);
	});

	it('gives the sync role only the data-key operations needed by the planned content store', () => {
		expect(statements[1]!.Action).toEqual([
			'kms:Decrypt',
			'kms:GenerateDataKey',
			'kms:DescribeKey',
		]);
	});

	it('keeps KMS management reads and writes in the configured stage audit trail', () => {
		const trail = readTemplate('foundation').Resources.AuditTrail!;
		expect(trail.Condition).toBeUndefined();
		expect(trail.Properties).toMatchObject({
			IsLogging: true,
			IsMultiRegionTrail: true,
			EnableLogFileValidation: true,
			EventSelectors: [{ IncludeManagementEvents: true, ReadWriteType: 'All' }],
		});
		expect(trail.Properties.EventSelectors).toEqual([
			{ IncludeManagementEvents: true, ReadWriteType: 'All' },
		]);
		expect(trail.Properties.AdvancedEventSelectors).toBeUndefined();
	});
});
