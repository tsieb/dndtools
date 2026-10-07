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
 * whose first export/import/export preserves bytes. Every builtin dependency must be
 * public; recorded gaps are diagnostics, never waivers. See WIDGETS.md section 6.1.
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
	/**
	 * What the body uses that no descriptor, intent or query source exposes yet, each with the gap
	 * that closes it. Diagnostic only: every private use fails, even when recorded here.
	 */
	gaps: Readonly<Partial<Record<ParityUse, string>>>;
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
 * which `WidgetTemplateData.isDm` and the query audience gate carry. A body reading a role reads
 * nothing a GM-built widget lacks. The scan works on paths, so a read of other actors' roles counts
 * here too: the Map tile's list of players to project to is one, and the projection command that
 * list feeds is a recorded gap.
 */
export const VIEWER_CONTEXT_PATHS: readonly string[] = ['permissions.actors'];

/* ── The declared map ──────────────────────────────────────────────────────────────────────────── */

// The gaps, by what closes them. "Unfiled" ones are not in the SCREENS_PARITY §4 register yet: the
// matrix kept these board tiles as `builtin` targets (BD-20–BD-26, SE-18), and this gate is what
// names the private reads behind them.
const GAP = {
	combatWrites: 'G-11 (RC-WID-5.12): combat write commands for widgets',
	nowPlaying: 'Unfiled (BD-24, SE-18): no query source says what is playing',
	timer:
		'Unfiled (BD-23): no query source reads the session timer the start/pause/resume executors run',
	boundCharacter:
		'Unfiled: no query source reads one bound character (visible-characters and party list them)',
	mapView: 'Unfiled (BD-20): no query source projects a map view, its layers or delivered maps',
	selfConfigure:
		'Unfiled (BD-20): a widget cannot rebind or reconfigure itself; only the Inspector can',
	projection: 'Unfiled (BD-20, SE-19): no command descriptor stages or projects a map',
	statusStrip:
		'Unfiled: the session status strip is not a source (session-state and presence carry parts of it)',
	onboarding: 'Unfiled: no query source reads onboarding progress',
	presets: 'Unfiled: no query source reads the layout presets or the safe point',
	gmScreen: 'Unfiled: no screens row says which screen is the GM screen',
	projectionSummary: 'Unfiled: no query source reads the active map projection summary',
	playerViewController:
		'Unfiled: player-projections reads the projections, not the player-view controller',
	encounters: 'Unfiled: no query source lists encounters',
	savedSearches: 'Unfiled: no query source lists saved searches',
} as const;

