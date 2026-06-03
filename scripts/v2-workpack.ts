import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';

export type RequirementPriority = 'Must-have' | 'Should-have' | 'Nice-to-have';

export interface RequirementRecord {
	id: string;
	domain: string;
	statement: string;
	source: string;
	priority: RequirementPriority;
	compatibility: string;
	acceptanceCriteria: string[];
	file: string;
	line: number;
	capabilityBranches: string[];
}

export interface CapabilityBranch {
	domain: string;
	name: string;
	requirementIds: string[];
}

export interface RequirementPackage {
	requirements: RequirementRecord[];
	branches: CapabilityBranch[];
}

export interface StoryPacket {
	id: string;
	title: string;
	requirementIds: string[];
	acceptanceCriteria: string[];
	tasks: Array<{
		id: string;
		title: string;
		kind: 'design' | 'implementation' | 'test' | 'documentation' | 'demo';
	}>;
}

export interface EpicPacket {
	schemaVersion: 1;
	id: string;
	title: string;
	status: 'proposed' | 'approved' | 'active' | 'complete' | 'deferred';
	approved: boolean;
	domain: string;
	capabilityBranch: string;
	objective: string;
	requirementIds: string[];
	excludedRequirementIds: string[];
	architectureContracts: string[];
	expectedAffectedAreas: string[];
	dependencies: string[];
	parallelSafety: {
		fileOwnership: string[];
		requiresInterfaceContract: boolean;
		notes: string;
	};
	stories: StoryPacket[];
	testPlan: string[];
	demoNotesTemplate: string[];
	stopConditions: string[];
	completionEvidence: string[];
}

export interface WorkpackValidationIssue {
	file: string;
	message: string;
}

const repoRoot = process.cwd();
const planningDir = path.join(repoRoot, 'docs', 'planning', 'v2');
const templatesDir = path.join(planningDir, 'templates');

const compatibilityPattern =
	/Offline:\s*(yes|no|degrade)\s*\|\s*Multi-user:\s*(yes|no|dm-only|not applicable)\s*\|\s*Mobile:\s*(yes|slim|not applicable)\s*\|\s*Player-safe:\s*(yes|dm-only)/;

const epicPacketSchema: z.ZodType<EpicPacket> = z.object({
	schemaVersion: z.literal(1),
	id: z.string().min(1),
	title: z.string().min(1),
	status: z.enum(['proposed', 'approved', 'active', 'complete', 'deferred']),
	approved: z.boolean(),
	domain: z.string().min(1),
	capabilityBranch: z.string().min(1),
	objective: z.string().min(1),
	requirementIds: z.array(z.string().min(1)).min(1),
	excludedRequirementIds: z.array(z.string()),
	architectureContracts: z.array(z.string().min(1)),
	expectedAffectedAreas: z.array(z.string().min(1)),
	dependencies: z.array(z.string()),
	parallelSafety: z.object({
		fileOwnership: z.array(z.string().min(1)),
		requiresInterfaceContract: z.boolean(),
		notes: z.string().min(1),
	}),
	stories: z
		.array(
			z.object({
				id: z.string().min(1),
				title: z.string().min(1),
				requirementIds: z.array(z.string().min(1)).min(1),
				acceptanceCriteria: z.array(z.string().min(1)).min(1),
				tasks: z
					.array(
						z.object({
							id: z.string().min(1),
							title: z.string().min(1),
							kind: z.enum(['design', 'implementation', 'test', 'documentation', 'demo']),
						}),
					)
					.min(1),
			}),
		)
		.min(1),
	testPlan: z.array(z.string().min(1)).min(1),
	demoNotesTemplate: z.array(z.string().min(1)).min(1),
	stopConditions: z.array(z.string().min(1)).min(1),
	completionEvidence: z.array(z.string().min(1)).min(1),
});

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64);
}

