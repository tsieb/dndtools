// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import {
	buildUxEpicPackets,
	findNextUxEpic,
	generateUxWorkpack,
	parseUxRequirementPackage,
	renderUxPrompt,
	updateUxEpicStatus,
	validateUxWorkpack,
	type UxEpicDefinition,
	type UxEpicPacket,
} from '../../scripts/ux-workpack';

function makeFixtureRoot(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dndtools-v2-ux-workpack-'));
	const uxDir = path.join(root, 'docs', 'remake-review', 'ux-requirements');
	fs.mkdirSync(uxDir, { recursive: true });
	fs.writeFileSync(
		path.join(uxDir, '01-visual-design-system.md'),
		`# UX Requirements - Visual Design System

## 5. UX/UI requirements

### UX-VIS-001 — Theme foundation

- **Requirement:** The app shall expose a complete theme foundation.
- **Acceptance criteria:**
  - Given a user opens the app, when the theme loads, then semantic tokens resolve.
  - Given a user changes the theme, when the setting commits, then the theme updates.
- **Priority:** Must-have

---

### UX-A11Y-001 — Motion foundation

- **Requirement:** The app shall expose a reduced-motion-safe motion foundation.
- **Acceptance criteria:**
  - Given reduced motion is enabled, when a transition runs, then no spatial motion plays.
- **Priority:** Could-have
`,
		'utf-8',
	);
	return root;
}

const fixtureDefinitions: UxEpicDefinition[] = [
	{
		id: 'UX-FIX-foundations',
		title: 'Fixture Foundations',
		phase: '00 Fixture',
		productPriority: 'P0',
		domain: 'UX-FIX',
		objective: 'Deliver the fixture UX foundations.',
		requirementIds: ['UX-VIS-001'],
		dependencies: [],
		expectedAffectedAreas: ['apps/gm/src/routes/styles.css'],
	},
	{
		id: 'UX-FIX-motion',
		title: 'Fixture Motion',
		phase: '01 Fixture',
		productPriority: 'P1',
		domain: 'UX-FIX',
		objective: 'Deliver the fixture motion UX.',
		requirementIds: ['UX-A11Y-001'],
		dependencies: ['UX-FIX-foundations'],
		expectedAffectedAreas: ['apps/gm/src/routes/styles.css'],
	},
];

