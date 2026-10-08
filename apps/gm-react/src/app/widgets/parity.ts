import ts from 'typescript';
import type * as Core from '@dndtools/core';
import {
	dispatchCommand,
	exportWidgetPackage,
	findPackageRecordForWidgetType,
	screenMetaOf,
	widgetPackageForkIdentity,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type WidgetCommandExecutor,
	type WidgetDataQuerySource,
	type WidgetIntentKind,
} from '@dndtools/core';
import { buildPackage, readPackage, widgetEditTarget } from '../widgetBuilder/draft';
import { hasBuiltinBody, type BuiltinWidgetType } from './builtin';

/**
 * RC-WID-5.5: every fresh default widget must use a builder-editable public definition
 * whose first export/import/export preserves bytes, and every builtin dependency must be
 * public. The checkers report every violation; the test compares that list to the exact
 * debt ledger below (PARITY_DEBT_LEDGER). See WIDGETS.md section 6.1.
 * State access uses syntax analysis; commands, imports and routes use source scans.
 */

/** One thing a builtin body takes from the core or the app. */
export type ParityUse =
	/** A value import from `@dndtools/core` that reads vault state. */
	| `read:${string}`
	/** A path into the vault state read directly (`runtime.state.session.timers`). */
	| `state:${string}`
	/** A core command dispatched (directly, or through `widget.dispatch-command`). */
	| `command:${string}`
	/** An in-app route navigated to. */
	| `route:${string}`;

export interface BuiltinBodyParity {
	/** Query sources whose resolver reads cover what the body reads. */
	queries: readonly WidgetDataQuerySource[];
	/**
	 * Commands the body dispatches that a GM-built widget's descriptor can also run, named as a
	 * descriptor names them (`timer.start` is a widget command the core runs by name).
	 */
	commands: readonly string[];
	/** Intent kinds that take a GM-built widget where the body navigates. */
	intents: readonly WidgetIntentKind[];
}

/**
 * Core value imports that read no vault state: constants and pure functions over a value the body
 * already holds. Anything else imported from the core is a read and must be covered.
 */
export const CORE_PURE_HELPERS = [
	// A field key, not data.
	'VAULT_OBJECT_SUBTYPE_KEY',
	// Parses a dice expression string.
	'parseDiceExpression',
	// Derives the turn model from a system package the body already read.
	'resolveTurnModel',
	// Formats a timer record the body already read (`state:session.timers`).
	'getTimerCountdown',
] as const satisfies readonly (keyof typeof Core)[];

/**
 * The core command each executor runs for a template widget (`widget.dispatch-command`). The
 * counter executors and `show` write the placed instance's own configuration, not a core command.
 */
export const EXECUTOR_CORE_COMMANDS: Readonly<Record<WidgetCommandExecutor, string | null>> = {
	roll: 'dice.roll',
	advance: null,
	tick: null,
	reset: null,
	'set-value': null,
	show: null,
	'mark-complete': 'content.update-object',
	'write-note-line': 'content.update-item',
	start: 'timer.start',
	pause: 'timer.pause',
	resume: 'timer.resume',
};

/** The core commands a GM-built widget can reach: run by name, or through an executor. */
export function publicWidgetCommands(namedCommands: readonly string[]): ReadonlySet<string> {
	const viaExecutor = Object.values(EXECUTOR_CORE_COMMANDS).filter(
		(command): command is string => command !== null,
	);
	return new Set([...namedCommands, ...viaExecutor]);
}

/** Where each intent kind can take its viewer (WIDGETS.md §2.1), as route roots. */
export function intentRoutes(openRoutes: readonly string[]): Record<WidgetIntentKind, string[]> {
	return {
		'open-screen': ['/scene'],
		'open-entity': ['/characters', '/atlas', '/knowledge', '/campaign'],
		'open-route': [...openRoutes],
		create: ['/scenes', '/characters', '/atlas', '/knowledge', '/board'],
		'open-settings': ['/settings'],
	};
}