function normalizeDomainFromFile(fileName: string, markdown: string): string | null {
	const titleMatch = markdown.match(/^##\s+([A-Z]+)\s+-/m);
	if (titleMatch?.[1]) {
		return titleMatch[1];
	}
	const fallback = fileName.match(/^\d+-([a-z-]+)\.md$/);
	if (!fallback?.[1] || fallback[1] === 'quality-traceability') return null;
	return fallback[1].split('-')[0]?.toUpperCase() ?? null;
}

function getLineNumber(markdown: string, offset: number): number {
	return markdown.slice(0, offset).split(/\r?\n/).length;
}

function extractField(block: string, field: string): string {
	const match = block.match(new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`));
	return match?.[1]?.trim() ?? '';
}

function extractAcceptanceCriteria(block: string): string[] {
	const criteriaStart = block.search(/\*\*Acceptance criteria:\*\*/);
	if (criteriaStart === -1) return [];
	const criteriaBlock = block.slice(criteriaStart);
	const criteria: string[] = [];
	for (const line of criteriaBlock.split(/\r?\n/)) {
		const match = line.match(/^-\s+(.+)/);
		if (match?.[1]) {
			criteria.push(match[1].trim());
		}
	}
	return criteria;
}

function extractCapabilityBranches(markdown: string, domain: string): CapabilityBranch[] {
	const branches: CapabilityBranch[] = [];
	for (const match of markdown.matchAll(/^-\s+([^:]+):\s+(.+)$/gm)) {
		const name = match[1]?.trim();
		const tail = match[2] ?? '';
		if (!name || !tail.includes(`${domain}-`)) continue;
		const requirementIds = Array.from(tail.matchAll(new RegExp(`\\\`${domain}-\\d{3}\\\``, 'g')))
			.map((idMatch) => idMatch[0].replaceAll('`', ''))
			.filter((id, index, ids) => ids.indexOf(id) === index);
		if (requirementIds.length > 0) {
			branches.push({ domain, name, requirementIds });
		}
	}
	return branches;
}

export async function parseRequirementPackage(root = repoRoot): Promise<RequirementPackage> {
	const dir = path.join(root, 'docs', 'remake-review', 'requirements');
	const entries = (await fs.readdir(dir)).filter((entry) => /^\d+-.+\.md$/.test(entry)).sort();
	const requirements: RequirementRecord[] = [];
	const branches: CapabilityBranch[] = [];

	for (const entry of entries) {
		if (entry === '00-quality-traceability.md') continue;
		const fullPath = path.join(dir, entry);
		const markdown = await fs.readFile(fullPath, 'utf-8');
		const domain = normalizeDomainFromFile(entry, markdown);
		if (!domain) continue;
		const fileBranches = extractCapabilityBranches(markdown, domain);
		branches.push(...fileBranches);
		const branchByRequirement = new Map<string, string[]>();
		for (const branch of fileBranches) {
			for (const requirementId of branch.requirementIds) {
				const current = branchByRequirement.get(requirementId) ?? [];
				current.push(branch.name);
				branchByRequirement.set(requirementId, current);
			}
		}

		const headingPattern = new RegExp(`^###\\s+(${domain}-\\d{3})\\s*$`, 'gm');
		const matches = Array.from(markdown.matchAll(headingPattern));
		for (let index = 0; index < matches.length; index += 1) {
			const match = matches[index]!;
			const id = match[1]!;
			const start = match.index ?? 0;
			const nextStart = matches[index + 1]?.index ?? markdown.length;
			const block = markdown.slice(start, nextStart);
			const priority = extractField(block, 'Priority') as RequirementPriority;
			const compatibility = extractField(block, 'Compatibility');
			requirements.push({
				id,
				domain,
				statement: extractField(block, 'Statement'),
				source: extractField(block, 'Source'),
				priority,
				compatibility,
				acceptanceCriteria: extractAcceptanceCriteria(block),
				file: path.relative(root, fullPath).replace(/\\/g, '/'),
				line: getLineNumber(markdown, start),
				capabilityBranches: branchByRequirement.get(id) ?? [],
			});
		}
	}

	return { requirements, branches };
}

