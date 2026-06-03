// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import {
	buildEpicPackets,
	generateWorkpack,
	parseRequirementPackage,
	renderPrompt,
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
});