/**
 * Modules outside `builtin/` the bodies import, with what each export takes from the core. Most are
 * presentational (the design system, i18n, layout kits) and take nothing. A body importing a module
 * missing here fails, so a read cannot hide one directory up; the test also scans each listed module
 * and requires its own uses to be the ones declared against its exports.
 */
export const SHARED_MODULE_USES: Readonly<
	Record<string, Readonly<Record<string, readonly ParityUse[]>>>
> = {
	'../../../ds': {},
	'../../../i18n': {},
	// `useRuntime` hands over the runtime; what a body does with it is scanned in the body itself.
	'../../../runtime/RuntimeContext': {},
	'../../widget-body-kit': { useSessionOnlyReason: ['state:session.workflow'] },
	'../../useViewport': {},
	'../../screen-kit': {},
	'../../combat/HpKeypadSheet': {},
	'../../map/canvas/MapCanvas': {},
	'../../map/mapVocab': {},
	'../../mapGeometry': {},
	'../../markdown/render': {},
};

/**
 * Vault state every template renderer is handed whatever it queries: the viewer's own actor record,
 * which `WidgetTemplateData.isDm` and the query audience gate carry. Only the slice itself is
 * covered: a field picked out of an actor record (`permissions.actors.<dynamic>.role`) is a deeper
 * path and a finding of its own.
 */
export const VIEWER_CONTEXT_PATHS: readonly string[] = ['permissions.actors'];

/* ── The declared map ──────────────────────────────────────────────────────────────────────────── */

export const BUILTIN_PARITY: Readonly<Record<BuiltinWidgetType, BuiltinBodyParity>> = {
	// A note or handout draws its own configuration (the text the Inspector wrote).
	note: { queries: [], commands: [], intents: [] },
	handout: { queries: [], commands: [], intents: [] },
	dice: { queries: ['dice-history'], commands: ['dice.roll'], intents: [] },
	timer: {
		queries: [],
		commands: ['timer.start', 'timer.pause', 'timer.resume', 'timer.advance', 'timer.reset'],
		intents: [],
	},
	audio: { queries: [], commands: [], intents: [] },
	'initiative-tracker': { queries: ['current-combatants', 'campaign'], commands: [], intents: [] },
	character: { queries: ['campaign'], commands: [], intents: [] },
	map: { queries: ['maps', 'session-state'], commands: [], intents: ['open-entity'] },
	'quick-reference': { queries: ['content-objects'], commands: [], intents: [] },
	prep: { queries: ['notes'], commands: [], intents: [] },
	session: { queries: [], commands: [], intents: [] },
	'getting-started': { queries: [], commands: [], intents: [] },
	// The GM screen's widget count is a `screens` row's.
	tools: { queries: ['screens'], commands: [], intents: [] },
	'data-hub': { queries: ['table-scenes', 'vault-counts'], commands: [], intents: [] },
	atlas: { queries: ['maps'], commands: [], intents: [] },
	characters: { queries: ['visible-characters'], commands: [], intents: [] },
	'player-views': { queries: [], commands: [], intents: [] },
	combat: { queries: ['current-combatants'], commands: [], intents: [] },
	notes: { queries: ['notes'], commands: [], intents: [] },
	search: { queries: [], commands: [], intents: [] },
};

/* ── Findings ──────────────────────────────────────────────────────────────────────────────────── */

/** A builtin body uses something no GM-built widget can reach. */
export function privateUseFinding(type: string, use: ParityUse): string {
	return `${type}: uses ${use}, which no descriptor, intent or query source exposes to a GM-built widget`;
}

/** A widget on a fresh default screen draws through a hand-written body. */
export function builtinOnScreenFinding(type: string): string {
	return `${type}: draws through a hand-written builtin body the builder cannot express`;
}

/** A default-screen definition changes on its first trip through the builder. */
export function roundTripFinding(type: string): string {
	return `${type}: export → builder → install → export is not byte-identical`;
}

/* ── The debt ledger ───────────────────────────────────────────────────────────────────────────── */

/** The stories split out of RC-WID-5.5 to repay the findings the gate found on landing. */
export type ParityRepairStory = 'RC-WID-5.6' | 'RC-WID-5.7';

export interface ParityDebt {
	/** The finding, exactly as the checker reports it. */
	finding: string;
	repaidBy: ParityRepairStory;
}