function inferArchitectureContracts(requirements: RequirementRecord[]): string[] {
	const text = requirements
		.map((requirement) => `${requirement.source} ${requirement.statement}`)
		.join(' ');
	const contracts = new Set<string>();
	if (/Processing|Command API|Widget|Scene|Canvas/i.test(text)) {
		contracts.add('Contract 1: Processing / Display Decoupling');
	}
	if (/Sync|Offline|Cloud|Google|Obsidian|conflict|collaboration/i.test(text)) {
		contracts.add('Contract 2: Cloud Sync & Offline Model');
	}
	if (/Role|Permission|Visibility|Player-safe|grant|DM-only|player/i.test(text)) {
		contracts.add('Contract 3: Role, Visibility & Permission Grant Model');
	}
	if (/Widget|Scene|Canvas|Project|Package/i.test(text)) {
		contracts.add('Contract 4: Scene and Widget Contract');
	}
	return Array.from(contracts).sort();
}

function inferAffectedAreas(domain: string): string[] {
	const shared = ['apps/v2', 'docs/planning/v2'];
	const domainAreas: Record<string, string[]> = {
		CANVAS: ['scene core', 'widget host', 'scene UI'],
		CMD: ['command center', 'session shell'],
		MAP: ['map model', 'map renderer'],
		CHAR: ['character model', 'character UI'],
		SES: ['session state', 'live tools'],
		CONTENT: ['content model', 'editor integration'],
		GRAPH: ['graph index', 'relationship intelligence'],
		SRCH: ['search index', 'quick switcher'],
		SYNC: ['sync engine', 'source adapters'],
		COLLAB: ['collaboration transport', 'participant state'],
		PERM: ['permission core', 'visibility filtering'],
		AUDIO: ['audio model', 'playback surface'],
		MCP: ['agent tool interface', 'policy layer'],
		PLAT: ['platform services', 'runtime shell'],
		NAV: ['navigation model', 'route shell'],
		A11Y: ['accessibility infrastructure', 'spatial alternatives'],
		SEC: ['security boundary', 'threat controls'],
		PERF: ['performance budgets', 'measurement'],
		CON: ['governance constraints'],
	};
	return [...shared, ...(domainAreas[domain] ?? ['domain surface'])];
}

function createStory(requirement: RequirementRecord, storyIndex: number): StoryPacket {
	const storyId = `${requirement.id}-S${String(storyIndex + 1).padStart(2, '0')}`;
	return {
		id: storyId,
		title: requirement.statement.replace(/\.$/, ''),
		requirementIds: [requirement.id],
		acceptanceCriteria: requirement.acceptanceCriteria,
		tasks: [
			{
				id: `${storyId}-T01`,
				title: `Confirm architecture and interface shape for ${requirement.id}`,
				kind: 'design',
			},
			{
				id: `${storyId}-T02`,
				title: `Implement the smallest behavior that satisfies ${requirement.id}`,
				kind: 'implementation',
			},
			{
				id: `${storyId}-T03`,
				title: `Add automated coverage for ${requirement.id} acceptance criteria`,
				kind: 'test',
			},
			{
				id: `${storyId}-T04`,
				title: `Record demo notes and traceability evidence for ${requirement.id}`,
				kind: 'demo',
			},
		],
	};
}

