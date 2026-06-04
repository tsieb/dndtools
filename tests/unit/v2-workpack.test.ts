// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import {
	buildEpicPackets,
	findNextEpic,
	generateWorkpack,
	parseRequirementPackage,
	renderPrompt,
	updateEpicStatus,
	validateWorkpack,
	type EpicPacket,
} from '../../scripts/v2-workpack';

function makeFixtureRoot(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dndtools-v2-workpack-'));
	const requirementsDir = path.join(root, 'docs', 'remake-review', 'requirements');
	fs.mkdirSync(requirementsDir, { recursive: true });
	fs.writeFileSync(
		path.join(requirementsDir, '01-canvas-scene-widgets.md'),
		`## CANVAS - Scene Management and Widget System

Capability tree:

- Scene state: \`CANVAS-001\`, \`CANVAS-002\`

### CANVAS-001
**Statement:** The DM shall be able to create a named Scene.
**Source:** Vision "The Canvas"; Architecture Contract 1.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a local vault, when the DM creates a Scene, then it is saved.
- Given invalid input, when creation runs, then no partial Scene is saved.

### CANVAS-002
**Statement:** The DM shall be able to add a widget to a Scene.
**Source:** Architecture Contract 4.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given an editable Scene, when the DM adds a widget, then the widget appears.
`,
		'utf-8',
	);
	return root;
}

function writeCompletionEvidence(root: string, epicId: string): string {
	const relativePath = `docs/planning/v2/epics/${epicId}.completion.md`;
	const fullPath = path.join(root, relativePath);
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });
	fs.writeFileSync(
		fullPath,
		`# ${epicId} Completion Evidence

Workpack status: \`complete\`.

## Git Slate

\`\`\`
git status --short
# no output
\`\`\`
`,
		'utf-8',
	);
	return relativePath;
}