const owedBy =
	(repaidBy: ParityRepairStory) =>
	(finding: string): ParityDebt => ({ finding, repaidBy });
const wid56 = owedBy('RC-WID-5.6');
const wid57 = owedBy('RC-WID-5.7');
const privateUses = (type: BuiltinWidgetType, uses: readonly ParityUse[]) =>
	uses.map((use) => wid57(privateUseFinding(type, use)));

/**
 * Every finding the gate reports today, one entry each, with the story that repays it. This is an
 * exact ratchet like the raw-style allow-lists: the test fails on a finding missing from here and on
 * an entry that no longer reproduces, so a repair must delete its entries and nothing new can be
 * added without a reviewed edit to this list. The checker itself never consults it.
 */
export const PARITY_DEBT_LEDGER: readonly ParityDebt[] = [
	// RC-WID-5.7: no query source or descriptor reaches these yet. The board tiles (map, initiative,
	// dice, timer, audio, quick reference, prep) were kept as builtin targets by SCREENS_PARITY
	// (BD-20–BD-26, SE-18); the legacy hub bodies read the rest.
	// The session timer the start/pause/resume executors run (BD-23).
	...privateUses('timer', ['state:session.timers', 'state:session.timers.<dynamic>']),
	// What is playing (BD-24, SE-18).
	...privateUses('audio', [
		'read:getSessionAudioView',
		'state:audio.assets',
		'state:audio.assets.<dynamic>',
		'state:audio.assets.<dynamic>.title',
		'state:audio.sources',
		'state:audio.sources.<dynamic>',
		'state:audio.sources.<dynamic>.displayName',
		'state:session.audioPlayback',
	]),
	// Combat writes (G-11) and other actors' roles.
	...privateUses('initiative-tracker', [
		'command:combat.advance-turn',
		'command:combat.apply-resource',
		'command:combat.set-combatant-visibility',
		'state:permissions.actors.<dynamic>',
		'state:permissions.actors.<dynamic>.role',
	]),
	// One bound character (visible-characters and party only list them).
	...privateUses('character', ['read:getCharacterForActor']),
	// The map view, its layers and delivered maps; rebinding itself; staging and projecting (BD-20,
	// SE-19); the players to project to.
	...privateUses('map', [
		'command:scene.configure-widget',
		'command:session.project-active-map',
		'command:session.set-active-map',
		'read:deliveredMapIdsForActor',
		'read:getMapViewForActor',
		'read:queryMapLayers',
		'state:maps.assets',
		'state:maps.maps',
		'state:maps.maps.<dynamic>',
		'state:maps.maps.<dynamic>.assetIds',
		'state:permissions.actors.<dynamic>',
		'state:permissions.actors.<dynamic>.role',
		'state:scenes.scenes',
	]),
	...privateUses('session', ['read:getSessionStatusStrip']),
	...privateUses('getting-started', ['read:resolveOnboarding']),
	// Which screen is the GM screen, the layout presets and the safe point.
	...privateUses('tools', [
		'state:commandCenter.autoSave',
		'state:commandCenter.homeSceneId',
		'state:commandCenter.presets',
		'state:scenes.scenes.<dynamic>',
		'state:scenes.scenes.<dynamic>.widgets',
		'state:scenes.scenes.<dynamic>.widgets.length',
	]),
	...privateUses('atlas', ['read:getActiveMapProjectionSummary']),
	...privateUses('player-views', ['read:getPlayerViewController']),
	...privateUses('combat', ['read:listEncountersForActor']),
	...privateUses('search', ['read:getSavedSearchesForActor']),

	// RC-WID-5.7: the fresh GM board (`ensureHomeBoard`, null origin) provisions builtin bodies.
	...(
		[
			'map',
			'initiative-tracker',
			'dice',
			'timer',
			'audio',
			'quick-reference',
			'prep',
		] as const satisfies readonly BuiltinWidgetType[]
	).map((type) => wid57(builtinOnScreenFinding(type))),

	// RC-WID-5.6: the Command Center definitions change on their first builder round trip.
	...['home-hero', 'home-scenes', 'home-create', 'home-manage', 'home-library'].map((type) =>
		wid56(roundTripFinding(type)),
	),
];