function writeCompletionEvidence(root: string, epicId: string): string {
	const relativePath = `docs/planning/v2/ux/epics/${epicId}.completion.md`;
	const fullPath = path.join(root, relativePath);
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });
	fs.writeFileSync(
		fullPath,
		`# ${epicId} Completion Evidence

UX workpack status: \`complete\`.

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

describe('v2 UX workpack tooling', () => {
	it('parses UX requirement records from surface markdown', async () => {
		const root = makeFixtureRoot();
		const pack = await parseUxRequirementPackage(root);

		expect(pack.requirements.map((requirement) => requirement.id)).toEqual([
			'UX-VIS-001',
			'UX-A11Y-001',
		]);
		expect(pack.requirements[0]).toMatchObject({
			domain: 'UX-VIS',
			title: 'Theme foundation',
			priority: 'Must-have',
		});
		expect(pack.requirements[1]?.priority).toBe('Could-have');
		expect(pack.requirements[0]?.acceptanceCriteria).toHaveLength(2);
	});

	it('generates valid UX epic packets from explicit definitions', async () => {
		const root = makeFixtureRoot();
		const pack = await parseUxRequirementPackage(root);
		const epics = buildUxEpicPackets(pack, fixtureDefinitions);

		expect(epics).toHaveLength(2);
		expect(epics[0]?.id).toBe('UX-FIX-foundations');
		expect(epics[0]?.stories[0]?.requirementIds).toEqual(['UX-VIS-001']);
		expect(epics[1]?.dependencies).toEqual(['UX-FIX-foundations']);
	});

	it('generates and validates the UX workpack namespace', async () => {
		const root = makeFixtureRoot();
		await generateUxWorkpack(root, fixtureDefinitions);

		await expect(validateUxWorkpack(root, fixtureDefinitions)).resolves.toEqual([]);
		expect(fs.existsSync(path.join(root, 'docs', 'planning', 'v2', 'ux', 'status.yaml'))).toBe(
			true,
		);
		expect(
			fs.existsSync(
				path.join(root, 'docs', 'planning', 'v2', 'ux', 'epics', 'UX-FIX-foundations.yaml'),
			),
		).toBe(true);
	});

	it('selects the next UX epic using dependencies and precedence', async () => {
		const root = makeFixtureRoot();
		const { epics } = await generateUxWorkpack(root, fixtureDefinitions);

		expect(findNextUxEpic(epics)?.id).toBe('UX-FIX-foundations');

		const evidenceFile = writeCompletionEvidence(root, 'UX-FIX-foundations');
		const { epics: updated } = await updateUxEpicStatus(
			root,
			'UX-FIX-foundations',
			'complete',
			{ evidenceFile },
			fixtureDefinitions,
		);

		expect(findNextUxEpic(updated)?.id).toBe('UX-FIX-motion');
		await expect(validateUxWorkpack(root, fixtureDefinitions)).resolves.toEqual([]);
	});

	it('writes status metrics for generated UX epics', async () => {
		const root = makeFixtureRoot();
		await generateUxWorkpack(root, fixtureDefinitions);
		const status = YAML.parse(
			fs.readFileSync(path.join(root, 'docs', 'planning', 'v2', 'ux', 'status.yaml'), 'utf-8'),
		) as {
			summary: { totalEpics: number; approved: number };
			metrics: { totalRequirements: number; promptableEpics: number };
			nextEpic: { id: string };
		};

		expect(status.summary).toMatchObject({ totalEpics: 2, approved: 2 });
		expect(status.metrics).toMatchObject({ totalRequirements: 2, promptableEpics: 1 });
		expect(status.nextEpic.id).toBe('UX-FIX-foundations');
	});

	it('renders approved UX epic prompts deterministically', async () => {
		const root = makeFixtureRoot();
		const { epics } = await generateUxWorkpack(root, fixtureDefinitions);
		const prompt = renderUxPrompt(
			epics[0] as UxEpicPacket,
			'Epic {{EPIC_ID}} in {{PHASE}}: {{REQUIREMENT_IDS}}\n{{SOURCE_DOCS}}',
		);

		expect(prompt).toContain('Epic UX-FIX-foundations in 00 Fixture: UX-VIS-001');
		expect(prompt).toContain('docs/remake-review/ux-requirements/01-visual-design-system.md');
	});

	it('rejects prompt generation for unapproved UX epics', async () => {
		const root = makeFixtureRoot();
		const { epics } = await generateUxWorkpack(root, fixtureDefinitions);
		const unapproved = {
			...(epics[0] as UxEpicPacket),
			status: 'proposed' as const,
			approved: false,
		};

		expect(() => renderUxPrompt(unapproved, 'Epic {{EPIC_ID}}')).toThrow(
			'UX epic UX-FIX-foundations is not approved',
		);
	});

	it('allows source-doc-only UX epics when custom stories are provided', async () => {
		const root = makeFixtureRoot();
		const definitions: UxEpicDefinition[] = [
			...fixtureDefinitions,
			{
				id: 'UX-FIX-source-doc-only',
				title: 'Fixture Source Doc Only',
				phase: '02 Fixture',
				productPriority: 'P2',
				domain: 'UX-FIX',
				objective: 'Deliver a route shell from a source architecture doc.',
				requirementIds: [],
				dependencies: ['UX-FIX-motion'],
				expectedAffectedAreas: ['apps/gm/src/routes/fixture'],
				customStories: [
					{
						id: 'UX-FIX-source-doc-only-S01',
						title: 'Route shell from source doc',
						acceptanceCriteria: [
							'Given the source-only route opens, when it renders, then it has one h1.',
						],
					},
				],
			},
		];
		const pack = await parseUxRequirementPackage(root);
		const epics = buildUxEpicPackets(pack, definitions);
		const sourceOnly = epics.find(
			(epic): epic is UxEpicPacket => epic.id === 'UX-FIX-source-doc-only',
		);

		expect(sourceOnly?.requirementIds).toEqual([]);
		expect(sourceOnly?.stories[0]?.acceptanceCriteria).toHaveLength(1);
	});
});
