import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';

export type RequirementPriority = 'Must-have' | 'Should-have' | 'Nice-to-have';
export type EpicStatus = 'proposed' | 'approved' | 'active' | 'complete' | 'deferred';

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
	status: EpicStatus;
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
	qualityBar: string[];
	gitWorkflow: string[];
	statusAutomation: string[];
	testPlan: string[];
	demoNotesTemplate: string[];
	stopConditions: string[];
	completionEvidence: string[];
	completionEvidenceFile?: string;
}

export interface StackDecisionState {
	requiredAdr: string;
	status: 'proposed' | 'accepted';
	blocksImplementation: boolean;
}

export interface EpicStateOverride {
	id: string;
	status?: EpicStatus;
	approved?: boolean;
	completionEvidenceFile?: string;
	notes?: string;
}

export interface WorkpackPrecedence {
	/** Domains in natural build order. Earlier domains are picked first. */
	domains: string[];
	/** Optional explicit epic ordering that jumps the queue ahead of domain order. */
	epics: string[];
}

export interface WorkpackState {
	schemaVersion: 1;
	sourceOfTruth: {
		purpose: string;
		generatedFiles: string[];
	};
	defaults: {
		status: EpicStatus;
		approved: boolean;
	};
	stackDecision: StackDecisionState;
	precedence?: WorkpackPrecedence;
	epics: EpicStateOverride[];
}

export interface WorkpackValidationIssue {
	file: string;
	message: string;
}

const repoRoot = process.cwd();
const planningDir = path.join(repoRoot, 'docs', 'planning', 'v2');
const templatesDir = path.join(planningDir, 'templates');
const workpackStateFileName = 'workpack-state.yaml';

const generatedWorkpackFiles = [
	'docs/planning/v2/requirements-index.yaml',
	'docs/planning/v2/initiative-map.yaml',
	'docs/planning/v2/status.yaml',
	'docs/planning/v2/parallel-batches.yaml',
	'docs/planning/v2/epics/*.yaml',
];

const defaultStackDecision: StackDecisionState = {
	requiredAdr: 'docs/adr/014-v2-stack-and-subproject-boundary.md',
	status: 'proposed',
	blocksImplementation: true,
};

const epicStatuses = ['proposed', 'approved', 'active', 'complete', 'deferred'] as const;

const compatibilityPattern =
	/Offline:\s*(yes|no|degrade)\s*\|\s*Multi-user:\s*(yes|no|dm-only|not applicable)\s*\|\s*Mobile:\s*(yes|slim|not applicable)\s*\|\s*Player-safe:\s*(yes|dm-only)/;

const epicPacketSchema: z.ZodType<EpicPacket> = z.object({
	schemaVersion: z.literal(1),
	id: z.string().min(1),
	title: z.string().min(1),
	status: z.enum(epicStatuses),
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
	qualityBar: z.array(z.string().min(1)).min(1),
	gitWorkflow: z.array(z.string().min(1)).min(1),
	statusAutomation: z.array(z.string().min(1)).min(1),
	testPlan: z.array(z.string().min(1)).min(1),
	demoNotesTemplate: z.array(z.string().min(1)).min(1),
	stopConditions: z.array(z.string().min(1)).min(1),
	completionEvidence: z.array(z.string().min(1)).min(1),
	completionEvidenceFile: z.string().min(1).optional(),
});