/** Where the findings and the ledger disagree; both lists empty means the gate passes. */
export function compareToLedger(
	findings: readonly string[],
	ledger: readonly ParityDebt[] = PARITY_DEBT_LEDGER,
): { unledgered: string[]; stale: string[] } {
	const owed = new Set(ledger.map((debt) => debt.finding));
	const found = new Set(findings);
	return {
		unledgered: [...found].filter((finding) => !owed.has(finding)),
		stale: [...owed].filter((finding) => !found.has(finding)),
	};
}

/* ── Source scanning ───────────────────────────────────────────────────────────────────────────── */

/**
 * The source with comments blanked out. String literals are kept (they carry command types), or
 * blanked too with `blankStrings`, so a scan for identifiers cannot match inside one.
 */
export function stripComments(source: string, blankStrings = false): string {
	let out = '';
	let quote: string | null = null;
	for (let i = 0; i < source.length; i += 1) {
		const char = source[i]!;
		const next = source[i + 1];
		if (quote) {
			const keep = (text: string) => (blankStrings && text !== quote ? ' ' : text);
			out += keep(char);
			if (char === '\\') {
				out += next === undefined ? '' : keep(next);
				i += 1;
			} else if (char === quote) quote = null;
			continue;
		}
		if (char === '/' && next === '/') {
			while (i < source.length && source[i] !== '\n') i += 1;
			out += '\n';
			continue;
		}
		if (char === '/' && next === '*') {
			const end = source.indexOf('*/', i + 2);
			const comment = source.slice(i, end < 0 ? source.length : end + 2);
			out += comment.replace(/[^\n]/g, ' ');
			i = end < 0 ? source.length : end + 1;
			continue;
		}
		if (char === "'" || char === '"' || char === '`') quote = char;
		out += char;
	}
	return out;
}

const MEMBER_CHAIN = String.raw`((?:\??\.[A-Za-z_$][\w$]*)*)`;

function chainPath(chain: string): string[] {
	return chain
		.split('.')
		.map((part) => part.replace(/\?$/, ''))
		.filter(Boolean);
}

export interface ModuleImports {
	/** Value names imported from `@dndtools/core`. */
	core: string[];
	/** `./X` imports inside `builtin/`, by module name. */
	local: string[];
	/** Every other relative import: module specifier → value names. */
	shared: Map<string, string[]>;
}

/** The value imports of one module (type-only imports and specifiers are left out). */
export function moduleImports(source: string): ModuleImports {
	const result: ModuleImports = { core: [], local: [], shared: new Map() };
	const pattern = /import\s+(type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*'([^']+)'/g;
	for (const match of stripComments(source).matchAll(pattern)) {
		if (match[1]) continue;
		const names = [
			...(match[2] ? [match[2]] : []),
			...(match[3] ?? '')
				.split(',')
				.map((name) => name.trim())
				.filter((name) => name && !name.startsWith('type '))
				.map((name) => name.split(/\s+as\s+/)[0]!.trim()),
		];
		const from = match[4]!;
		if (from === '@dndtools/core') result.core.push(...names);
		else if (from.startsWith('./')) result.local.push(from.slice(2));
		else if (from.startsWith('.') && names.length > 0) result.shared.set(from, names);
	}
	return result;
}

/**
 * What one module takes from the core, by the idioms this directory uses: core value imports that
 * are not pure helpers, vault state paths deeper than a whole slice (a slice handed to an
 * actor-scoped read is that read's input; a field picked out of it is a read of its own), dispatched
 * command types, and in-app navigation.
 */