describe('v2 workpack tooling', () => {
	it('parses requirement records and capability branches from domain markdown', async () => {
		const root = makeFixtureRoot();
		const pack = await parseRequirementPackage(root);

		expect(pack.requirements.map((requirement) => requirement.id)).toEqual([
			'CANVAS-001',
			'CANVAS-002',
		]);
		expect(pack.requirements[0]?.capabilityBranches).toEqual(['Scene state']);
		expect(pack.branches).toEqual([
			{
				domain: 'CANVAS',
				name: 'Scene state',
				requirementIds: ['CANVAS-001', 'CANVAS-002'],
			},
		]);
	});

	it('generates valid epic packets from parsed requirements', async () => {
		const root = makeFixtureRoot();
		const pack = await parseRequirementPackage(root);
		const epics = buildEpicPackets(pack);

		expect(epics).toHaveLength(1);
		expect(epics[0]?.id).toBe('CANVAS-scene-state');
		expect(epics[0]?.stories).toHaveLength(2);
		expect(epics[0]?.approved).toBe(false);
	});

	it('validates generated workpack structure', async () => {
		const root = makeFixtureRoot();
		await generateWorkpack(root);

		await expect(validateWorkpack(root)).resolves.toEqual([]);
	});

	it('creates mutable workpack state as the status source of truth', async () => {
		const root = makeFixtureRoot();
		await generateWorkpack(root);

		const statePath = path.join(root, 'docs', 'planning', 'v2', 'workpack-state.yaml');
		const state = YAML.parse(fs.readFileSync(statePath, 'utf-8')) as {
			defaults: { status: string; approved: boolean };
		};

		expect(state.defaults).toEqual({ status: 'proposed', approved: false });
	});

	it('applies mutable workpack state to generated epics and metrics', async () => {
		const root = makeFixtureRoot();
		const evidenceFile = writeCompletionEvidence(root, 'CANVAS-scene-state');
		const statePath = path.join(root, 'docs', 'planning', 'v2', 'workpack-state.yaml');
		fs.mkdirSync(path.dirname(statePath), { recursive: true });
		fs.writeFileSync(
			statePath,
			YAML.stringify({
				schemaVersion: 1,
				sourceOfTruth: {
					purpose: 'Fixture state',
					generatedFiles: ['docs/planning/v2/status.yaml'],
				},
				defaults: { status: 'approved', approved: true },
				stackDecision: {
					requiredAdr: 'docs/adr/014-v2-stack-and-subproject-boundary.md',
					status: 'accepted',
					blocksImplementation: false,
				},
				epics: [
					{
						id: 'CANVAS-scene-state',
						status: 'complete',
						approved: true,
						completionEvidenceFile: evidenceFile,
					},
				],
			}),
			'utf-8',
		);

		const { epics } = await generateWorkpack(root);
		const status = YAML.parse(
			fs.readFileSync(path.join(root, 'docs', 'planning', 'v2', 'status.yaml'), 'utf-8'),
		) as { summary: { complete: number }; metrics: { epicCompletionPercent: number } };

		expect(epics[0]?.status).toBe('complete');
		expect(epics[0]?.completionEvidenceFile).toBe(evidenceFile);
		expect(status.summary.complete).toBe(1);
		expect(status.metrics.epicCompletionPercent).toBe(100);
		await expect(validateWorkpack(root)).resolves.toEqual([]);
	});

	it('updates status programmatically and regenerates derived files', async () => {
		const root = makeFixtureRoot();
		await generateWorkpack(root);
		const evidenceFile = writeCompletionEvidence(root, 'CANVAS-scene-state');

		const { epic } = await updateEpicStatus(root, 'CANVAS-scene-state', 'complete', {
			evidenceFile,
		});

		const regenerated = YAML.parse(
			fs.readFileSync(
				path.join(root, 'docs', 'planning', 'v2', 'epics', 'CANVAS-scene-state.yaml'),
				'utf-8',
			),
		) as EpicPacket;

		expect(epic.status).toBe('complete');
		expect(regenerated.status).toBe('complete');
		expect(regenerated.completionEvidenceFile).toBe(evidenceFile);
		await expect(validateWorkpack(root)).resolves.toEqual([]);
	});

	it('selects the next approved epic deterministically', async () => {
		const root = makeFixtureRoot();
		const evidenceFile = writeCompletionEvidence(root, 'CANVAS-scene-state');
		const { epics } = await generateWorkpack(root);
		const approved = {
			...(epics[0] as EpicPacket),
			status: 'approved',
			approved: true,
		} satisfies EpicPacket;
		const complete = {
			...approved,
			status: 'complete',
			completionEvidenceFile: evidenceFile,
		} satisfies EpicPacket;

		expect(findNextEpic([approved])?.id).toBe('CANVAS-scene-state');
		expect(findNextEpic([complete])).toBeNull();
	});

	it('rejects prompt generation for unapproved epics', async () => {
		const root = makeFixtureRoot();
		const { epics } = await generateWorkpack(root);
		const epic = epics[0] as EpicPacket;

		expect(() => renderPrompt(epic, 'Epic {{EPIC_ID}}')).toThrow(
			'Epic CANVAS-scene-state is not approved',
		);
	});

	it('renders approved epic prompts deterministically', async () => {
		const root = makeFixtureRoot();
		const { epics } = await generateWorkpack(root);
		const approvedEpic = {
			...(epics[0] as EpicPacket),
			status: 'approved',
			approved: true,
		} satisfies EpicPacket;

		const prompt = renderPrompt(approvedEpic, 'Epic {{EPIC_ID}}: {{REQUIREMENT_IDS}}');

		expect(prompt).toBe('Epic CANVAS-scene-state: CANVAS-001, CANVAS-002');

		const parsedYaml = YAML.parse(YAML.stringify(approvedEpic)) as EpicPacket;
		expect(parsedYaml.id).toBe(approvedEpic.id);
	});

	it('orders dependency-ready epics by precedence: explicit epics, then domains', async () => {
		const root = makeFixtureRoot();
		const { epics } = await generateWorkpack(root);
		const base = {
			...(epics[0] as EpicPacket),
			status: 'approved' as const,
			approved: true,
			dependencies: [],
		};
		const make = (id: string, domain: string): EpicPacket => ({ ...base, id, domain });
		const pool = [make('AUDIO-x', 'AUDIO'), make('CANVAS-y', 'CANVAS'), make('CMD-z', 'CMD')];

		// No precedence falls back to a stable alphabetical pick.
		expect(findNextEpic(pool)?.id).toBe('AUDIO-x');
		// Domain order takes precedence over alphabetical.
		expect(findNextEpic(pool, { domains: ['CANVAS', 'CMD', 'AUDIO'], epics: [] })?.id).toBe(
			'CANVAS-y',
		);
		// An explicit epic jumps the queue ahead of domain order.
		expect(
			findNextEpic(pool, { domains: ['CANVAS', 'CMD', 'AUDIO'], epics: ['AUDIO-x'] })?.id,
		).toBe('AUDIO-x');
	});

	it('flags precedence that references unknown domains or epics', async () => {
		const root = makeFixtureRoot();
		await generateWorkpack(root);
		const statePath = path.join(root, 'docs', 'planning', 'v2', 'workpack-state.yaml');
		const state = YAML.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
		state.precedence = {
			domains: ['CANVAS', 'BOGUS'],
			epics: ['CANVAS-scene-state', 'NOPE-epic'],
		};
		fs.writeFileSync(statePath, YAML.stringify(state), 'utf-8');

		const messages = (await validateWorkpack(root)).map((issue) => issue.message);
		expect(messages).toContain('Precedence references unknown domain: BOGUS');
		expect(messages).toContain('Precedence references unknown epic id: NOPE-epic');
	});
});
