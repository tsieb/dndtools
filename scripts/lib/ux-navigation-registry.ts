import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { CANONICAL_NAVIGATION_SECTIONS } from '../../apps/v2/packages/core/src/queries/navigation-sections.ts';

/**
 * UX navigation/route registry contract checker.
 *
 * Validates docs/planning/v2/ux/navigation-registry.yaml — the ACCEPTED seven-section
 * global navigation model produced by UX-ARCH-product-architecture-and-ia-reconciliation —
 * against its own structural invariants and against the functional v2 canonical registry
 * ({@link CANONICAL_NAVIGATION_SECTIONS}). This is the "navigation lint fixture" that keeps
 * the affected docs, the route registry contract, and the functional registry in agreement
 * (epic acceptance criterion UX-ARCH-S01 AC1). It performs no mutation; it reports drift.
 */

export const UX_NAV_REGISTRY_PATH = 'docs/planning/v2/ux/navigation-registry.yaml';

/** The fixed canonical order of the seven global navigation destinations (UX-NAV-002). */
export const EXPECTED_GLOBAL_NAV_ORDER: readonly string[] = [
	'command-center',
	'session',
	'characters',
	'atlas',
	'campaign',
	'knowledge',
	'settings',
];

/** Capability/authoring sections that exist in the functional registry but are not global nav. */
export const EXPECTED_CAPABILITY_IDS: readonly string[] = ['scenes', 'audio', 'mcp'];

interface Availability {
	dm: boolean;
	player: boolean;
	observer: boolean;
}

interface GlobalNavEntry {
	id: string;
	order: number;
	title: string;
	routeRoot: string;
	icon: string;
	keyboardShortcut?: string;
	ariaCurrentLabel: string;
	announce: string;
	home?: boolean;
	last?: boolean;
	availability: Availability;
}

interface CapabilityEntry {
	id: string;
	classification: string;
	routeRoot: string;
	availability: Availability;
	homes: string[];
}

interface UxNavRegistry {
	globalNav: GlobalNavEntry[];
	capabilities: CapabilityEntry[];
}

function isAvailability(value: unknown): value is Availability {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.dm === 'boolean' &&
		typeof candidate.player === 'boolean' &&
		typeof candidate.observer === 'boolean'
	);
}

function sameAvailability(a: Availability, b: Availability): boolean {
	return a.dm === b.dm && a.player === b.player && a.observer === b.observer;
}

function pushDuplicates(problems: string[], label: string, values: string[]): void {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) {
			problems.push(`${label} "${value}" is duplicated.`);
		}
		seen.add(value);
	}
}

/**
 * Validate the UX navigation registry contract. Returns a list of human-readable problems;
 * an empty array means the contract is well-formed and agrees with the functional registry.
 */