export function buildEpicPackets(pack: RequirementPackage): EpicPacket[] {
	const requirementsById = new Map(
		pack.requirements.map((requirement) => [requirement.id, requirement]),
	);
	const epics: EpicPacket[] = [];

	for (const branch of pack.branches) {
		const branchRequirements = branch.requirementIds
			.map((id) => requirementsById.get(id))
			.filter((requirement): requirement is RequirementRecord => Boolean(requirement));
		if (branchRequirements.length === 0) continue;
		const slug = slugify(branch.name);
		const id = `${branch.domain}-${slug}`;
		epics.push({
			schemaVersion: 1,
			id,
			title: `${branch.domain}: ${branch.name}`,
			status: 'proposed',
			approved: false,
			domain: branch.domain,
			capabilityBranch: branch.name,
			objective: `Deliver the ${branch.name.toLowerCase()} capability branch for ${branch.domain}, traced to the included v2 requirements.`,
			requirementIds: branchRequirements.map((requirement) => requirement.id),
			excludedRequirementIds: [],
			architectureContracts: inferArchitectureContracts(branchRequirements),
			expectedAffectedAreas: inferAffectedAreas(branch.domain),
			dependencies: [],
			parallelSafety: {
				fileOwnership: [`apps/v2/${branch.domain.toLowerCase()}/`, 'docs/planning/v2/'],
				requiresInterfaceContract: true,
				notes:
					'Parallel execution requires explicit interface contracts and non-overlapping generated file ownership.',
			},
			stories: branchRequirements.map((requirement, index) => createStory(requirement, index)),
			testPlan: [
				'Run unit tests for domain reducers, command validators, and data transforms touched by this epic.',
				'Run UI or integration checks for any visible prototype behavior touched by this epic.',
				'Run `pnpm v2:workpack:validate` before handoff.',
			],
			demoNotesTemplate: [
				'Describe the user-visible path demonstrated.',
				'List the requirement IDs exercised by the demo.',
				'Record any gaps intentionally deferred out of this epic.',
			],
			stopConditions: [
				'Stop if the v2 stack ADR is missing or contradicts the implementation approach.',
				'Stop if implementing the epic requires runtime imports from v1 app code.',
				'Stop if hidden visibility, permission, sync, or persistence behavior is ambiguous.',
				'Stop if the generated workpack no longer validates.',
			],
			completionEvidence: [
				'Targeted tests pass.',
				'Traceability from requirement IDs to implementation and tests is documented.',
				'Demo notes are filled in for visible behavior.',
				'Workpack status is updated after completion.',
			],
		});
	}

	return epics.sort((left, right) => left.id.localeCompare(right.id));
}

function requirementIndexDocument(pack: RequirementPackage): string {
	const byDomain = new Map<string, RequirementRecord[]>();
	for (const requirement of pack.requirements) {
		const current = byDomain.get(requirement.domain) ?? [];
		current.push(requirement);
		byDomain.set(requirement.domain, current);
	}
	return YAML.stringify({
		schemaVersion: 1,
		generatedFrom: 'docs/remake-review/requirements',
		totalRequirements: pack.requirements.length,
		domains: Array.from(byDomain.entries()).map(([domain, requirements]) => ({
			domain,
			count: requirements.length,
			requirements: requirements.map((requirement) => ({
				id: requirement.id,
				priority: requirement.priority,
				file: requirement.file,
				line: requirement.line,
				capabilityBranches: requirement.capabilityBranches,
			})),
		})),
	});
}

function initiativeMapDocument(pack: RequirementPackage, epics: EpicPacket[]): string {
	const domains = Array.from(
		new Set(pack.requirements.map((requirement) => requirement.domain)),
	).sort();
	return YAML.stringify({
		schemaVersion: 1,
		source: 'Generated from v2 requirement domain files.',
		initiatives: domains.map((domain) => ({
			id: `V2-${domain}`,
			title: `${domain} implementation initiative`,
			status: 'proposed',
			requirementIds: pack.requirements
				.filter((requirement) => requirement.domain === domain)
				.map((requirement) => requirement.id),
			epicIds: epics.filter((epic) => epic.domain === domain).map((epic) => epic.id),
		})),
	});
}