const workpackStateSchema: z.ZodType<WorkpackState> = z.object({
	schemaVersion: z.literal(1),
	sourceOfTruth: z.object({
		purpose: z.string().min(1),
		generatedFiles: z.array(z.string().min(1)).min(1),
	}),
	defaults: z.object({
		status: z.enum(epicStatuses),
		approved: z.boolean(),
	}),
	stackDecision: z.object({
		requiredAdr: z.string().min(1),
		status: z.enum(['proposed', 'accepted']),
		blocksImplementation: z.boolean(),
	}),
	precedence: z
		.object({
			domains: z.array(z.string().min(1)),
			epics: z.array(z.string().min(1)),
		})
		.optional(),
	epics: z.array(
		z.object({
			id: z.string().min(1),
			status: z.enum(epicStatuses).optional(),
			approved: z.boolean().optional(),
			completionEvidenceFile: z.string().min(1).optional(),
			notes: z.string().min(1).optional(),
		}),
	),
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

function isApprovedStatus(status: EpicStatus): boolean {
	return status === 'approved' || status === 'active' || status === 'complete';
}

function defaultWorkpackState(): WorkpackState {
	return {
		schemaVersion: 1,
		sourceOfTruth: {
			purpose:
				'Mutable source of truth for v2 epic approval and completion state. Generated planning files are derived from requirements plus this file.',
			generatedFiles: generatedWorkpackFiles,
		},
		defaults: {
			status: 'proposed',
			approved: false,
		},
		stackDecision: defaultStackDecision,
		epics: [],
	};
}

function qualityBar(): string[] {
	return [
		'Correctness: every mapped acceptance criterion is implemented or explicitly deferred with reviewer-visible evidence.',
		'Architecture integrity: changes obey ADR-014, the architecture contracts, package boundaries, and no-v1-runtime-import rules.',
		'Traceability: requirement IDs are tied to code, tests, demo notes, and any documentation changes.',
		'Test depth: unit, integration, e2e, boundary, accessibility, performance, security, permission, sync, and migration coverage are chosen according to risk.',
		'User experience: visible flows are complete, accessible, responsive, resilient to empty/error/loading states, and consistent with the design system.',
		'Data safety: persistence, offline behavior, sync assumptions, conflict handling, actor filtering, and privacy boundaries fail closed.',
		'Maintainability: modules remain cohesive, typed, readable, locally scoped, and free of speculative abstractions or unrelated refactors.',
		'Operational quality: diagnostics, metrics, docs, generated files, and handoff evidence are current before completion.',
	];
}

function gitWorkflow(): string[] {
	return [
		'Start from a clean working tree. Run `git status --short` before editing and stop if unrelated changes overlap this epic.',
		'Use one branch per epic from the correct base branch, and keep all commits scoped to the assigned epic.',
		'Never reset, overwrite, or reformat unrelated user changes. Work around existing dirty files unless they block the epic.',
		'Commit the code, docs, tests, generated workpack updates, and completion evidence needed for the epic before handoff.',
		'Leave a clean slate when the epic is complete: no untracked files, no unstaged edits, and no stale generated planning diffs caused by the epic.',
	];
}

function statusAutomation(epicId: string): string[] {
	return [
		'Do not hand-edit generated epic packets, `status.yaml`, `requirements-index.yaml`, `initiative-map.yaml`, or `parallel-batches.yaml` for status changes.',
		`Use \`pnpm v2:workpack:set-status -- --epic ${epicId} --status active\` when implementation starts.`,
		`Create \`docs/planning/v2/epics/${epicId}.completion.md\` with demo, tests, traceability, gaps, and git evidence before marking complete.`,
		`Use \`pnpm v2:workpack:complete -- --epic ${epicId}\` to update \`workpack-state.yaml\` and regenerate all derived planning files together.`,
		'Run `pnpm v2:workpack:validate` after any status or generation command; validation fails if generated files drift from the source of truth.',
	];
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
		const epicStatusAutomation = statusAutomation(id);
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
			qualityBar: qualityBar(),
			gitWorkflow: gitWorkflow(),
			statusAutomation: epicStatusAutomation,
			testPlan: [
				'Run unit tests for domain reducers, command validators, and data transforms touched by this epic.',
				'Run UI or integration checks for any visible prototype behavior touched by this epic.',
				'Run domain-specific quality gates for accessibility, performance, security, permissions, sync/offline behavior, migrations, and docs when those areas are touched.',
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
				'Stop if `git status --short` shows unrelated changes that overlap the files this epic needs.',
			],
			completionEvidence: [
				'Targeted tests pass.',
				'Traceability from requirement IDs to implementation and tests is documented.',
				'Demo notes are filled in for visible behavior.',
				'Quality review covers correctness, architecture, security, permissions, accessibility, performance, persistence, sync/offline assumptions, maintainability, UX polish, and documentation.',
				'Completion evidence file records demo path, tests run, changed files, requirement coverage, known gaps, git branch, commit or PR, and final `git status --short` output.',
				'Workpack status is updated with the programmatic complete command after completion evidence exists.',
				'The epic leaves a clean git slate with no untracked or unstaged files caused by the work.',
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

function workpackStatePath(root = repoRoot): string {
	return path.join(root, 'docs', 'planning', 'v2', workpackStateFileName);
}

async function readWorkpackState(root = repoRoot): Promise<WorkpackState | null> {
	try {
		const parsed = await readYamlFile(workpackStatePath(root));
		return workpackStateSchema.parse(parsed);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw error;
	}
}

function normalizeWorkpackState(state: WorkpackState): WorkpackState {
	const overrides = [...state.epics].sort((left, right) => left.id.localeCompare(right.id));
	return {
		...state,
		sourceOfTruth: {
			purpose: state.sourceOfTruth.purpose,
			generatedFiles: generatedWorkpackFiles,
		},
		epics: overrides,
	};
}

async function writeWorkpackState(root: string, state: WorkpackState): Promise<void> {
	await writeYaml(workpackStatePath(root), YAML.stringify(normalizeWorkpackState(state)));
}

async function ensureWorkpackState(root = repoRoot): Promise<WorkpackState> {
	const existing = await readWorkpackState(root);
	if (existing) return normalizeWorkpackState(existing);
	const state = defaultWorkpackState();
	await writeWorkpackState(root, state);
	return state;
}

function applyWorkpackState(epics: EpicPacket[], state: WorkpackState): EpicPacket[] {
	const overrides = new Map(state.epics.map((epic) => [epic.id, epic]));
	return epics.map((epic) => {
		const override = overrides.get(epic.id);
		const status = override?.status ?? state.defaults.status;
		const approved = override?.approved ?? state.defaults.approved;
		const nextEpic: EpicPacket = {
			...epic,
			status,
			approved,
		};
		if (override?.completionEvidenceFile) {
			nextEpic.completionEvidenceFile = override.completionEvidenceFile;
		}
		return nextEpic;
	});
}

function buildStatusSummary(epics: EpicPacket[]): Record<EpicStatus | 'totalEpics', number> {
	return {
		totalEpics: epics.length,
		proposed: epics.filter((epic) => epic.status === 'proposed').length,
		approved: epics.filter((epic) => epic.status === 'approved').length,
		active: epics.filter((epic) => epic.status === 'active').length,
		complete: epics.filter((epic) => epic.status === 'complete').length,
		deferred: epics.filter((epic) => epic.status === 'deferred').length,
	};
}

function completionPercent(done: number, total: number): number {
	if (total === 0) return 100;
	return Number(((done / total) * 100).toFixed(1));
}

// Compare two keys by their position in an ordering map. Unlisted keys sort last,
// and two unlisted keys tie (avoids the Infinity - Infinity = NaN comparator trap).
function compareByOrder(order: Map<string, number>, left: string, right: string): number {
	const leftIndex = order.get(left) ?? Number.POSITIVE_INFINITY;
	const rightIndex = order.get(right) ?? Number.POSITIVE_INFINITY;
	if (leftIndex === rightIndex) return 0;
	return leftIndex < rightIndex ? -1 : 1;
}

export function findNextEpic(
	epics: EpicPacket[],
	precedence?: WorkpackPrecedence,
): EpicPacket | null {
	const completeIds = new Set(
		epics.filter((epic) => epic.status === 'complete').map((epic) => epic.id),
	);
	const candidateRank: Record<string, number> = {
		active: 0,
		approved: 1,
	};
	// Soft ordering layers on top of the hard `dependencies` gate: an explicit
	// epic list wins, then domain build order, then a stable alphabetical fallback.
	const epicOrder = new Map((precedence?.epics ?? []).map((id, index) => [id, index]));
	const domainOrder = new Map((precedence?.domains ?? []).map((domain, index) => [domain, index]));
	const candidates = epics
		.filter((epic) => epic.approved && (epic.status === 'active' || epic.status === 'approved'))
		.filter((epic) => epic.dependencies.every((dependency) => completeIds.has(dependency)))
		.sort((left, right) => {
			const statusRank = (candidateRank[left.status] ?? 99) - (candidateRank[right.status] ?? 99);
			if (statusRank !== 0) return statusRank;
			const epicRank = compareByOrder(epicOrder, left.id, right.id);
			if (epicRank !== 0) return epicRank;
			const domainRank = compareByOrder(domainOrder, left.domain, right.domain);
			if (domainRank !== 0) return domainRank;
			return left.id.localeCompare(right.id);
		});
	return candidates[0] ?? null;
}

function buildWorkpackMetrics(
	pack: RequirementPackage,
	epics: EpicPacket[],
): Record<string, unknown> {
	const totalRequirements = pack.requirements.length;
	const completedRequirementIds = new Set<string>();
	const deferredRequirementIds = new Set<string>();
	const completeIds = new Set<string>();
	for (const epic of epics) {
		if (epic.status === 'complete') {
			completeIds.add(epic.id);
			for (const requirementId of epic.requirementIds) {
				completedRequirementIds.add(requirementId);
			}
		}
		if (epic.status === 'deferred') {
			for (const requirementId of epic.requirementIds) {
				deferredRequirementIds.add(requirementId);
			}
		}
	}
	const blockedByDependencies = epics.filter(
		(epic) =>
			epic.approved &&
			(epic.status === 'approved' || epic.status === 'active') &&
			epic.dependencies.some((dependency) => !completeIds.has(dependency)),
	).length;
	const promptableEpics = epics.filter(
		(epic) =>
			epic.approved &&
			(epic.status === 'approved' || epic.status === 'active') &&
			epic.dependencies.every((dependency) => completeIds.has(dependency)),
	).length;
	const domains = Array.from(new Set(epics.map((epic) => epic.domain)))
		.sort()
		.map((domain) => {
			const domainEpics = epics.filter((epic) => epic.domain === domain);
			const domainRequirementIds = new Set(
				pack.requirements
					.filter((requirement) => requirement.domain === domain)
					.map((requirement) => requirement.id),
			);
			const domainCompletedRequirementIds = new Set<string>();
			for (const epic of domainEpics) {
				if (epic.status !== 'complete') continue;
				for (const requirementId of epic.requirementIds) {
					if (domainRequirementIds.has(requirementId)) {
						domainCompletedRequirementIds.add(requirementId);
					}
				}
			}
			return {
				domain,
				totalEpics: domainEpics.length,
				complete: domainEpics.filter((epic) => epic.status === 'complete').length,
				active: domainEpics.filter((epic) => epic.status === 'active').length,
				approved: domainEpics.filter((epic) => epic.status === 'approved').length,
				proposed: domainEpics.filter((epic) => epic.status === 'proposed').length,
				deferred: domainEpics.filter((epic) => epic.status === 'deferred').length,
				epicCompletionPercent: completionPercent(
					domainEpics.filter((epic) => epic.status === 'complete').length,
					domainEpics.length,
				),
				requirementCompletionPercent: completionPercent(
					domainCompletedRequirementIds.size,
					domainRequirementIds.size,
				),
			};
		});

	return {
		epicCompletionPercent: completionPercent(
			epics.filter((epic) => epic.status === 'complete').length,
			epics.length,
		),
		requirementCompletionPercent: completionPercent(
			completedRequirementIds.size,
			totalRequirements,
		),
		totalRequirements,
		completedRequirements: completedRequirementIds.size,
		deferredRequirements: deferredRequirementIds.size,
		remainingEpics: epics.filter((epic) => epic.status !== 'complete' && epic.status !== 'deferred')
			.length,
		promptableEpics,
		blockedByDependencies,
		completionEvidenceFiles: epics.filter((epic) => Boolean(epic.completionEvidenceFile)).length,
		domains,
	};
}

function nextEpicStatusBlock(nextEpic: EpicPacket | null): Record<string, unknown> | null {
	if (!nextEpic) return null;
	return {
		id: nextEpic.id,
		title: nextEpic.title,
		status: nextEpic.status,
		requirementIds: [...nextEpic.requirementIds],
		promptCommand: `pnpm v2:prompt -- --epic ${nextEpic.id}`,
		nextPromptCommand: 'pnpm v2:prompt -- --next',
		statusCommand: `pnpm v2:workpack:set-status -- --epic ${nextEpic.id} --status active`,
	};
}

function statusDocument(
	pack: RequirementPackage,
	epics: EpicPacket[],
	state: WorkpackState,
): string {
	const nextEpic = findNextEpic(epics, state.precedence);
	return YAML.stringify({
		schemaVersion: 1,
		sourceOfTruth: {
			requirements: 'docs/remake-review/requirements/',
			mutableState: `docs/planning/v2/${workpackStateFileName}`,
			generatedFiles: generatedWorkpackFiles,
		},
		stackDecision: state.stackDecision,
		summary: buildStatusSummary(epics),
		metrics: buildWorkpackMetrics(pack, epics),
		nextEpic: nextEpicStatusBlock(nextEpic),
		epics: epics.map((epic) => {
			const entry: Record<string, unknown> = {
				id: epic.id,
				status: epic.status,
				approved: epic.approved,
				requirementIds: epic.requirementIds,
			};
			if (epic.completionEvidenceFile) {
				entry.completionEvidenceFile = epic.completionEvidenceFile;
			}
			return entry;
		}),
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

async function deleteStaleGeneratedEpicFiles(
	outputEpicsDir: string,
	expectedEpicIds: Set<string>,
): Promise<void> {
	let entries: string[];
	try {
		entries = await fs.readdir(outputEpicsDir);
	} catch {
		return;
	}
	await Promise.all(
		entries
			.filter((entry) => entry.endsWith('.yaml'))
			.filter((entry) => !expectedEpicIds.has(entry.replace(/\.yaml$/, '')))
			.map((entry) => fs.unlink(path.join(outputEpicsDir, entry))),
	);
}

export async function generateWorkpack(
	root = repoRoot,
): Promise<{ epics: EpicPacket[]; state: WorkpackState }> {
	const pack = await parseRequirementPackage(root);
	const baseEpics = buildEpicPackets(pack);
	const state = await ensureWorkpackState(root);
	const epics = applyWorkpackState(baseEpics, state);
	const outputRoot = path.join(root, 'docs', 'planning', 'v2');
	const outputEpicsDir = path.join(outputRoot, 'epics');
	await fs.mkdir(outputEpicsDir, { recursive: true });
	await writeYaml(path.join(outputRoot, 'requirements-index.yaml'), requirementIndexDocument(pack));
	await writeYaml(path.join(outputRoot, 'initiative-map.yaml'), initiativeMapDocument(pack, epics));
	await writeYaml(path.join(outputRoot, 'status.yaml'), statusDocument(pack, epics, state));
	await writeYaml(path.join(outputRoot, 'parallel-batches.yaml'), parallelBatchesDocument());
	await deleteStaleGeneratedEpicFiles(outputEpicsDir, new Set(epics.map((epic) => epic.id)));
	for (const epic of epics) {
		await writeYaml(path.join(outputEpicsDir, `${epic.id}.yaml`), YAML.stringify(epic));
	}
	return { epics, state };
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

async function collectCompletionEvidenceFiles(root = repoRoot): Promise<string[]> {
	const dir = path.join(root, 'docs', 'planning', 'v2', 'epics');
	try {
		const entries = await fs.readdir(dir);
		return entries
			.filter((entry) => entry.endsWith('.completion.md'))
			.map((entry) => path.join(dir, entry))
			.sort();
	} catch {
		return [];
	}
}

function compareGeneratedFile(
	root: string,
	file: string,
	actual: string,
	expected: string,
): WorkpackValidationIssue | null {
	if (actual.trimEnd() === expected.trimEnd()) return null;
	return {
		file: path.relative(root, file).replace(/\\/g, '/'),
		message: 'Generated file is stale. Run pnpm v2:workpack:generate.',
	};
}

async function validateGeneratedFiles(
	root: string,
	pack: RequirementPackage,
	epics: EpicPacket[],
	state: WorkpackState,
): Promise<WorkpackValidationIssue[]> {
	const issues: WorkpackValidationIssue[] = [];
	const outputRoot = path.join(root, 'docs', 'planning', 'v2');
	const outputEpicsDir = path.join(outputRoot, 'epics');
	const expectedFiles = new Map<string, string>([
		[path.join(outputRoot, 'requirements-index.yaml'), requirementIndexDocument(pack)],
		[path.join(outputRoot, 'initiative-map.yaml'), initiativeMapDocument(pack, epics)],
		[path.join(outputRoot, 'status.yaml'), statusDocument(pack, epics, state)],
		[path.join(outputRoot, 'parallel-batches.yaml'), parallelBatchesDocument()],
	]);
	for (const epic of epics) {
		expectedFiles.set(path.join(outputEpicsDir, `${epic.id}.yaml`), YAML.stringify(epic));
	}

	for (const [file, expected] of expectedFiles) {
		try {
			const actual = await fs.readFile(file, 'utf-8');
			const issue = compareGeneratedFile(root, file, actual, expected);
			if (issue) issues.push(issue);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				issues.push({
					file: path.relative(root, file).replace(/\\/g, '/'),
					message: 'Generated file is missing. Run pnpm v2:workpack:generate.',
				});
				continue;
			}
			throw error;
		}
	}

	const expectedEpicFiles = new Set(
		epics.map((epic) => path.join(outputEpicsDir, `${epic.id}.yaml`)),
	);
	for (const file of await collectEpicFiles(root)) {
		if (expectedEpicFiles.has(file)) continue;
		issues.push({
			file: path.relative(root, file).replace(/\\/g, '/'),
			message: 'Stale generated epic file is not produced by current requirements.',
		});
	}
	return issues;
}

async function validateCompletionEvidence(
	root: string,
	epics: EpicPacket[],
): Promise<WorkpackValidationIssue[]> {
	const issues: WorkpackValidationIssue[] = [];
	const byId = new Map(epics.map((epic) => [epic.id, epic]));
	const completedIds = new Set(
		epics.filter((epic) => epic.status === 'complete').map((epic) => epic.id),
	);

	for (const epic of epics) {
		if (epic.status === 'complete' && !epic.completionEvidenceFile) {
			issues.push({
				file: `docs/planning/v2/epics/${epic.id}.yaml`,
				message:
					'Complete epic requires completionEvidenceFile in docs/planning/v2/workpack-state.yaml.',
			});
			continue;
		}
		if (epic.status !== 'complete' && epic.completionEvidenceFile) {
			issues.push({
				file: `docs/planning/v2/epics/${epic.id}.yaml`,
				message: 'Only complete epics may reference completionEvidenceFile.',
			});
		}
		if (!epic.completionEvidenceFile) continue;
		const evidencePath = path.resolve(root, epic.completionEvidenceFile);
		try {
			const content = await fs.readFile(evidencePath, 'utf-8');
			if (!content.includes('Workpack status: `complete`')) {
				issues.push({
					file: epic.completionEvidenceFile,
					message: 'Completion evidence must state Workpack status: `complete`.',
				});
			}
			if (!/git status --short/i.test(content)) {
				issues.push({
					file: epic.completionEvidenceFile,
					message: 'Completion evidence must include final `git status --short` evidence.',
				});
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				issues.push({
					file: epic.completionEvidenceFile,
					message: 'Completion evidence file does not exist.',
				});
				continue;
			}
			throw error;
		}
	}

	for (const evidenceFile of await collectCompletionEvidenceFiles(root)) {
		const epicId = path.basename(evidenceFile).replace(/\.completion\.md$/, '');
		if (completedIds.has(epicId)) continue;
		const status = byId.get(epicId)?.status ?? 'missing';
		issues.push({
			file: path.relative(root, evidenceFile).replace(/\\/g, '/'),
			message: `Completion evidence exists but epic status is ${status}. Run pnpm v2:workpack:complete -- --epic ${epicId}.`,
		});
	}
	return issues;
}

export async function validateWorkpack(root = repoRoot): Promise<WorkpackValidationIssue[]> {
	const issues: WorkpackValidationIssue[] = [];
	const pack = await parseRequirementPackage(root);
	const baseEpics = buildEpicPackets(pack);
	const expectedEpicIds = new Set(baseEpics.map((epic) => epic.id));
	const state = await readWorkpackState(root);
	if (!state) {
		issues.push({
			file: `docs/planning/v2/${workpackStateFileName}`,
			message: 'Missing mutable workpack state. Run pnpm v2:workpack:generate.',
		});
	}
	const effectiveState = state ? normalizeWorkpackState(state) : defaultWorkpackState();
	const effectiveEpics = applyWorkpackState(baseEpics, effectiveState);
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
		if (!expectedEpicIds.has(epic.id)) {
			issues.push({
				file: relativeFile,
				message: `Epic id is not generated from current requirements: ${epic.id}`,
			});
		}
		if (epic.approved !== isApprovedStatus(epic.status)) {
			issues.push({
				file: relativeFile,
				message: `approved must be ${String(isApprovedStatus(epic.status))} for status ${epic.status}.`,
			});
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

	if (state) {
		const overrideIds = new Set<string>();
		if (state.defaults.approved !== isApprovedStatus(state.defaults.status)) {
			issues.push({
				file: `docs/planning/v2/${workpackStateFileName}`,
				message: `defaults.approved must be ${String(isApprovedStatus(state.defaults.status))} for status ${state.defaults.status}.`,
			});
		}
		for (const override of state.epics) {
			if (overrideIds.has(override.id)) {
				issues.push({
					file: `docs/planning/v2/${workpackStateFileName}`,
					message: `Duplicate epic state override: ${override.id}`,
				});
			}
			overrideIds.add(override.id);
			if (!expectedEpicIds.has(override.id)) {
				issues.push({
					file: `docs/planning/v2/${workpackStateFileName}`,
					message: `State references unknown epic id: ${override.id}`,
				});
				continue;
			}
			const status = override.status ?? state.defaults.status;
			const approved = override.approved ?? state.defaults.approved;
			if (approved !== isApprovedStatus(status)) {
				issues.push({
					file: `docs/planning/v2/${workpackStateFileName}`,
					message: `State approved must be ${String(isApprovedStatus(status))} for ${override.id} status ${status}.`,
				});
			}
			if (status === 'complete' && !override.completionEvidenceFile) {
				issues.push({
					file: `docs/planning/v2/${workpackStateFileName}`,
					message: `Complete state requires completionEvidenceFile: ${override.id}`,
				});
			}
			if (status !== 'complete' && override.completionEvidenceFile) {
				issues.push({
					file: `docs/planning/v2/${workpackStateFileName}`,
					message: `Non-complete state cannot keep completionEvidenceFile: ${override.id}`,
				});
			}
		}
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

	for (const epic of effectiveEpics) {
		for (const dependency of epic.dependencies) {
			if (!expectedEpicIds.has(dependency)) {
				issues.push({
					file: `docs/planning/v2/epics/${epic.id}.yaml`,
					message: `Unknown dependency: ${dependency}`,
				});
			}
		}
	}

	if (state?.precedence) {
		const knownDomains = new Set(baseEpics.map((epic) => epic.domain));
		for (const domain of state.precedence.domains) {
			if (!knownDomains.has(domain)) {
				issues.push({
					file: `docs/planning/v2/${workpackStateFileName}`,
					message: `Precedence references unknown domain: ${domain}`,
				});
			}
		}
		for (const epicId of state.precedence.epics) {
			if (!expectedEpicIds.has(epicId)) {
				issues.push({
					file: `docs/planning/v2/${workpackStateFileName}`,
					message: `Precedence references unknown epic id: ${epicId}`,
				});
			}
		}
	}

	issues.push(...detectDependencyCycles(effectiveEpics));
	if (state) {
		issues.push(...(await validateGeneratedFiles(root, pack, effectiveEpics, effectiveState)));
		issues.push(...(await validateCompletionEvidence(root, effectiveEpics)));
	}
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
	if (!epic.approved || (epic.status !== 'approved' && epic.status !== 'active')) {
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
		.replaceAll('{{QUALITY_BAR}}', epic.qualityBar.map((item) => `- ${item}`).join('\n'))
		.replaceAll('{{GIT_WORKFLOW}}', epic.gitWorkflow.map((item) => `- ${item}`).join('\n'))
		.replaceAll(
			'{{STATUS_AUTOMATION}}',
			epic.statusAutomation.map((item) => `- ${item}`).join('\n'),
		)
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

async function loadEffectiveWorkpack(root = repoRoot): Promise<{
	pack: RequirementPackage;
	state: WorkpackState;
	epics: EpicPacket[];
}> {
	const pack = await parseRequirementPackage(root);
	const state = await readWorkpackState(root);
	if (!state) {
		throw new Error(
			`Missing docs/planning/v2/${workpackStateFileName}. Run pnpm v2:workpack:generate.`,
		);
	}
	const epics = applyWorkpackState(buildEpicPackets(pack), normalizeWorkpackState(state));
	return { pack, state: normalizeWorkpackState(state), epics };
}

async function assertWorkpackValid(root = repoRoot): Promise<void> {
	const issues = await validateWorkpack(root);
	if (issues.length === 0) return;
	const details = issues
		.slice(0, 8)
		.map((issue) => `- ${issue.file}: ${issue.message}`)
		.join('\n');
	throw new Error(
		`v2 workpack validation failed; prompt generation is blocked until drift is fixed.\n${details}`,
	);
}

export async function updateEpicStatus(
	root: string,
	epicId: string,
	status: EpicStatus,
	options: { evidenceFile?: string } = {},
): Promise<{ epic: EpicPacket; epics: EpicPacket[]; state: WorkpackState }> {
	const pack = await parseRequirementPackage(root);
	const baseEpics = buildEpicPackets(pack);
	if (!baseEpics.some((epic) => epic.id === epicId)) {
		throw new Error(`Unknown epic id: ${epicId}`);
	}

	const currentState = await ensureWorkpackState(root);
	const approved = isApprovedStatus(status);
	const overrides = currentState.epics.filter((epic) => epic.id !== epicId);
	const override: EpicStateOverride = { id: epicId };
	if (status !== currentState.defaults.status) {
		override.status = status;
	}
	if (approved !== currentState.defaults.approved) {
		override.approved = approved;
	}
	if (status === 'complete') {
		const evidenceFile = options.evidenceFile ?? `docs/planning/v2/epics/${epicId}.completion.md`;
		try {
			await fs.access(path.resolve(root, evidenceFile));
		} catch {
			throw new Error(
				`Completion evidence file is required before marking complete: ${evidenceFile}`,
			);
		}
		override.completionEvidenceFile = evidenceFile;
	}

	if (
		override.status ||
		override.approved !== undefined ||
		override.completionEvidenceFile ||
		override.notes
	) {
		overrides.push(override);
	}
	const nextState = normalizeWorkpackState({
		...currentState,
		epics: overrides,
	});
	await writeWorkpackState(root, nextState);
	const result = await generateWorkpack(root);
	const epic = result.epics.find((entry) => entry.id === epicId);
	if (!epic) throw new Error(`Epic disappeared during generation: ${epicId}`);
	return { epic, epics: result.epics, state: result.state };
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
	const { pack, epics, state } = await loadEffectiveWorkpack();
	console.log(statusDocument(pack, epics, state).trimEnd());
}

async function runNext(): Promise<void> {
	const { pack, epics, state } = await loadEffectiveWorkpack();
	const nextEpic = findNextEpic(epics, state.precedence);
	console.log(
		YAML.stringify({
			nextEpic: nextEpicStatusBlock(nextEpic),
			metrics: buildWorkpackMetrics(pack, epics),
		}).trimEnd(),
	);
}

function getFlagValue(args: string[], flag: string): string | undefined {
	const index = args.indexOf(flag);
	if (index === -1) return undefined;
	return args[index + 1];
}

// Best-effort clipboard tools by platform. The first one that exists and exits
// cleanly wins; missing tools are skipped so prompt generation never fails just
// because no clipboard utility is installed.
function clipboardCandidates(): Array<{ cmd: string; args: string[] }> {
	if (process.platform === 'darwin') return [{ cmd: 'pbcopy', args: [] }];
	if (process.platform === 'win32') return [{ cmd: 'clip', args: [] }];
	const wayland = { cmd: 'wl-copy', args: [] };
	const x11 = [
		{ cmd: 'xclip', args: ['-selection', 'clipboard'] },
		{ cmd: 'xsel', args: ['--clipboard', '--input'] },
	];
	return process.env.WAYLAND_DISPLAY ? [wayland, ...x11] : [...x11, wayland];
}

async function copyToClipboard(text: string): Promise<string | null> {
	for (const candidate of clipboardCandidates()) {
		const copied = await new Promise<boolean>((resolve) => {
			const child = spawn(candidate.cmd, candidate.args, {
				stdio: ['pipe', 'ignore', 'ignore'],
			});
			child.on('error', () => resolve(false));
			child.on('close', (code) => resolve(code === 0));
			child.stdin.on('error', () => resolve(false));
			child.stdin.end(text);
		});
		if (copied) return candidate.cmd;
	}
	return null;
}

async function runPrompt(args: string[]): Promise<void> {
	const epicId = getFlagValue(args, '--epic');
	const useNext = args.includes('--next');
	if (!epicId && !useNext) {
		throw new Error('Usage: pnpm v2:prompt -- --epic <epic-id> or pnpm v2:prompt -- --next');
	}
	await assertWorkpackValid();
	let epic: EpicPacket | null;
	if (useNext) {
		const { epics, state } = await loadEffectiveWorkpack();
		epic = findNextEpic(epics, state.precedence);
	} else {
		epic = await loadEpicById(epicId as string);
	}
	if (!epic) {
		throw new Error('No approved or active epic is ready for prompt generation.');
	}
	const template = await fs.readFile(path.join(templatesDir, 'epic-coder.prompt.md'), 'utf-8');
	const rendered = renderPrompt(epic, template);
	console.log(rendered);
	// Copy the prompt to the clipboard by default so the next epic is one paste
	// away. Diagnostics go to stderr to keep stdout pipe-clean. Opt out with --no-copy.
	if (!args.includes('--no-copy')) {
		const tool = await copyToClipboard(rendered);
		if (tool) {
			console.error(`📋 Copied ${epic.id} prompt to clipboard via ${tool}.`);
		} else {
			console.error(
				'Clipboard copy skipped: no wl-copy/xclip/xsel/pbcopy found. Pass --no-copy to silence.',
			);
		}
	}
}

function parseEpicStatus(value: string | undefined): EpicStatus {
	if (!value || !epicStatuses.includes(value as EpicStatus)) {
		throw new Error(`--status must be one of: ${epicStatuses.join(', ')}`);
	}
	return value as EpicStatus;
}

async function runSetStatus(args: string[]): Promise<void> {
	const epicId = getFlagValue(args, '--epic');
	if (!epicId) {
		throw new Error('Usage: pnpm v2:workpack:set-status -- --epic <epic-id> --status <status>');
	}
	const status = parseEpicStatus(getFlagValue(args, '--status'));
	const evidenceFile = getFlagValue(args, '--evidence');
	const result = await updateEpicStatus(repoRoot, epicId, status, { evidenceFile });
	console.log(
		`set ${result.epic.id} to ${result.epic.status}; regenerated ${result.epics.length} v2 epic packet(s)`,
	);
}

async function runComplete(args: string[]): Promise<void> {
	const epicId = getFlagValue(args, '--epic');
	if (!epicId) {
		throw new Error('Usage: pnpm v2:workpack:complete -- --epic <epic-id> [--evidence <file>]');
	}
	const result = await updateEpicStatus(repoRoot, epicId, 'complete', {
		evidenceFile: getFlagValue(args, '--evidence'),
	});
	console.log(
		`completed ${result.epic.id}; regenerated status, metrics, and ${result.epics.length} epic packet(s)`,
	);
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
	if (command === 'next') {
		await runNext();
		return;
	}
	if (command === 'prompt') {
		await runPrompt(args);
		return;
	}
	if (command === 'set-status') {
		await runSetStatus(args);
		return;
	}
	if (command === 'complete') {
		await runComplete(args);
		return;
	}
	throw new Error(
		'Usage: pnpm v2:workpack:<generate|validate|status|next|set-status|complete> or pnpm v2:prompt -- --epic <id|--next>',
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