export function validateUxNavigationRegistry(root = process.cwd()): string[] {
	const problems: string[] = [];

	let registry: UxNavRegistry;
	try {
		const raw = readFileSync(join(root, UX_NAV_REGISTRY_PATH), 'utf8');
		registry = YAML.parse(raw) as UxNavRegistry;
	} catch (error) {
		return [`Could not read/parse ${UX_NAV_REGISTRY_PATH}: ${(error as Error).message}`];
	}

	const globalNav = Array.isArray(registry.globalNav) ? registry.globalNav : [];
	const capabilities = Array.isArray(registry.capabilities) ? registry.capabilities : [];

	// --- Structural invariants of the global nav contract. ---
	if (globalNav.length !== EXPECTED_GLOBAL_NAV_ORDER.length) {
		problems.push(
			`globalNav must declare exactly ${EXPECTED_GLOBAL_NAV_ORDER.length} sections, found ${globalNav.length}.`,
		);
	}

	const actualOrderIds = globalNav.map((entry) => entry.id);
	if (actualOrderIds.join(',') !== EXPECTED_GLOBAL_NAV_ORDER.join(',')) {
		problems.push(
			`globalNav canonical order must be [${EXPECTED_GLOBAL_NAV_ORDER.join(', ')}], found [${actualOrderIds.join(', ')}].`,
		);
	}

	pushDuplicates(problems, 'globalNav id', actualOrderIds);
	pushDuplicates(
		problems,
		'globalNav routeRoot',
		globalNav.map((entry) => entry.routeRoot),
	);
	pushDuplicates(
		problems,
		'globalNav icon',
		globalNav.map((entry) => entry.icon),
	);
	pushDuplicates(
		problems,
		'globalNav keyboardShortcut',
		globalNav.flatMap((entry) => (entry.keyboardShortcut ? [entry.keyboardShortcut] : [])),
	);

	globalNav.forEach((entry, index) => {
		const where = `globalNav[${index}] (${entry.id ?? '<no-id>'})`;
		if (entry.order !== index + 1) {
			problems.push(`${where} order must be ${index + 1}, found ${String(entry.order)}.`);
		}
		if (typeof entry.routeRoot !== 'string' || !entry.routeRoot.startsWith('/')) {
			problems.push(`${where} routeRoot must start with "/".`);
		}
		if (!entry.icon) problems.push(`${where} is missing an icon.`);
		if (!entry.ariaCurrentLabel) problems.push(`${where} is missing ariaCurrentLabel.`);
		if (!entry.announce) problems.push(`${where} is missing an announce string.`);
		if (!isAvailability(entry.availability)) {
			problems.push(`${where} availability must declare dm/player/observer booleans.`);
		}
	});

	// First section is the Command Center home; last is Settings (UX-NAV-001, UX-NAV-002).
	const first = globalNav[0];
	if (first && (first.id !== 'command-center' || first.home !== true)) {
		problems.push('globalNav[0] must be the command-center home section (home: true).');
	}
	const homeCount = globalNav.filter((entry) => entry.home === true).length;
	if (homeCount !== 1) {
		problems.push(`exactly one globalNav home section is required, found ${homeCount}.`);
	}
	const last = globalNav[globalNav.length - 1];
	if (last && last.id !== 'settings') {
		problems.push('the last global nav section must be settings.');
	}

	// UX-NAV-002-S01 acceptance criterion: Alt+2 navigates to Session and announces "Session".
	const session = globalNav.find((entry) => entry.id === 'session');
	if (session) {
		if (session.order !== 2) problems.push('session must be the second global nav section.');
		if (session.keyboardShortcut !== 'Alt+2') {
			problems.push(`session keyboardShortcut must be "Alt+2", found "${String(session.keyboardShortcut)}".`);
		}
		if (session.announce !== 'Session') {
			problems.push(`session announce must be "Session", found "${String(session.announce)}".`);
		}
	}

	// --- Capability classification invariants. ---
	const capabilityIds = capabilities.map((entry) => entry.id);
	const expectedCapabilities = [...EXPECTED_CAPABILITY_IDS].sort();
	if ([...capabilityIds].sort().join(',') !== expectedCapabilities.join(',')) {
		problems.push(
			`capabilities must classify exactly [${EXPECTED_CAPABILITY_IDS.join(', ')}], found [${capabilityIds.join(', ')}].`,
		);
	}
	capabilities.forEach((entry) => {
		if (!Array.isArray(entry.homes) || entry.homes.length === 0) {
			problems.push(`capability "${entry.id}" must declare at least one durable home.`);
		}
		if (!entry.classification) {
			problems.push(`capability "${entry.id}" must declare a classification.`);
		}
	});

	// --- Agreement with the functional v2 canonical registry. ---
	const functionalById = new Map(CANONICAL_NAVIGATION_SECTIONS.map((s) => [s.id, s]));

	for (const entry of globalNav) {
		const fn = functionalById.get(entry.id);
		if (!fn) {
			problems.push(
				`globalNav id "${entry.id}" is not present in the functional registry (${'CANONICAL_NAVIGATION_SECTIONS'}).`,
			);
			continue;
		}
		if (fn.routeRoot !== entry.routeRoot) {
			problems.push(
				`globalNav "${entry.id}" routeRoot "${entry.routeRoot}" disagrees with functional registry "${fn.routeRoot}".`,
			);
		}
		if (isAvailability(entry.availability) && !sameAvailability(entry.availability, fn.availability)) {
			problems.push(
				`globalNav "${entry.id}" actor availability disagrees with the functional registry.`,
			);
		}
		if (entry.home === true && !fn.home) {
			problems.push(`globalNav "${entry.id}" is marked home but the functional registry is not.`);
		}
	}

	for (const entry of capabilities) {
		if (!functionalById.has(entry.id)) {
			problems.push(
				`capability "${entry.id}" is not present in the functional registry (${'CANONICAL_NAVIGATION_SECTIONS'}).`,
			);
		}
	}

	// Every functional section must be classified as exactly one of: global nav or capability.
	const classifiedIds = new Set<string>([...actualOrderIds, ...capabilityIds]);
	const functionalIds = new Set(functionalById.keys());
	for (const id of functionalIds) {
		if (!classifiedIds.has(id)) {
			problems.push(
				`functional registry section "${id}" is not classified in the UX navigation registry (add it to globalNav or capabilities).`,
			);
		}
	}
	for (const id of classifiedIds) {
		if (!functionalIds.has(id)) {
			problems.push(
				`UX navigation registry classifies "${id}" but no such functional registry section exists.`,
			);
		}
	}

	// Exactly one functional home, and it must be the UX home.
	const functionalHomes = CANONICAL_NAVIGATION_SECTIONS.filter((s) => s.home).map((s) => s.id);
	if (functionalHomes.length !== 1 || functionalHomes[0] !== 'command-center') {
		problems.push(
			`functional registry home must be exactly [command-center], found [${functionalHomes.join(', ')}].`,
		);
	}

	return problems;
}
