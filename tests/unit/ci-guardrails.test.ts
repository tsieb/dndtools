// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const repoRoot = process.cwd();

interface WorkflowStep {
	id?: string;
	name?: string;
	if?: string;
	uses?: string;
	run?: string;
	env?: Record<string, string>;
	with?: Record<string, unknown>;
}

interface WorkflowJob {
	needs?: string | string[];
	if?: string;
	outputs?: Record<string, string>;
	environment?: string | { name?: string };
	steps?: WorkflowStep[];
}

interface WorkflowFile {
	env?: Record<string, string>;
	jobs?: Record<string, WorkflowJob>;
}

describe('CI guardrails', () => {
	it('keeps the PLAT-010 tiered quality-gate enforcement wired through scripts and CI', () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
		) as { scripts?: Record<string, string> };
		const ciWorkflow = fs.readFileSync(
			path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
			'utf-8',
		);

		// The gate enforcement script exists, is invoked by the gates script, runs inside the
		// full check gate, and runs in CI. Removing any of these would let an unowned or
		// over-budget gate slip through, so the guardrail fails closed against silent removal.
		expect(packageJson.scripts?.['gates']).toBe('tsx scripts/quality-gates.ts');
		expect(packageJson.scripts?.['check']).toContain('pnpm gates');
		expect(ciWorkflow).toContain('run: pnpm gates');
		expect(fs.existsSync(path.join(repoRoot, 'scripts', 'quality-gates.ts'))).toBe(true);
	});

	it('resolves every relative import used by the quality-gate entrypoint', () => {
		const entrypoint = path.join(repoRoot, 'scripts', 'quality-gates.ts');
		const source = fs.readFileSync(entrypoint, 'utf-8');
		const relativeImports = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(
			(match) => match[1],
		);

		expect(relativeImports.length).toBeGreaterThan(0);
		for (const specifier of relativeImports) {
			const resolved = path.resolve(path.dirname(entrypoint), specifier);
			expect(
				fs.existsSync(resolved),
				`quality-gate import does not resolve: ${specifier} (${resolved})`,
			).toBe(true);
		}
	});

	it('deploys dependent stacks in order and rebuilds every core-consuming cloud API', () => {
		const workflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy.yml');
		const workflowText = fs.readFileSync(workflowPath, 'utf-8');
		const workflow = YAML.parse(workflowText) as {
			jobs?: {
				changes?: { steps?: Array<{ id?: string; with?: { filters?: string } }> };
				infra?: { steps?: Array<{ name?: string }> };
			};
		};
		const steps = workflow.jobs?.infra?.steps ?? [];
		const turnIndex = steps.findIndex((step) => step.name === 'Deploy turn');
		const appApiIndex = steps.findIndex((step) => step.name === 'Deploy app-api');
		const signalingIndex = steps.findIndex((step) => step.name === 'Deploy signaling');
		const syncIndex = steps.findIndex((step) => step.name === 'Deploy sync-api');
		const appRefreshIndex = steps.findIndex(
			(step) => step.name === 'Refresh app-api sync purge verifier',
		);
		const filters = workflow.jobs?.changes?.steps?.find((step) => step.id === 'filter')?.with
			?.filters;
		const parsedFilters = YAML.parse(filters ?? '') as Record<string, string[]>;

		expect(turnIndex).toBeGreaterThanOrEqual(0);
		expect(signalingIndex).toBeGreaterThan(turnIndex);
		expect(appApiIndex).toBeGreaterThanOrEqual(0);
		expect(syncIndex).toBeGreaterThan(appApiIndex);
		expect(appRefreshIndex).toBeGreaterThan(syncIndex);
		expect(parsedFilters.signaling).toEqual(
			expect.arrayContaining([
				'infra/signaling/**',
				'infra/identity/**',
				'infra/turn/**',
				'packages/core/**',
			]),
		);
		expect(parsedFilters.sync_api).toEqual(
			expect.arrayContaining(['infra/identity/**', 'packages/core/**']),
		);
		expect(parsedFilters.app_api).toEqual(
			expect.arrayContaining(['infra/identity/**', 'packages/core/**']),
		);
		expect(parsedFilters.web_hosting).toEqual(
			expect.arrayContaining([
				'infra/web-hosting/**',
				'infra/signaling/**',
				'infra/sync-api/**',
				'infra/app-api/**',
			]),
		);
	});

	it('keeps archived applications out of active workspace and release automation', () => {
		const workspace = fs.readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf-8');
		const packageJson = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8');
		const workflows = fs
			.readdirSync(path.join(repoRoot, '.github', 'workflows'))
			.filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
			.map((name) => fs.readFileSync(path.join(repoRoot, '.github', 'workflows', name), 'utf-8'))
			.join('\n');

		expect(workspace).not.toContain('archive/');
		expect(packageJson).not.toContain('archive/');
		expect(workflows).not.toContain('archive/');
	});

	it('keeps the root unit-suite contract complete and accurately documented', () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
		) as { scripts?: Record<string, string> };
		const testingDoc = fs.readFileSync(
			path.join(repoRoot, 'docs', 'development', 'TESTING.md'),
			'utf-8',
		);

		expect(packageJson.scripts?.test).toBe(
			'pnpm test:critical && pnpm test:cloud && pnpm test:app && pnpm test:tooling',
		);
		for (const script of ['test:critical', 'test:cloud', 'test:app', 'test:tooling']) {
			expect(testingDoc).toContain(`\`${script}\``);
		}
	});

	it('keeps the aggregate React verifier behind the managed Vite server', () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
		) as { scripts?: Record<string, string> };
		const verify = packageJson.scripts?.verify ?? '';

		expect(verify).toContain('scripts/validate/index.ts');
		expect(verify).toContain('--only=verify:routes,verify:roundtrip,verify:canvas,verify:ui');
		for (const script of ['verify:routes', 'verify:roundtrip', 'verify:canvas', 'verify:ui']) {
			expect(packageJson.scripts?.[script]).toMatch(/^node apps\/gm-react\/scripts\//);
		}
	});

	it('lets validation-owned Playwright checks reuse the managed server in CI', () => {
		const config = fs.readFileSync(
			path.join(repoRoot, 'apps', 'gm-react', 'playwright.config.ts'),
			'utf-8',
		);
		const registry = fs.readFileSync(
			path.join(repoRoot, 'scripts', 'validate', 'registry.ts'),
			'utf-8',
		);
		const signal = 'DNDTOOLS_PLAYWRIGHT_REUSE_MANAGED_SERVER';

		expect(config).toContain(`process.env.${signal} === '1'`);
		expect(config).toContain('reuseExistingServer: reuseValidationServer || !process.env.CI');
		expect(registry.match(new RegExp(`${signal}=1`, 'g'))).toHaveLength(2);
	});

	it('keeps release-risk workflows gated and diagnostic', () => {
		const ci = YAML.parse(
			fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf-8'),
		) as { jobs?: Record<string, unknown> };
		const release = YAML.parse(
			fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'release.yml'), 'utf-8'),
		) as WorkflowFile;
		const promotion = YAML.parse(
			fs.readFileSync(
				path.join(repoRoot, '.github', 'workflows', 'promote-production.yml'),
				'utf-8',
			),
		) as WorkflowFile;

		expect(Object.keys(ci.jobs ?? {})).toEqual(
			expect.arrayContaining(['build-and-test', 'browser-e2e', 'accessibility', 'desktop-smoke']),
		);
		const configJob = release.jobs?.['production-cloud-config'];
		const packageJob = release.jobs?.package;
		const draftJob = release.jobs?.['draft-release'];
		expect(release.env?.RELEASE_CHANNEL).toContain("|| 'preview'");
		expect(configJob?.needs).toBe('verify');
		expect(configJob?.if).toBe(
			"github.event_name == 'workflow_dispatch' && inputs.channel == 'production'",
		);
		expect(configJob?.environment).toBe('production');
		expect(packageJob?.needs).toEqual(['verify', 'production-cloud-config']);
		expect(packageJob?.if).toContain("needs.verify.result == 'success'");
		expect(packageJob?.if).toContain(
			"github.event_name == 'workflow_dispatch' && inputs.channel == 'production'",
		);
		expect(packageJob?.if).toContain(
			"github.event_name != 'workflow_dispatch' || inputs.channel != 'production'",
		);
		expect(packageJob?.if).toContain("needs.production-cloud-config.result == 'success'");
		expect(packageJob?.if).toContain("needs.production-cloud-config.result == 'skipped'");
		expect(release.jobs?.package?.environment).toBe('desktop-release');
		expect(draftJob?.needs).toEqual(['verify', 'package']);
		expect(draftJob?.if).toBe(
			"always() && needs.verify.result == 'success' && needs.package.result == 'success'",
		);
		expect(promotion.jobs?.promote?.environment).toMatchObject({ name: 'production' });
		expect(promotion.jobs?.preflight?.outputs?.release_sha).toBe(
			'${{ steps.release_ref.outputs.sha }}',
		);

		const configArtifact = configJob?.steps?.find(
			(step) => step.name === 'Stage trusted build coordinates',
		);
		expect(configArtifact?.with).toMatchObject({
			name: 'production-cloud-config',
			path: 'apps/gm-react/.env.local',
			'include-hidden-files': true,
			'if-no-files-found': 'error',
		});
		const releaseRef = release.jobs?.verify?.steps?.find((step) => step.id === 'release_ref');
		expect(releaseRef?.run).toContain('git show-ref --verify --quiet');
		expect(releaseRef?.run).toContain('git merge-base --is-ancestor');
		expect(release.jobs?.verify?.outputs?.release_sha).toBe('${{ steps.release_ref.outputs.sha }}');
		for (const jobName of ['production-cloud-config', 'package', 'draft-release']) {
			const checkout = release.jobs?.[jobName]?.steps?.find((step) =>
				step.uses?.startsWith('actions/checkout@'),
			);
			expect(checkout?.with?.ref, `${jobName} must checkout the verified release commit`).toBe(
				'${{ needs.verify.outputs.release_sha }}',
			);
		}
		const promotionCheckout = promotion.jobs?.promote?.steps?.find((step) =>
			step.uses?.startsWith('actions/checkout@'),
		);
		expect(promotionCheckout?.with?.ref).toBe('${{ needs.preflight.outputs.release_sha }}');

		const previewBuild = packageJob?.steps?.find((step) => step.name === 'Build preview renderer');
		const previewPackage = packageJob?.steps?.find(
			(step) => step.name === 'Package unsigned preview installers',
		);
		expect(previewBuild?.if).toBe("env.RELEASE_CHANNEL != 'production'");
		expect(previewPackage?.if).toBe("env.RELEASE_CHANNEL != 'production'");
		expect(JSON.stringify([previewBuild, previewPackage])).not.toContain('secrets.');
		for (const step of packageJob?.steps ?? []) {
			if (JSON.stringify(step).includes('secrets.')) {
				expect(
					step.if,
					`${step.name ?? 'unnamed step'} exposes a secret outside production`,
				).toContain("env.RELEASE_CHANNEL == 'production'");
			}
		}

		const promotionSteps = promotion.jobs?.promote?.steps ?? [];
		const syncDeployIndex = promotionSteps.findIndex((step) => step.name === 'Deploy sync API');
		const purgeVerifierIndex = promotionSteps.findIndex(
			(step) => step.name === 'Refresh app API sync purge verifier',
		);
		expect(syncDeployIndex).toBeGreaterThanOrEqual(0);
		expect(purgeVerifierIndex).toBe(syncDeployIndex + 1);
		const pullIndex = promotionSteps.findIndex(
			(step) => step.name === 'Pull production cloud coordinates',
		);
		const validationIndex = promotionSteps.findIndex(
			(step) => step.name === 'Validate production cloud coordinates',
		);
		expect(pullIndex).toBeGreaterThanOrEqual(0);
		expect(validationIndex).toBe(pullIndex + 1);
		expect(promotionSteps[validationIndex]?.run).toContain(
			'node --env-file=apps/gm-react/.env.local',
		);
		expect(promotionSteps[validationIndex]?.run).toContain('--required');

		const releaseProtection = release.jobs?.['draft-release']?.steps?.find(
			(step) => step.name === 'Protect published and signed releases from preview replacement',
		);
		expect(releaseProtection?.run).toContain('refusing to mutate an already-published release');
		const provenance = release.jobs?.['draft-release']?.steps?.find(
			(step) => step.name === 'Sign build provenance for installers, checksums, and SBOM',
		);
		expect(provenance?.uses).toMatch(/^actions\/attest-build-provenance@[0-9a-f]{40}$/);
	});

	it('pins third-party actions to immutable commits and keeps foundation bootstrap-only', () => {
		const workflowsRoot = path.join(repoRoot, '.github', 'workflows');
		const workflowFiles = fs
			.readdirSync(workflowsRoot)
			.filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
		for (const name of workflowFiles) {
			const source = fs.readFileSync(path.join(workflowsRoot, name), 'utf-8');
			const document = YAML.parseDocument(source, { strict: true, uniqueKeys: true });
			expect(
				document.errors.map((error) => error.message),
				`${name} is not valid YAML`,
			).toEqual([]);
			for (const match of source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)\s*(?:#.*)?$/gm)) {
				expect(match[1], `${name} has a mutable action reference`).toMatch(
					/^[^@\s]+@[0-9a-f]{40}$/,
				);
			}
			const workflow = YAML.parse(source) as WorkflowFile;
			for (const job of Object.values(workflow.jobs ?? {})) {
				for (const step of job.steps ?? []) {
					if (!step.uses?.startsWith('actions/checkout@')) continue;
					expect(step.with?.['persist-credentials'], `${name} checkout token persistence`).toBe(
						false,
					);
				}
			}
		}

		const devDeploy = fs.readFileSync(path.join(workflowsRoot, 'deploy.yml'), 'utf-8');
		const production = fs.readFileSync(path.join(workflowsRoot, 'promote-production.yml'), 'utf-8');
		expect(devDeploy).not.toContain('run: infra/deploy.sh foundation');
		expect(production).not.toContain('run: infra/deploy.sh foundation');

		const supplyChain = fs.readFileSync(path.join(workflowsRoot, 'supply-chain.yml'), 'utf-8');
		expect(supplyChain).toContain('actionlint -color');
		expect(supplyChain).toContain('zizmor --pedantic .');
		expect(supplyChain).toContain('sha256sum --check');
	});

	it('uses the package-manager pin consistently in every workflow', () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
		) as { packageManager?: string };
		const expectedVersion = packageJson.packageManager?.match(/^pnpm@(.+)$/)?.[1];
		expect(expectedVersion).toBeTruthy();

		const workflowsRoot = path.join(repoRoot, '.github', 'workflows');
		let setupSteps = 0;
		for (const name of fs.readdirSync(workflowsRoot).filter((file) => file.endsWith('.yml'))) {
			const workflow = YAML.parse(
				fs.readFileSync(path.join(workflowsRoot, name), 'utf-8'),
			) as WorkflowFile;
			for (const job of Object.values(workflow.jobs ?? {})) {
				for (const step of job.steps ?? []) {
					if (!step.uses?.startsWith('pnpm/action-setup@')) continue;
					setupSteps += 1;
					expect(String(step.with?.version), `${name} pnpm setup version`).toBe(expectedVersion);
				}
			}
		}
		expect(setupSteps).toBeGreaterThan(0);
	});

	it('parses every CloudFormation template without duplicate mapping keys', () => {
		const infraRoot = path.join(repoRoot, 'infra');
		const templates = fs
			.readdirSync(infraRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(infraRoot, entry.name, 'template.yaml'))
			.filter((template) => fs.existsSync(template));

		expect(templates.length).toBeGreaterThan(0);
		for (const template of templates) {
			const document = YAML.parseDocument(fs.readFileSync(template, 'utf-8'), {
				strict: true,
				uniqueKeys: true,
			});
			expect(
				document.errors.map((error) => error.message),
				`${path.relative(repoRoot, template)} is not valid YAML`,
			).toEqual([]);
		}
	});

	it('keeps the always-on TURN relay bounded and application-health monitored', () => {
		const turn = fs.readFileSync(path.join(repoRoot, 'infra', 'turn', 'template.yaml'), 'utf-8');

		expect(turn).toContain('Encrypted: true');
		expect(turn).toContain('--log-opt max-size=10m --log-opt max-file=5');
		expect(turn).toContain('cloudwatch:PutMetricData');
		expect(turn).toContain('dndtools-turn-health.timer');
		expect(turn).toContain('TurnApplicationHealthAlarm:');
		expect(turn).toContain('TreatMissingData: breaching');
	});
});