function statusDocument(epics: EpicPacket[]): string {
	return YAML.stringify({
		schemaVersion: 1,
		stackDecision: {
			requiredAdr: 'docs/adr/014-v2-stack-and-subproject-boundary.md',
			status: 'proposed',
			blocksImplementation: true,
		},
		summary: {
			totalEpics: epics.length,
			proposed: epics.filter((epic) => epic.status === 'proposed').length,
			approved: epics.filter((epic) => epic.status === 'approved').length,
			active: epics.filter((epic) => epic.status === 'active').length,
			complete: epics.filter((epic) => epic.status === 'complete').length,
			deferred: epics.filter((epic) => epic.status === 'deferred').length,
		},
		epics: epics.map((epic) => ({
			id: epic.id,
			status: epic.status,
			approved: epic.approved,
			requirementIds: epic.requirementIds,
		})),
	});
}

function parallelBatchesDocument(): string {
	return YAML.stringify({
		schemaVersion: 1,
		batches: [
			{
				id: 'blocked-until-v2-stack-adr',
				status: 'blocked',
				reason:
					'Implementation batches require ADR-014 to choose the v2 stack and subproject boundary.',
				epicIds: [],
			},
		],
	});
}

async function writeYaml(filePath: string, yaml: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, yaml, 'utf-8');
}

export async function generateWorkpack(root = repoRoot): Promise<{ epics: EpicPacket[] }> {
	const pack = await parseRequirementPackage(root);
	const epics = buildEpicPackets(pack);
	const outputRoot = path.join(root, 'docs', 'planning', 'v2');
	const outputEpicsDir = path.join(outputRoot, 'epics');
	await fs.mkdir(outputEpicsDir, { recursive: true });
	await writeYaml(path.join(outputRoot, 'requirements-index.yaml'), requirementIndexDocument(pack));
	await writeYaml(path.join(outputRoot, 'initiative-map.yaml'), initiativeMapDocument(pack, epics));
	await writeYaml(path.join(outputRoot, 'status.yaml'), statusDocument(epics));
	await writeYaml(path.join(outputRoot, 'parallel-batches.yaml'), parallelBatchesDocument());
	for (const epic of epics) {
		await writeYaml(path.join(outputEpicsDir, `${epic.id}.yaml`), YAML.stringify(epic));
	}
	return { epics };
}

async function readYamlFile(filePath: string): Promise<unknown> {
	const content = await fs.readFile(filePath, 'utf-8');
	return YAML.parse(content) as unknown;
}

async function collectEpicFiles(root = repoRoot): Promise<string[]> {
	const dir = path.join(root, 'docs', 'planning', 'v2', 'epics');
	try {
		const entries = await fs.readdir(dir);
		return entries
			.filter((entry) => entry.endsWith('.yaml'))
			.map((entry) => path.join(dir, entry))
			.sort();
	} catch {
		return [];
	}
}