export const BUILTIN_PARITY: Readonly<Record<BuiltinWidgetType, BuiltinBodyParity>> = {
	// A note or handout draws its own configuration (the text the Inspector wrote).
	note: { queries: [], commands: [], intents: [], gaps: {} },
	handout: { queries: [], commands: [], intents: [], gaps: {} },
	dice: { queries: ['dice-history'], commands: ['dice.roll'], intents: [], gaps: {} },
	timer: {
		queries: [],
		commands: ['timer.start', 'timer.pause', 'timer.resume', 'timer.advance', 'timer.reset'],
		intents: [],
		gaps: { 'state:session.timers': GAP.timer },
	},
	audio: {
		queries: [],
		commands: [],
		intents: [],
		gaps: {
			'read:getSessionAudioView': GAP.nowPlaying,
			'state:audio.assets': GAP.nowPlaying,
			'state:audio.sources': GAP.nowPlaying,
			'state:session.audioPlayback': GAP.nowPlaying,
		},
	},
	'initiative-tracker': {
		queries: ['current-combatants', 'campaign'],
		commands: [],
		intents: [],
		gaps: {
			'command:combat.advance-turn': GAP.combatWrites,
			'command:combat.apply-resource': GAP.combatWrites,
			'command:combat.set-combatant-visibility': GAP.combatWrites,
		},
	},
	character: {
		queries: ['campaign'],
		commands: [],
		intents: [],
		gaps: { 'read:getCharacterForActor': GAP.boundCharacter },
	},
	map: {
		queries: ['maps', 'session-state'],
		commands: [],
		intents: ['open-entity'],
		gaps: {
			'read:deliveredMapIdsForActor': GAP.mapView,
			'read:getMapViewForActor': GAP.mapView,
			'read:queryMapLayers': GAP.mapView,
			'state:maps.assets': GAP.mapView,
			'state:maps.maps': GAP.mapView,
			'command:scene.configure-widget': GAP.selfConfigure,
			// Which scene the tile sits on, for `scene.configure-widget`.
			'state:scenes.scenes': GAP.selfConfigure,
			'command:session.set-active-map': GAP.projection,
			'command:session.project-active-map': GAP.projection,
		},
	},
	'quick-reference': { queries: ['content-objects'], commands: [], intents: [], gaps: {} },
	prep: { queries: ['notes'], commands: [], intents: [], gaps: {} },
	session: {
		queries: [],
		commands: [],
		intents: [],
		gaps: { 'read:getSessionStatusStrip': GAP.statusStrip },
	},
	'getting-started': {
		queries: [],
		commands: [],
		intents: [],
		gaps: { 'read:resolveOnboarding': GAP.onboarding },
	},
	tools: {
		// The GM screen's widget count is a `screens` row's.
		queries: ['screens'],
		commands: [],
		intents: [],
		gaps: {
			'state:commandCenter.homeSceneId': GAP.gmScreen,
			'state:commandCenter.presets': GAP.presets,
			'state:commandCenter.autoSave': GAP.presets,
		},
	},
	'data-hub': { queries: ['table-scenes', 'vault-counts'], commands: [], intents: [], gaps: {} },
	atlas: {
		queries: ['maps'],
		commands: [],
		intents: [],
		gaps: { 'read:getActiveMapProjectionSummary': GAP.projectionSummary },
	},
	characters: { queries: ['visible-characters'], commands: [], intents: [], gaps: {} },
	'player-views': {
		queries: [],
		commands: [],
		intents: [],
		gaps: { 'read:getPlayerViewController': GAP.playerViewController },
	},
	combat: {
		queries: ['current-combatants'],
		commands: [],
		intents: [],
		gaps: { 'read:listEncountersForActor': GAP.encounters },
	},
	notes: { queries: ['notes'], commands: [], intents: [], gaps: {} },
	search: {
		queries: [],
		commands: [],
		intents: [],
		gaps: { 'read:getSavedSearchesForActor': GAP.savedSearches },
	},
};

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
		if (segments.length >= 2) uses.add(`state:${segments.join('.')}`);
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
	const pathOf = (node: ts.Node): string[] | undefined => {
		if (
			ts.isParenthesizedExpression(node) ||
			ts.isAsExpression(node) ||
			ts.isNonNullExpression(node)
		)
			return pathOf(node.expression);
		if (ts.isIdentifier(node)) return aliases.get(node.text);
		if (ts.isPropertyAccessExpression(node)) {
			if (
				ts.isIdentifier(node.expression) &&
				node.expression.text === 'runtime' &&
				node.name.text === 'state'
			)
				return [];
			const base = pathOf(node.expression);
			return base && [...base, node.name.text];
		}
		if (ts.isElementAccessExpression(node)) {
			const base = pathOf(node.expression);
			if (base)
				return [
					...base,
					ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : '<dynamic>',
				];
		}
		return undefined;
	};
	const bind = (name: ts.BindingName, path: string[]) => {
		if (ts.isIdentifier(name)) {
			if (!aliases.has(name.text)) aliases.set(name.text, path);
		} else {
			for (const element of name.elements) {
				if (!ts.isBindingElement(element)) continue;
				const key = element.propertyName ?? element.name;
				bind(element.name, [
					...path,
					ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : '<dynamic>',
				]);
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
			const gap = entry.gaps[use];
			if (cover) {
				usedSurface.add(cover);
				if (gap) problems.push(`${type}: ${use} is public (${cover}); remove its gap entry`);
			} else {
				problems.push(
					`${type}: uses ${use}, which no descriptor, intent or query source exposes to a GM-built widget`,
				);
			}
		}
		for (const use of Object.keys(entry.gaps) as ParityUse[])
			if (!uses.has(use)) problems.push(`${type}: gap ${use} is no longer used; remove it`);
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
function exportedBytes(
	state: CoreStateSlice,
	env: CoreEnvironment,
	packageId: string,
): string | null {
	const exported = exportWidgetPackage(state.widgets, env, packageId);
	return 'kind' in exported ? null : JSON.stringify(exported.package, null, '\t');
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
	/** The builder's save of a package file, installed beside the shipped widgets and exported. */
	const throughBuilder = (bytes: string): { bytes: string | null; error?: string } => {
		const saved = buildPackage(readPackage(JSON.parse(bytes), 'proposed'));
		const installed = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId,
			payload: { package: saved },
		} as CoreCommand);
		if (installed.status !== 'accepted') return { bytes: null, error: installed.rejection.message };
		return { bytes: exportedBytes(installed.nextState, env, saved.id) };
	};
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
			problems.push(
				`${type}: draws through a hand-written builtin body the builder cannot express`,
			);
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
		const first = throughBuilder(exported);
		if (!first.bytes)
			problems.push(`${type}: the builder's save does not install (${first.error ?? 'no export'})`);
		else if (first.bytes !== exported)
			problems.push(`${type}: export → builder → install → export is not byte-identical`);
	}
	return problems;
}
