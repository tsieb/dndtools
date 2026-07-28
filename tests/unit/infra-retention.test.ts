// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const repoRoot = process.cwd();

interface TemplateResource {
	Type?: string;
	DeletionPolicy?: string;
	UpdateReplacePolicy?: string;
}

interface CloudFormationTemplate {
	Resources?: Record<string, TemplateResource>;
}

const durableStorage = new Set([
	'app-api/template.yaml:AppTable',
	'app-api/template.yaml:ModulesBucket',
	'foundation/template.yaml:AuditTrailBucket',
	'sync-api/template.yaml:CiphertextBucket',
	'sync-api/template.yaml:SyncOpsTable',
]);

const intentionallyRebuildableStorage = new Set([
	'signaling/template.yaml:AttemptsTable',
	'signaling/template.yaml:ConnectionsTable',
	'signaling/template.yaml:RoomsTable',
	'web-hosting/template.yaml:WebBucket',
]);

describe('infrastructure retention guardrails', () => {
	it('classifies every DynamoDB table and S3 bucket and retains durable customer data', () => {
		const infraRoot = path.join(repoRoot, 'infra');
		const classifiedStorage = new Set([...durableStorage, ...intentionallyRebuildableStorage]);
		const discoveredStorage: string[] = [];

		for (const stack of fs
			.readdirSync(infraRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())) {
			const relativeTemplate = `${stack.name}/template.yaml`;
			const templatePath = path.join(infraRoot, relativeTemplate);
			if (!fs.existsSync(templatePath)) continue;

			const template = YAML.parse(fs.readFileSync(templatePath, 'utf-8'), {
				logLevel: 'silent',
			}) as CloudFormationTemplate;
			for (const [logicalId, resource] of Object.entries(template.Resources ?? {})) {
				if (!['AWS::DynamoDB::Table', 'AWS::S3::Bucket'].includes(resource.Type ?? '')) {
					continue;
				}

				const resourceId = `${relativeTemplate}:${logicalId}`;
				discoveredStorage.push(resourceId);
				expect(
					classifiedStorage,
					`${resourceId} needs an explicit lifecycle classification`,
				).toContain(resourceId);

				if (durableStorage.has(resourceId)) {
					expect(resource.DeletionPolicy, `${resourceId} stack-deletion protection`).toBe('Retain');
					expect(resource.UpdateReplacePolicy, `${resourceId} replacement protection`).toBe(
						'Retain',
					);
				} else {
					// Session presence/rate-limit rows and built web assets are reconstructable.
					// Retaining them would create unmanaged scratch/deployment resources.
					expect(resource.DeletionPolicy, `${resourceId} must remain rebuildable`).toBeUndefined();
					expect(
						resource.UpdateReplacePolicy,
						`${resourceId} must remain rebuildable`,
					).toBeUndefined();
				}
			}
		}

		expect(discoveredStorage.sort()).toEqual([...classifiedStorage].sort());
	});

	it('retains the Cognito user pool in addition to enabling service deletion protection', () => {
		const template = YAML.parse(
			fs.readFileSync(path.join(repoRoot, 'infra', 'identity', 'template.yaml'), 'utf-8'),
			{ logLevel: 'silent' },
		) as CloudFormationTemplate;
		const userPool = template.Resources?.UserPool;

		expect(userPool?.Type).toBe('AWS::Cognito::UserPool');
		expect(userPool?.DeletionPolicy).toBe('Retain');
		expect(userPool?.UpdateReplacePolicy).toBe('Retain');
	});
});