export async function validateWorkpack(root = repoRoot): Promise<WorkpackValidationIssue[]> {
	const issues: WorkpackValidationIssue[] = [];
	const pack = await parseRequirementPackage(root);
	const requirementIds = new Set(pack.requirements.map((requirement) => requirement.id));
	const epicFiles = await collectEpicFiles(root);
	const epicIds = new Set<string>();
	const mappedRequirementIds = new Set<string>();
	const storyIds = new Set<string>();
	const taskIds = new Set<string>();
	const epics: EpicPacket[] = [];

	for (const file of epicFiles) {
		const relativeFile = path.relative(root, file).replace(/\\/g, '/');
		const parsed = epicPacketSchema.safeParse(await readYamlFile(file));
		if (!parsed.success) {
			issues.push({
				file: relativeFile,
				message: parsed.error.issues.map((issue) => issue.message).join('; '),
			});
			continue;
		}
		const epic = parsed.data;
		if (epicIds.has(epic.id)) {
			issues.push({ file: relativeFile, message: `Duplicate epic id: ${epic.id}` });
		}
		epicIds.add(epic.id);
		epics.push(epic);
		if (epic.status === 'approved' && !epic.approved) {
			issues.push({ file: relativeFile, message: 'Approved status requires approved: true.' });
		}
		for (const requirementId of epic.requirementIds) {
			if (!requirementIds.has(requirementId)) {
				issues.push({ file: relativeFile, message: `Unknown requirement id: ${requirementId}` });
			}
			mappedRequirementIds.add(requirementId);
		}
		for (const story of epic.stories) {
			if (storyIds.has(story.id)) {
				issues.push({ file: relativeFile, message: `Duplicate story id: ${story.id}` });
			}
			storyIds.add(story.id);
			for (const requirementId of story.requirementIds) {
				if (!epic.requirementIds.includes(requirementId)) {
					issues.push({
						file: relativeFile,
						message: `Story ${story.id} maps requirement outside parent epic: ${requirementId}`,
					});
				}
			}
			for (const task of story.tasks) {
				if (taskIds.has(task.id)) {
					issues.push({ file: relativeFile, message: `Duplicate task id: ${task.id}` });
				}
				taskIds.add(task.id);
			}
		}
	}

	if (epicFiles.length === 0) {
		issues.push({
			file: 'docs/planning/v2/epics',
			message: 'No v2 epic YAML files found. Run pnpm v2:workpack:generate.',
		});
	}

	for (const requirement of pack.requirements) {
		if (!mappedRequirementIds.has(requirement.id)) {
			issues.push({
				file: requirement.file,
				message: `Requirement is not mapped to an epic: ${requirement.id}`,
			});
		}
		if (!requirement.statement) {
			issues.push({ file: requirement.file, message: `Missing statement: ${requirement.id}` });
		}
		if (!['Must-have', 'Should-have', 'Nice-to-have'].includes(requirement.priority)) {
			issues.push({ file: requirement.file, message: `Invalid priority: ${requirement.id}` });
		}
		if (
			requirement.priority === 'Must-have' &&
			!compatibilityPattern.test(requirement.compatibility)
		) {
			issues.push({
				file: requirement.file,
				message: `Must-have requirement has invalid compatibility row: ${requirement.id}`,
			});
		}
		if (requirement.acceptanceCriteria.length === 0) {
			issues.push({
				file: requirement.file,
				message: `Requirement has no acceptance criteria: ${requirement.id}`,
			});
		}
		if (requirement.capabilityBranches.length === 0) {
			issues.push({
				file: requirement.file,
				message: `Requirement is not listed in a capability branch: ${requirement.id}`,
			});
		}
	}

	for (const epic of epics) {
		for (const dependency of epic.dependencies) {
			if (!epicIds.has(dependency)) {
				issues.push({
					file: `docs/planning/v2/epics/${epic.id}.yaml`,
					message: `Unknown dependency: ${dependency}`,
				});
			}
		}
	}

	issues.push(...detectDependencyCycles(epics));
	return issues;
}

function detectDependencyCycles(epics: EpicPacket[]): WorkpackValidationIssue[] {
	const issues: WorkpackValidationIssue[] = [];
	const byId = new Map(epics.map((epic) => [epic.id, epic]));
	const visiting = new Set<string>();
	const visited = new Set<string>();

	function visit(epicId: string, pathIds: string[]): void {
		if (visiting.has(epicId)) {
			issues.push({
				file: `docs/planning/v2/epics/${epicId}.yaml`,
				message: `Dependency cycle detected: ${[...pathIds, epicId].join(' -> ')}`,
			});
			return;
		}
		if (visited.has(epicId)) return;
		const epic = byId.get(epicId);
		if (!epic) return;
		visiting.add(epicId);
		for (const dependency of epic.dependencies) {
			visit(dependency, [...pathIds, epicId]);
		}
		visiting.delete(epicId);
		visited.add(epicId);
	}

	for (const epic of epics) {
		visit(epic.id, []);
	}
	return issues;
}