export function extractModuleUses(source: string): Set<ParityUse> {
	const code = stripComments(source);
	const uses = new Set<ParityUse>();
	const pure: ReadonlySet<string> = new Set(CORE_PURE_HELPERS);
	for (const name of moduleImports(source).core) if (!pure.has(name)) uses.add(`read:${name}`);

	const addPath = (segments: string[]) => {
		if (segments[0] !== '<runtime>' && segments.length >= 2)
			uses.add(`state:${segments.join('.')}`);
	};
	// Resolve ordinary state aliases and destructuring through syntax, rather than matching
	// only literal runtime.state chains. Iterate to cover aliases of aliases.
	const tree = ts.createSourceFile(
		'body.tsx',
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const aliases = new Map<string, string[]>();
	const memberPath = (base: string[], key: string): string[] | undefined => {
		if (base[0] !== '<runtime>') return [...base, key];
		if (key === '<dynamic>') uses.add('state:<dynamic-runtime-member>');
		return key === 'state' ? [] : undefined;
	};
	const pathOf = (node: ts.Node): string[] | undefined => {
		if (
			ts.isParenthesizedExpression(node) ||
			ts.isAsExpression(node) ||
			ts.isNonNullExpression(node)
		)
			return pathOf(node.expression);
		if (ts.isIdentifier(node))
			return node.text === 'runtime' ? ['<runtime>'] : aliases.get(node.text);
		if (ts.isPropertyAccessExpression(node)) {
			const base = pathOf(node.expression);
			return base && memberPath(base, node.name.text);
		}
		if (ts.isElementAccessExpression(node)) {
			const base = pathOf(node.expression);
			if (base)
				return memberPath(
					base,
					ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : '<dynamic>',
				);
		}
		return undefined;
	};
	const bind = (name: ts.BindingName, path: string[]) => {
		if (ts.isIdentifier(name)) {
			const previous = aliases.get(name.text);
			if (!previous) aliases.set(name.text, path);
			else if (previous.join('.') !== path.join('.')) uses.add('state:<ambiguous-alias>');
		} else {
			for (const element of name.elements) {
				if (!ts.isBindingElement(element)) continue;
				if (element.dotDotDotToken) {
					uses.add('state:<rest-alias>');
					continue;
				}
				const key = element.propertyName ?? element.name;
				const member = memberPath(
					path,
					ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : '<dynamic>',
				);
				if (member) bind(element.name, member);
			}
		}
	};
	let previousSize = -1;
	while (previousSize !== aliases.size) {
		previousSize = aliases.size;
		const visit = (node: ts.Node) => {
			if (ts.isVariableDeclaration(node) && node.initializer) {
				const path = pathOf(node.initializer);
				if (path) bind(node.name, path);
			}
			if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
				const path = pathOf(node.right);
				if (path) {
					if (ts.isIdentifier(node.left)) bind(node.left, path);
					else if (
						path[0] !== '<runtime>' ||
						ts.isObjectLiteralExpression(node.left) ||
						ts.isArrayLiteralExpression(node.left)
					)
						uses.add('state:<unsupported-assignment>');
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(tree);
	}
	const collect = (node: ts.Node) => {
		const path = pathOf(node);
		if (path) addPath(path);
		ts.forEachChild(node, collect);
	};
	collect(tree);

	const command =
		/(?:\b(?:type|command):\s*|\bonCommand\??\.?\(\s*|\bop\(\s*|\.includes\(\s*)'([a-z][a-z-]*(?:\.[a-z][a-z-]*)+)'/g;
	for (const match of code.matchAll(command)) uses.add(`command:${match[1]}`);

	const route =
		/(?:location\.hash\s*=\s*|navigate\(\s*|\bto=\{?\s*|href=\{?\s*)[`'"]#?(\/[a-z0-9/-]*)/g;
	for (const match of code.matchAll(route)) uses.add(`route:${match[1]}`);
	return uses;
}

/**
 * The module each builtin type renders, read from the `WidgetBody` switch in `builtin/index.tsx`:
 * the case labels up to a `return <Component`, and the `./Module` that component is imported from.
 */
export function builtinBodyModules(indexSource: string): Map<string, string> {
	const code = stripComments(indexSource);
	const componentModule = new Map<string, string>();
	for (const match of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/(\w+)'/g))
		for (const name of match[1]!.split(','))
			componentModule.set(name.trim().split(/\s+as\s+/)[0]!, match[2]!);
	const body = code.slice(code.indexOf('export function WidgetBody'));
	const modules = new Map<string, string>();
	let pending: string[] = [];
	for (const line of body.split('\n')) {
		const label = /^\s*case '([^']+)':/.exec(line);
		if (label) pending.push(label[1]!);
		const render = /return\s*<(\w+)/.exec(line);
		if (render && pending.length > 0) {
			const module = componentModule.get(render[1]!);
			for (const type of pending) if (module) modules.set(type, module);
			pending = [];
		}
	}
	return modules;
}

/**
 * Everything a body uses: its module, the `builtin/` modules it imports (transitively), and what
 * the shared modules it imports declare against the names it takes. Unknown shared modules are
 * reported, not skipped.
 */
export function extractBodyUses(
	entryModule: string,
	readModule: (name: string) => string,
): { uses: Set<ParityUse>; modules: string[]; unknownShared: string[] } {
	const uses = new Set<ParityUse>();
	const unknownShared = new Set<string>();
	const seen = new Set<string>();
	const queue = [entryModule];
	while (queue.length > 0) {
		const name = queue.shift()!;
		if (seen.has(name)) continue;
		seen.add(name);
		const source = readModule(name);
		for (const use of extractModuleUses(source)) uses.add(use);
		const imports = moduleImports(source);
		queue.push(...imports.local);
		for (const [specifier, names] of imports.shared) {
			const declared = SHARED_MODULE_USES[specifier];
			if (!declared) {
				unknownShared.add(specifier);
				continue;
			}
			for (const imported of names) for (const use of declared[imported] ?? []) uses.add(use);
		}
	}
	return { uses, modules: [...seen].sort(), unknownShared: [...unknownShared].sort() };
}

/* ── What the query sources expose ─────────────────────────────────────────────────────────────── */

export interface SourceExposure {
	reads: Set<string>;
	paths: Set<string>;
}

interface TopLevelFunction {
	name: string;
	text: string;
}

function topLevelFunctions(code: string): TopLevelFunction[] {
	const functions: TopLevelFunction[] = [];
	const lines = code.split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const head = /^(?:export\s+)?function\s+(\w+)/.exec(lines[i]!);
		if (!head) continue;
		let end = i + 1;
		while (end < lines.length && !/^\}/.test(lines[end]!)) end += 1;
		functions.push({ name: head[1]!, text: lines.slice(i, end + 1).join('\n') });
		i = end;
	}
	return functions;
}

/**
 * What each query source reads, from the resolver modules (`dataEnvironment.ts`, `homeSources.ts`):
 * the core reads and `state.` paths named in the source's `case` block, plus in the module's own
 * helper functions that block calls (transitively). Switch functions over sources are not helpers.
 */
export function deriveQueryExposure(
	resolverSources: readonly string[],
	knownSources: readonly string[],
): Map<string, SourceExposure> {
	const exposure = new Map<string, SourceExposure>();
	for (const source of resolverSources) {
		const code = stripComments(source);
		const coreNames = moduleImports(source).core;
		const helpers = topLevelFunctions(code).filter((fn) => !/^\s*case '[a-z-]+':/m.test(fn.text));
		const collect = (text: string, into: SourceExposure, visited: Set<string>) => {
			for (const name of coreNames)
				if (new RegExp(String.raw`\b${name}\b`).test(text)) into.reads.add(name);
			for (const match of text.matchAll(new RegExp(String.raw`\bstate${MEMBER_CHAIN}`, 'g'))) {
				const segments = chainPath(match[1]!);
				if (segments.length >= 2) into.paths.add(segments.join('.'));
			}
			for (const helper of helpers) {
				if (visited.has(helper.name) || !new RegExp(String.raw`\b${helper.name}\(`).test(text))
					continue;
				visited.add(helper.name);
				collect(helper.text, into, visited);
			}
		};
		const lines = code.split('\n');
		for (let i = 0; i < lines.length; i += 1) {
			if (!/^\s*case '[a-z-]+':/.test(lines[i]!)) continue;
			const labels: string[] = [];
			while (i < lines.length) {
				const label = /^\s*case '([a-z-]+)':\s*(\{?)\s*$/.exec(lines[i]!);
				if (!label) break;
				labels.push(label[1]!);
				i += 1;
				if (label[2]) break;
			}
			let end = i;
			while (
				end < lines.length &&
				!/^\s*case '[a-z-]+':/.test(lines[end]!) &&
				!/^\s*default:/.test(lines[end]!) &&
				!/^\}/.test(lines[end]!)
			)
				end += 1;
			const block = lines.slice(i, end).join('\n');
			for (const label of labels) {
				if (!knownSources.includes(label)) continue;
				const into = exposure.get(label) ?? { reads: new Set(), paths: new Set() };
				collect(block, into, new Set());
				exposure.set(label, into);
			}
			i = end - 1;
		}
	}
	return exposure;
}

/* ── The check ─────────────────────────────────────────────────────────────────────────────────── */

export interface ParityInputs {
	/** Each builtin type's extracted uses. */
	bodies: ReadonlyMap<string, ReadonlySet<ParityUse>>;
	exposure: ReadonlyMap<string, SourceExposure>;
	publicCommands: ReadonlySet<string>;
	routesByIntent: Readonly<Record<WidgetIntentKind, readonly string[]>>;
	knownSources: readonly string[];
	declared?: Readonly<Record<string, BuiltinBodyParity>>;
}

/** Every way the builtin bodies break the gate, one line each; empty when they pass. */
export function checkBuiltinParity(inputs: ParityInputs): string[] {
	const declared: Readonly<Record<string, BuiltinBodyParity | undefined>> =
		inputs.declared ?? BUILTIN_PARITY;
	const problems: string[] = [];
	for (const type of inputs.bodies.keys())
		if (!declared[type]) problems.push(`${type}: has a builtin body but no parity entry`);
	for (const [type, entry] of Object.entries(declared)) {
		if (!entry) continue;
		const uses = inputs.bodies.get(type);
		if (!uses) {
			problems.push(`${type}: has a parity entry but no builtin body`);
			continue;
		}
		const usedSurface = new Set<string>();
		for (const query of entry.queries)
			if (!inputs.knownSources.includes(query))
				problems.push(`${type}: declares unknown query source ${query}`);
		for (const command of entry.commands)
			if (!inputs.publicCommands.has(command))
				problems.push(`${type}: declares ${command}, which no widget descriptor can run`);

		const coveredBy = (use: ParityUse): string | null => {
			const [kind, value] = [use.slice(0, use.indexOf(':')), use.slice(use.indexOf(':') + 1)];
			if (kind === 'state' && VIEWER_CONTEXT_PATHS.includes(value)) return 'viewer';
			if (kind === 'read' || kind === 'state') {
				const query = entry.queries.find((source) => {
					const exposed = inputs.exposure.get(source);
					return kind === 'read' ? exposed?.reads.has(value) : exposed?.paths.has(value);
				});
				return query ? `query:${query}` : null;
			}
			if (kind === 'command')
				return (entry.commands as readonly string[]).includes(value) &&
					inputs.publicCommands.has(value)
					? `command:${value}`
					: null;
			const intent = entry.intents.find((kindName) =>
				inputs.routesByIntent[kindName].includes(value),
			);
			return intent ? `intent:${intent}` : null;
		};

		for (const use of [...uses].sort()) {
			const cover = coveredBy(use);
			if (cover) usedSurface.add(cover);
			else problems.push(privateUseFinding(type, use));
		}
		for (const query of entry.queries)
			if (!usedSurface.has(`query:${query}`))
				problems.push(`${type}: declares query source ${query} but reads nothing it exposes`);
		for (const command of entry.commands)
			if (!usedSurface.has(`command:${command}`))
				problems.push(`${type}: declares command ${command} but never dispatches it`);
		for (const intent of entry.intents)
			if (!usedSurface.has(`intent:${intent}`))
				problems.push(`${type}: declares intent ${intent} but never navigates through it`);
	}
	return problems;
}

/* ── Default screens ───────────────────────────────────────────────────────────────────────────── */

/** A package as the Extensions export writes it to a file (`downloadJsonFile`). */
export function exportedBytes(
	state: CoreStateSlice,
	env: CoreEnvironment,
	packageId: string,
): string | null {
	const exported = exportWidgetPackage(state.widgets, env, packageId);
	return 'kind' in exported ? null : JSON.stringify(exported.package, null, '\t');
}

/**
 * One trip of a package file through the builder: read it as the Data step does, save it, install
 * the save beside what `state` holds and export it again. The bytes come back as written; nothing
 * is normalised for the comparison.
 */
export function builderRoundTrip(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	bytes: string,
): { bytes: string | null; error?: string } {
	const saved = buildPackage(readPackage(JSON.parse(bytes), 'proposed'));
	const installed = dispatchCommand(state, env, {
		type: 'widget.package.install',
		actorId,
		payload: { package: saved },
	} as CoreCommand);
	if (installed.status !== 'accepted') return { bytes: null, error: installed.rejection.message };
	return { bytes: exportedBytes(installed.nextState, env, saved.id) };
}

/** JSON with object keys sorted, so two definitions compare by content, not key order. */
function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, inner: unknown) =>
		inner && typeof inner === 'object' && !Array.isArray(inner)
			? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
			: inner,
	);
}

/**
 * Check fresh provisioning, including the GM board even though its origin is null.
 * Existing customized vaults are not input to this gate. Compare the original eligible
 * export to its FIRST builder import/save/install/export, without normalization.
 */
export function defaultScreenParityProblems(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
): string[] {
	const problems: string[] = [];
	const screens = Object.values(state.scenes.scenes).filter(
		(scene) =>
			screenMetaOf(scene).origin?.kind === 'default' ||
			scene.id === state.commandCenter.homeSceneId,
	);
	if (screens.length === 0) problems.push('no default screen is provisioned');
	const types = [
		...new Set(screens.flatMap((scene) => scene.widgets.map((widget) => widget.type))),
	];
	for (const type of types) {
		const record = findPackageRecordForWidgetType(state.widgets, type);
		const definition = record?.package.widgets.find((widget) => widget.type === type);
		if (!record || !definition) {
			problems.push(`${type}: no installed definition`);
			continue;
		}
		// The render slot lets a hand-written body win over the template a definition declares (most
		// system widgets declare one), so the body, not the declared runtime, decides.
		if (hasBuiltinBody(type)) {
			problems.push(builtinOnScreenFinding(type));
			continue;
		}
		const runtime = definition.renderEntrypoint?.runtime ?? 'builtin';
		if (runtime !== 'template' && runtime !== 'custom-html-js') {
			problems.push(`${type}: draws through a ${runtime} renderer the builder cannot express`);
			continue;
		}
		if (!widgetEditTarget(state, type)) {
			problems.push(`${type}: "Edit widget" cannot open it in the builder`);
			continue;
		}
		const identity = widgetPackageForkIdentity(state.widgets, type);
		const forked = dispatchCommand(state, env, {
			type: 'widget.package.fork',
			actorId,
			payload: { packageId: record.package.id, widgetType: type },
		} as CoreCommand);
		if (forked.status !== 'accepted') {
			problems.push(`${type}: the fork was refused (${forked.rejection.message})`);
			continue;
		}
		const copy = forked.nextState.widgets.packages[identity.packageId]?.package.widgets[0];
		const asShipped = copy && {
			...copy,
			type: definition.type,
			version: definition.version,
			displayName: definition.displayName,
			author: definition.author,
		};
		if (!asShipped || canonical(asShipped) !== canonical(definition))
			problems.push(`${type}: the GM's copy is not the shipped definition`);

		const exported = exportedBytes(forked.nextState, env, identity.packageId);
		if (!exported || !copy) {
			problems.push(`${type}: the copy cannot be exported`);
			continue;
		}
		// The ORIGINAL export against the FIRST round trip: a field the builder adds, drops or
		// reorders on its first import is a finding even if a second trip would be stable.
		const first = builderRoundTrip(state, env, actorId, exported);
		if (!first.bytes)
			problems.push(`${type}: the builder's save does not install (${first.error ?? 'no export'})`);
		else if (first.bytes !== exported) problems.push(roundTripFinding(type));
	}
	return problems;
}