export function renderPrompt(epic: EpicPacket, template: string): string {
	if (!epic.approved || epic.status !== 'approved') {
		throw new Error(`Epic ${epic.id} is not approved for prompt generation.`);
	}
	const storySummary = epic.stories
		.map(
			(story) =>
				`- ${story.id}: ${story.title}\n  Requirements: ${story.requirementIds.join(', ')}\n  Tasks: ${story.tasks.map((task) => task.id).join(', ')}`,
		)
		.join('\n');
	return template
		.replaceAll('{{EPIC_ID}}', epic.id)
		.replaceAll('{{EPIC_TITLE}}', epic.title)
		.replaceAll('{{OBJECTIVE}}', epic.objective)
		.replaceAll('{{REQUIREMENT_IDS}}', epic.requirementIds.join(', '))
		.replaceAll('{{ARCHITECTURE_CONTRACTS}}', epic.architectureContracts.join('; '))
		.replaceAll('{{EXPECTED_AREAS}}', epic.expectedAffectedAreas.join(', '))
		.replaceAll('{{STORY_SUMMARY}}', storySummary)
		.replaceAll('{{STOP_CONDITIONS}}', epic.stopConditions.map((item) => `- ${item}`).join('\n'))
		.replaceAll('{{TEST_PLAN}}', epic.testPlan.map((item) => `- ${item}`).join('\n'))
		.replaceAll(
			'{{COMPLETION_EVIDENCE}}',
			epic.completionEvidence.map((item) => `- ${item}`).join('\n'),
		);
}

async function loadEpicById(epicId: string, root = repoRoot): Promise<EpicPacket> {
	const filePath = path.join(root, 'docs', 'planning', 'v2', 'epics', `${epicId}.yaml`);
	const parsed = epicPacketSchema.parse(await readYamlFile(filePath));
	return parsed;
}

async function runGenerate(): Promise<void> {
	const result = await generateWorkpack();
	console.log(
		`generated ${result.epics.length} v2 epic packet(s) in ${path.relative(repoRoot, planningDir)}`,
	);
}

async function runValidate(): Promise<void> {
	const issues = await validateWorkpack();
	if (issues.length > 0) {
		console.error(`v2 workpack validation failed with ${issues.length} issue(s):`);
		for (const issue of issues) {
			console.error(`- ${issue.file}: ${issue.message}`);
		}
		process.exit(1);
	}
	console.log('v2 workpack validation passed');
}

async function runStatus(): Promise<void> {
	const statusPath = path.join(planningDir, 'status.yaml');
	const status = await readYamlFile(statusPath);
	console.log(YAML.stringify(status).trimEnd());
}

function getFlagValue(args: string[], flag: string): string | undefined {
	const index = args.indexOf(flag);
	if (index === -1) return undefined;
	return args[index + 1];
}

async function runPrompt(args: string[]): Promise<void> {
	const epicId = getFlagValue(args, '--epic');
	if (!epicId) {
		throw new Error('Usage: pnpm v2:prompt -- --epic <epic-id>');
	}
	const epic = await loadEpicById(epicId);
	const template = await fs.readFile(path.join(templatesDir, 'epic-coder.prompt.md'), 'utf-8');
	console.log(renderPrompt(epic, template));
}

async function main(): Promise<void> {
	const [command, ...args] = process.argv.slice(2);
	if (command === 'generate') {
		await runGenerate();
		return;
	}
	if (command === 'validate') {
		await runValidate();
		return;
	}
	if (command === 'status') {
		await runStatus();
		return;
	}
	if (command === 'prompt') {
		await runPrompt(args);
		return;
	}
	throw new Error(
		'Usage: pnpm v2:workpack:<generate|validate|status> or pnpm v2:prompt -- --epic <id>',
	);
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);
if (executedPath === modulePath) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
