import { z } from 'zod';

/**
 * MCP-004 / MCP-005 — the typed, FAIL-CLOSED MCP TOOL REGISTRY.
 *
 * An MCP agent never reaches the vault directly. It calls a NAMED tool, and a tool is nothing more
 * than a DECLARED binding onto the Processing Core that already exists: a READ tool composes one of
 * the existing actor-filtered query surfaces, and a WRITE tool dispatches one of the existing
 * authorized commands (Architecture Contract 1 — the Processing Core is the only owner of durable
 * mutation semantics; the GUI/MCP/widgets read query results and dispatch commands, never raw
 * state). The registry is the EXHAUSTIVE allowlist of what an agent can do, and it is closed:
 *
 *   - An unknown tool id is denied (there is no "default tool"). The dispatcher fails closed on a
 *     tool the registry does not contain.
 *   - A WRITE tool names exactly ONE command `type` from the core command union. The tool cannot
 *     reach a command the registry did not bind, and it cannot invent a command type — so a tool
 *     call never invokes a command the registry (and therefore the policy layer) does not allow.
 *   - Every tool carries a Zod input schema. A tool call whose input fails the schema is rejected
 *     BEFORE any query runs or any command is dispatched (MCP-004 AC2 — a write that fails schema
 *     validation accepts no staged or direct durable mutation).
 *
 * Crucially, the registry confers NO authority. It declares WHICH command/query a tool maps to; the
 * ACTUAL visibility filtering and authority/permission checks happen inside the composed query (for
 * reads) or inside {@link dispatchCommand} (for writes), exactly as for a human actor. There is no
 * privileged MCP side-channel: the same Processing-Core enforcement runs whether the caller is a GUI
 * control, a widget automation, or an MCP agent.
 *
 * Per ADR-014 the MCP SIDECAR runtime/transport is deferred; this is the pure Processing-Core POLICY
 * + binding layer the future sidecar plugs into. It imports no MCP SDK, no transport, and no
 * filesystem — it is plain, deterministic data + pure functions.
 */

/** Whether a tool reads (composes an actor-filtered query) or writes (dispatches a command). */
export type McpToolKind = 'read' | 'write';

/**
 * The risk class of a WRITE tool, mirroring the MCP staged-write contract (Glossary "Staged Write").
 * `low-risk` writes are batchable under `balanced` policy; `durable` writes always require explicit
 * approval outside `trusted_direct`. This branch (MCP-004/005/012) does NOT implement the policy-mode
 * staging decision — that is the MCP-identity-policy-and-staged-writes branch — but the tool declares
 * its risk so the staged/direct decision composes onto it WITHOUT re-declaring the tool surface. A
 * read tool has no write risk.
 */
export type McpWriteRisk = 'low-risk' | 'durable';

/** The id of a core command a write tool maps to. Kept as a string so the registry composes the */
/** existing command union without importing every command's payload type. */
export type McpBoundCommandType = string;

/**
 * A declared MCP tool. The `inputSchema` is the contract the agent's tool input must satisfy
 * (validated fail-closed before anything runs). A `read` tool carries a `queryId` naming the
 * actor-filtered read surface the dispatcher composes; a `write` tool carries the `commandType` it
 * dispatches plus its write-risk class.
 */
export type McpToolDefinition =
	| {
			id: string;
			kind: 'read';
			/** Stable id of the actor-filtered query surface this tool composes (audit + routing). */
			queryId: string;
			inputSchema: z.ZodType;
			/** Human-facing summary for the agent tool list; carries no vault data. */
			title: string;
			/**
			 * Optional richer guidance shown to the model in the tool spec (mcpBridge `buildAiToolSpecs`
			 * prefers it over `title`). It tells the agent HOW to use the tool to work through a task;
			 * it carries no vault data and confers no authority.
			 */
			description?: string;
	  }
	| {
			id: string;
			kind: 'write';
			/** The single core command type this tool dispatches through {@link dispatchCommand}. */
			commandType: McpBoundCommandType;
			writeRisk: McpWriteRisk;
			inputSchema: z.ZodType;
			title: string;
			description?: string;
	  };

/**
 * The canonical BASELINE MCP tool ids (MCP-002 baseline read tools + the staged-write counterparts
 * this branch enforces). Declared as a const tuple so the registry, the dispatcher routing, and the
 * tests share ONE source of truth and a typo can never silently introduce an unrouted tool.
 */
export const MCP_BASELINE_TOOL_IDS = [
	// Baseline READ tools (MCP-002): vault summary, note read/list/search, graph context, character query,
	// dice roll, and session prep bundles — the exact minimum set the requirement statement names.
	'vault.summary',
	'note.read',
	'note.list',
	'note.search',
	'graph.context',
	'character.query',
	'dice.roll',
	'session.prep',
	// SEMANTIC BUNDLE read tools (MCP-006 / MCP-013): bounded, source-cited, calendar-aware context packages
	// for prep, recap, continuity, open threads, coverage gaps, and campaign health. Each composes the
	// EXISTING actor-filtered deterministic reads (it adds NO new mutation or visibility path).
	'bundle.session-prep',
	'bundle.session-recap',
	'bundle.continuity',
	'bundle.open-threads',
	'bundle.coverage-gaps',
	// RC-AI-1.3 — the staleness-finding subset of coverage-gaps (the smallest health bundle).
	'bundle.stale-notes',
	'bundle.campaign-health',
	// A representative WRITE tool whose enforcement this branch proves end-to-end (the staged note
	// create — Glossary "Staged Write" / MCP-004 AC2). It dispatches the existing content-create command.
	'note.create',
	// I11 S11.2.1 — the staged SCENE CARD create. Dispatches `scene-card.create`; visibility is NOT an
	// accepted argument, so an agent-authored card always defaults fail-closed to `dm-only` (never pushed
	// to players by a tool call alone).
	'create_scene_card',
	// ADR-025 — the agentic-run WRITE surface. Each is a SINGLE composable staged write (it dispatches
	// exactly one existing command and needs no applied intermediate state), so a model can complete a
	// multi-step process — random-table generation, level-N stat-block creation, note revision — across
	// autonomous tool passes and the result is one staged proposal a DM approves. None accepts a
	// `visibility` argument, so every agent-authored write fails closed to `dm-only`.
	'table.create',
	'character.create',
	'note.update',
	// RC-AI-1.2 — the campaign-authoring WRITE surface. Each binds exactly ONE existing command and
	// accepts NO `visibility` argument, so every agent-authored encounter, quest, faction, POI, scene
	// card revision, and note append fails closed to `dm-only`. Two of them are resolved against
	// ACTOR-FILTERED state at staging time (`map.poi.create` resolves the map's layer, `note.append`
	// reads the current body + revision), so an agent can only touch what its bound actor may see.
	'encounter.create',
	'quest.create',
	'faction.create',
	'map.poi.create',
	'scene.card.update',
	'note.append',
] as const;

export type McpBaselineToolId = (typeof MCP_BASELINE_TOOL_IDS)[number];

/** An immutable, lookup-only view of the declared tool allowlist. */
export interface McpToolRegistry {
	/** The declared tool for an id, or `undefined` when the id is not allowlisted (deny). */
	get(toolId: string): McpToolDefinition | undefined;
	/** Whether an id is an allowlisted tool. */
	has(toolId: string): boolean;
	/** Every declared tool id, in stable sorted order (for the agent tool list + tests). */
	ids(): string[];
	/** Every declared tool, in stable sorted-by-id order. */
	list(): McpToolDefinition[];
}

/**
 * Build an immutable MCP tool registry. Construction FAILS CLOSED on a wiring error — a duplicate
 * tool id throws — so a registry can never resolve two definitions for one id (which could let a
 * narrower definition shadow a broader one). The same-shape guard the platform-service registry uses.
 */
export function createMcpToolRegistry(definitions: McpToolDefinition[]): McpToolRegistry {
	const byId = new Map<string, McpToolDefinition>();
	for (const def of definitions) {
		if (def.id.trim() === '') {
			throw new Error('MCP tool id must be a non-empty string.');
		}
		if (byId.has(def.id)) {
			throw new Error(`MCP tool "${def.id}" is registered more than once.`);
		}
		byId.set(def.id, def);
	}
	return {
		get: (toolId) => byId.get(toolId),
		has: (toolId) => byId.has(toolId),
		ids: () => [...byId.keys()].sort((a, b) => a.localeCompare(b)),
		list: () => [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
	};
}

// ---------------------------------------------------------------------------------------------------
// Baseline tool input schemas. These validate ONLY the tool-call input shape (the agent-facing
// arguments); the durable mutation/visibility semantics still live in the composed command/query.
// Fail-closed: a missing/extra/mistyped argument is rejected before anything runs (MCP-004 AC2).
// ---------------------------------------------------------------------------------------------------

const nonEmpty = z.string().min(1);

/** No-argument read tools (vault summary, note list) take an empty object. `.strict()` rejects extras. */
export const mcpEmptyInputSchema = z.object({}).strict();

/** A read tool addressing one entity by id. */
export const mcpEntityIdInputSchema = z.object({ entityId: nonEmpty }).strict();

/** The note-search tool input: a query string + optional content-type filter + bounded limit. */
export const mcpNoteSearchInputSchema = z
	.object({
		query: z.string().default(''),
		limit: z.number().int().positive().max(100).optional(),
	})
	.strict();

/** The graph-context tool input: the node whose relationships are requested. */
export const mcpGraphContextInputSchema = z.object({ nodeId: nonEmpty }).strict();

/**
 * The dice-roll tool input: a dice EXPRESSION (`2d20kh1+5`) + an EXPLICIT seed. The seed is REQUIRED so the
 * roll is DETERMINISTIC and reproducible (SES-003) — the agent supplies the entropy source, and the same
 * (expression, seed) always yields the identical result on every device. A malformed expression is rejected
 * by the dice engine fail-closed (it never silently evaluates). The seed accepts a number or a string token.
 */
export const mcpDiceRollInputSchema = z
	.object({
		expression: nonEmpty,
		seed: z.union([z.number(), z.string().min(1)]),
	})
	.strict();

/**
 * The session-prep bundle tool input: an optional `mode` (`prep` looks forward, `recap` looks back).
 * Defaults to `prep`. The bundle itself is DM-FACING and fail-closed — a non-DM agent receives an EMPTY
 * digest (no prep/recap content, no hidden source data), enforced by the composed `getPrepRecapDigest`.
 */
export const mcpSessionPrepInputSchema = z
	.object({
		mode: z.enum(['prep', 'recap']).default('prep'),
	})
	.strict();

/**
 * The semantic-bundle tool input (MCP-006 / MCP-013). It carries an EXPLICIT `referenceInstant` (the "now"
 * the campaign-health staleness is measured against — the Processing Core reads no ambient clock) plus an
 * optional bounded item budget (the semantic-compression budget — MCP-006 AC2). The bundle KIND is fixed by
 * the tool id (one tool per kind), so it is not an accepted argument — an agent cannot widen the bundle by
 * input. The optional AI capability/annotator are NOT accepted here: AI is the GUI/sidecar's optional seam,
 * never something an agent toggles, so a bundle requested through MCP is always the DETERMINISTIC bundle.
 */
export const mcpBundleInputSchema = z
	.object({
		referenceInstant: nonEmpty,
		itemBudget: z.number().int().positive().max(100).optional(),
	})
	.strict();

/**
 * The note-create WRITE tool input. This mirrors the MINIMUM the `content.create-item` command
 * needs; the command still re-validates the full payload (and an MCP author can never widen
 * visibility — the command defaults visibility fail-closed to `dm-only`). The visibility is NOT an
 * accepted argument here precisely so an agent cannot publish content to players by tool input alone.
 */
export const mcpNoteCreateInputSchema = z
	.object({
		title: nonEmpty,
		body: z.string().default(''),
		kind: z.enum(['note', 'object']).default('note'),
	})
	.strict();

/**
 * The `create_scene_card` WRITE tool input (I11 S11.2.1). Deliberately NARROWER than the command payload:
 * only the agent-safe presentation fields (title/mood/flavor). It omits `visibility` (so the card fails
 * closed to `dm-only` — an agent can never push atmosphere to players), and it omits the hero-image and
 * audio references (an agent cannot bind vault assets). The command re-validates the full payload.
 */
export const mcpCreateSceneCardInputSchema = z
	.object({
		title: nonEmpty,
		mood: z.enum(['combat', 'exploration', 'mystery', 'social', 'rest']).default('exploration'),
		flavorText: z.string().max(500).default(''),
	})
	.strict();

/**
 * ADR-025 — the `table.create` WRITE tool input. Generates a rollable `dice-table` Vault Object: a
 * `dice` expression (e.g. `1d20`) and one result row per face, in order. Dispatches
 * `content.create-item`; `writeCommandPayload` maps this to the exact `fields` shape `readDiceTable`
 * (commands/dice.ts) expects, so an approved table is immediately drawable. No `visibility` argument ⇒
 * the table fails closed to `dm-only`. The tool accepts only an exact `1dN` with N matching the row
 * count (1–100), so malformed or ambiguous table geometry is denied before a proposal is staged.
 */
export const mcpTableCreateInputSchema = z
	.object({
		title: nonEmpty,
		dice: z
			.string()
			.regex(
				/^1d([1-9]|[1-9]\d|100)$/i,
				'Use exactly one positive 1dN expression with 1 to 100 faces (no modifier or keep rule).',
			),
		entries: z.array(nonEmpty).min(1).max(100),
	})
	.strict()
	.superRefine((value, context) => {
		const match = /^1d([1-9]|[1-9]\d|100)$/i.exec(value.dice);
		if (!match) return;
		const faceCount = Number(match[1]);
		if (value.entries.length !== faceCount) {
			context.addIssue({
				code: 'custom',
				path: ['entries'],
				message: `Provide exactly ${faceCount} result rows for ${value.dice}.`,
			});
		}
	});

/**
 * ADR-025 — the `character.create` WRITE tool input. Mirrors the agent-safe subset of
 * `quickCreateCharacterInputSchema` (npc/monster/sidekick only — a PC is created through the guided
 * draft flow, not an agent). The model assembles the COMPLETE level-N stat block in one call; class,
 * level, and background live in the free-form `data` record. No `visibility` argument ⇒ fails closed
 * to `dm-only`. The command re-validates the full payload.
 */
export const mcpCharacterCreateInputSchema = z
	.object({
		kind: z.enum(['npc', 'monster', 'sidekick']),
		name: nonEmpty,
		abilityScores: z
			.object({
				str: z.number().int().optional(),
				dex: z.number().int().optional(),
				con: z.number().int().optional(),
				int: z.number().int().optional(),
				wis: z.number().int().optional(),
				cha: z.number().int().optional(),
			})
			.strict()
			.default({}),
		combat: z
			.object({
				hp: z.number().int().optional(),
				maxHp: z.number().int().optional(),
				tempHp: z.number().int().nonnegative().optional(),
				ac: z.number().int().optional(),
				conditions: z.array(nonEmpty).optional(),
			})
			.strict()
			.default({}),
		data: z.record(z.string(), z.unknown()).default({}),
	})
	.strict();

/**
 * ADR-025 — the `note.update` WRITE tool input. Revises an existing content item's title and/or body
 * (find the id + revision via `note.search`/`note.list`). Dispatches `content.update-item`; only the two
 * agent-safe content fields and required `baseRevision` cross over (never fields/visibility/timeline
 * widening). The command re-checks the revision at approval, recording a conflict instead of silently
 * replacing a newer human edit.
 */
export const mcpNoteUpdateInputSchema = z
	.object({
		itemId: nonEmpty,
		baseRevision: z.number().int().nonnegative(),
		title: nonEmpty.optional(),
		body: z.string().optional(),
	})
	.strict()
	.refine((value) => value.title !== undefined || value.body !== undefined, {
		message: 'Provide a title or body to update.',
	});

/**
 * RC-AI-1.2 — the `encounter.create` WRITE tool input. Mirrors the agent-safe subset of
 * `buildEncounterInputSchema`: title, combatant selection, party context, and terrain notes, plus the
 * legendary/lair actions and loot the model is genuinely good at inventing. It OMITS `sessionLogLinks`
 * and a combatant's `characterId` — an agent cannot bind vault references — and it omits every id, so
 * the command mints them. Difficulty is NOT an argument: the core computes the challenge guidance
 * deterministically from the combatants and party. `encounter.build` is DM-only, so the tool inherits
 * that gate; nothing here is player-facing.
 */
export const mcpEncounterCreateInputSchema = z
	.object({
		title: nonEmpty,
		combatants: z
			.array(
				z
					.object({
						kind: z.enum(['character', 'npc', 'monster']),
						name: nonEmpty,
						challengeRating: z.number().nonnegative().default(0),
						quantity: z.number().int().positive().max(99).default(1),
						maxHp: z.number().int().nonnegative().default(0),
						ac: z.number().int().nonnegative().default(10),
						hidden: z.boolean().default(false),
					})
					.strict(),
			)
			.min(1)
			.max(50),
		party: z
			.object({
				size: z.number().int().positive().max(12).default(4),
				averageLevel: z.number().int().min(1).max(20).default(1),
			})
			.strict()
			.optional(),
		terrainNotes: z.string().max(2000).default(''),
		specialActions: z
			.array(
				z
					.object({
						kind: z.enum(['legendary', 'lair']),
						name: nonEmpty,
						detail: z.string().max(1000).default(''),
					})
					.strict(),
			)
			.max(20)
			.default([]),
		loot: z
			.array(z.object({ name: nonEmpty, detail: z.string().max(1000).default('') }).strict())
			.max(50)
			.default([]),
	})
	.strict();

/**
 * RC-AI-1.2 — the `quest.create` WRITE tool input. A quest is a note-backed Vault Object (subtype
 * `quest`, `state/vault-object-schema.ts`), so this dispatches `content.create-item` and
 * `writeCommandPayload` maps the input into the exact `fields` shape the subtype declares. Prose
 * (hooks, rewards, journal) goes in `body`. No `visibility` argument ⇒ fails closed to `dm-only`.
 */
export const mcpQuestCreateInputSchema = z
	.object({
		title: nonEmpty,
		status: z.enum(['active', 'completed', 'failed', 'paused']).default('active'),
		objectives: z.array(nonEmpty).max(50).default([]),
		body: z.string().max(20000).default(''),
	})
	.strict();

/**
 * RC-AI-1.2 — the `faction.create` WRITE tool input. A faction dossier is a note-backed Vault Object
 * (subtype `faction`), dispatched through `content.create-item`. The DM-only `secret` field is
 * accepted because the whole object fails closed to `dm-only` and the field is redacted from players
 * by the subtype schema even if the DM later shares the dossier. Prose goes in `body`.
 */
export const mcpFactionCreateInputSchema = z
	.object({
		name: nonEmpty,
		kind: z.enum(['cult', 'militia', 'guild', 'party', 'order', 'other']).default('other'),
		stance: z.enum(['hostile', 'neutral', 'friendly', 'allied']).default('neutral'),
		leader: z.string().max(200).default(''),
		goals: z.array(nonEmpty).max(20).default([]),
		secret: z.string().max(2000).default(''),
		body: z.string().max(20000).default(''),
	})
	.strict();

/**
 * RC-AI-1.2 — the `map.poi.create` WRITE tool input. Positions are NORMALIZED map space (0..1 on both
 * axes), the model the whole map subsystem uses. `layerId` is OPTIONAL: omitted, the payload mapper
 * resolves the map's first ACTOR-VISIBLE layer, so a model that only knows a map id can still place a
 * pin. No `visibility` argument ⇒ the POI fails closed to `dm-only`; no `linkedEntity*` ⇒ an agent
 * cannot bind the pin to a vault entity.
 */
export const mcpMapPoiCreateInputSchema = z
	.object({
		mapId: nonEmpty,
		layerId: nonEmpty.optional(),
		label: nonEmpty,
		category: z
			.enum([
				'settlement',
				'landmark',
				'dungeon',
				'quest',
				'hazard',
				'shop',
				'npc',
				'note',
				'other',
			])
			.default('other'),
		position: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
		notes: z.string().max(2000).default(''),
	})
	.strict();

/**
 * RC-AI-1.2 — the `scene.card.update` WRITE tool input. Revises an EXISTING scene card's presentation
 * fields only. It omits `heroImage` and `audioAssociationId` (an agent cannot bind vault assets) and
 * there is no visibility argument — `scene-card.update` cannot change visibility at all, so an agent
 * can never push a card to players by revising it.
 */
export const mcpSceneCardUpdateInputSchema = z
	.object({
		cardId: nonEmpty,
		title: nonEmpty.optional(),
		mood: z.enum(['combat', 'exploration', 'mystery', 'social', 'rest']).optional(),
		flavorText: z.string().max(500).optional(),
	})
	.strict()
	.refine(
		(value) =>
			value.title !== undefined || value.mood !== undefined || value.flavorText !== undefined,
		{ message: 'Provide a title, mood, or flavor text to update.' },
	);

/**
 * RC-AI-1.2 — the `note.append` WRITE tool input. APPENDS to an existing note instead of replacing it
 * (the failure mode `note.update` has: a model that rewrites a long note loses the DM's prose). The
 * agent supplies only the text; `writeCommandPayload` reads the CURRENT body + revision through the
 * ACTOR-FILTERED note read and stages `{itemId, baseRevision, body}` — so a human edit landing before
 * approval records a conflict rather than a clobber, exactly like `note.update`.
 */
export const mcpNoteAppendInputSchema = z
	.object({
		itemId: nonEmpty,
		text: nonEmpty.max(20000),
		/** Optional markdown heading written above the appended text (its own `##` line). */
		heading: z.string().max(200).optional(),
	})
	.strict();

/**
 * The canonical baseline MCP tool registry: the MCP-002 baseline read tools + the enforced staged
 * note-create write tool. Every entry binds to an EXISTING command/query — no tool introduces a new
 * mutation path. This is the allowlist the dispatcher routes through; an id outside it is denied.
 */
export function createBaselineMcpToolRegistry(): McpToolRegistry {
	return createMcpToolRegistry([
		{
			id: 'vault.summary',
			kind: 'read',
			queryId: 'content.items',
			inputSchema: mcpEmptyInputSchema,
			title: 'Vault summary',
		},
		{
			id: 'note.read',
			kind: 'read',
			queryId: 'content.item-detail',
			inputSchema: mcpEntityIdInputSchema,
			title: 'Read a note',
		},
		{
			id: 'note.list',
			kind: 'read',
			queryId: 'content.items',
			inputSchema: mcpEmptyInputSchema,
			title: 'List notes',
		},
		{
			id: 'note.search',
			kind: 'read',
			queryId: 'search.vault',
			inputSchema: mcpNoteSearchInputSchema,
			title: 'Search notes',
		},
		{
			id: 'graph.context',
			kind: 'read',
			queryId: 'graph.relationships',
			inputSchema: mcpGraphContextInputSchema,
			title: 'Graph context for a node',
		},
		{
			id: 'character.query',
			kind: 'read',
			queryId: 'character.list',
			inputSchema: mcpEmptyInputSchema,
			title: 'Query characters',
		},
		{
			id: 'dice.roll',
			kind: 'read',
			// dice.roll — the PURE, deterministic dice engine (SES-003). Modeled as a read tool: it returns
			// computed data and mutates nothing (a roll is durable only when a write command records it, which
			// this tool does NOT do). The agent supplies the seed, so the result is reproducible.
			queryId: 'dice.roll',
			inputSchema: mcpDiceRollInputSchema,
			title: 'Roll dice',
		},
		{
			id: 'session.prep',
			kind: 'read',
			// session.prep — the DM-facing prep/recap bundle (SES-009). Composed from the actor-filtered digest,
			// so a non-DM agent receives an empty bundle (no hidden source content leaks — MCP-002 AC2).
			queryId: 'session.prep-digest',
			inputSchema: mcpSessionPrepInputSchema,
			title: 'Session prep bundle',
		},
		// SEMANTIC BUNDLE read tools (MCP-006 / MCP-013). Each routes to the SAME bundle assembler keyed by
		// kind; every bundle composes the existing actor-filtered deterministic reads and is DM-gated/fail
		// closed inside the composed query (a non-DM agent receives the generalized, finding-free bundle).
		{
			id: 'bundle.session-prep',
			kind: 'read',
			queryId: 'bundle.session-prep',
			inputSchema: mcpBundleInputSchema,
			title: 'Session prep semantic bundle',
		},
		{
			id: 'bundle.session-recap',
			kind: 'read',
			queryId: 'bundle.session-recap',
			inputSchema: mcpBundleInputSchema,
			title: 'Session recap semantic bundle',
		},
		{
			id: 'bundle.continuity',
			kind: 'read',
			queryId: 'bundle.continuity',
			inputSchema: mcpBundleInputSchema,
			title: 'Continuity semantic bundle',
		},
		{
			id: 'bundle.open-threads',
			kind: 'read',
			queryId: 'bundle.open-threads',
			inputSchema: mcpBundleInputSchema,
			title: 'Open threads semantic bundle',
		},
		{
			id: 'bundle.coverage-gaps',
			kind: 'read',
			queryId: 'bundle.coverage-gaps',
			inputSchema: mcpBundleInputSchema,
			title: 'Coverage gaps semantic bundle',
		},
		{
			id: 'bundle.stale-notes',
			kind: 'read',
			queryId: 'bundle.stale-notes',
			inputSchema: mcpBundleInputSchema,
			title: 'Stale notes semantic bundle',
		},
		{
			id: 'bundle.campaign-health',
			kind: 'read',
			queryId: 'bundle.campaign-health',
			inputSchema: mcpBundleInputSchema,
			title: 'Campaign health semantic bundle',
		},
		{
			id: 'note.create',
			kind: 'write',
			commandType: 'content.create-item',
			writeRisk: 'durable',
			inputSchema: mcpNoteCreateInputSchema,
			title: 'Create a note (staged)',
		},
		{
			id: 'create_scene_card',
			kind: 'write',
			commandType: 'scene-card.create',
			writeRisk: 'durable',
			inputSchema: mcpCreateSceneCardInputSchema,
			title: 'Create a scene card (staged)',
		},
		{
			id: 'table.create',
			kind: 'write',
			commandType: 'content.create-item',
			writeRisk: 'durable',
			inputSchema: mcpTableCreateInputSchema,
			title: 'Create a random roll table (staged)',
			description:
				'Generate and save a rollable random table. Provide a `dice` expression (e.g. "1d20") and ' +
				'`entries`: one result row per face, in ascending order (a d20 table needs exactly 20 rows). ' +
				'To match the setting, call note.search or a bundle read first and weave the flavour in. ' +
				'The table is staged for DM approval and never applied immediately; once approved it can be rolled.',
		},
		{
			id: 'character.create',
			kind: 'write',
			commandType: 'character.quick-create',
			writeRisk: 'durable',
			inputSchema: mcpCharacterCreateInputSchema,
			title: 'Create an NPC / monster / sidekick (staged)',
			description:
				'Create a non-player character (npc, monster, or sidekick) stat block. Work through the build ' +
				'level by level in your reasoning, then submit ONE call carrying the COMPLETE stat block for the ' +
				'target level: abilityScores (str/dex/con/int/wis/cha), combat (hp/maxHp/ac), and a `data` record ' +
				'holding class, level, background, and features. Check character.query first to avoid name ' +
				'clashes. Player characters and levelling an EXISTING character are not available to agents. ' +
				'Staged for DM approval; never applied immediately.',
		},
		{
			id: 'note.update',
			kind: 'write',
			commandType: 'content.update-item',
			writeRisk: 'durable',
			inputSchema: mcpNoteUpdateInputSchema,
			title: 'Revise a note (staged)',
			description:
				'Revise an existing note. Find the itemId with note.search or note.list, then provide the new ' +
				"title and/or body plus the note's current revision as baseRevision. If the note changes before " +
				'approval, Lamplight records a conflict instead of overwriting the newer edit. Staged for DM ' +
				'approval; never applied immediately.',
		},
		// RC-AI-1.2 — the campaign-authoring write surface. Each names ONE bound command and accepts no
		// `visibility`, so every one fails closed to `dm-only`.
		{
			id: 'encounter.create',
			kind: 'write',
			commandType: 'encounter.build',
			writeRisk: 'durable',
			inputSchema: mcpEncounterCreateInputSchema,
			title: 'Build an encounter (staged)',
			description:
				'Build a combat encounter. Provide a title and the combatants (kind npc/monster/character, ' +
				'name, challengeRating, quantity, maxHp, ac); add `party` (size and averageLevel) so ' +
				'Lamplight can compute the difficulty for you — do not state a difficulty yourself. ' +
				'Optionally add terrainNotes, legendary or lair specialActions, and loot. Read the setting ' +
				'first with note.search or a bundle so the encounter fits. Staged for DM approval; never ' +
				'applied immediately.',
		},
		{
			id: 'quest.create',
			kind: 'write',
			commandType: 'content.create-item',
			writeRisk: 'durable',
			inputSchema: mcpQuestCreateInputSchema,
			title: 'Create a quest (staged)',
			description:
				'Create a quest with a status (active, completed, failed, or paused) and its objectives, ' +
				'one short line each, in the order the party would meet them. Put hooks, rewards, and ' +
				'background prose in `body` as markdown. Staged for DM approval; never applied immediately.',
		},
		{
			id: 'faction.create',
			kind: 'write',
			commandType: 'content.create-item',
			writeRisk: 'durable',
			inputSchema: mcpFactionCreateInputSchema,
			title: 'Create a faction dossier (staged)',
			description:
				'Create a faction dossier: name, kind (cult, militia, guild, party, order, or other), ' +
				'stance toward the party (hostile, neutral, friendly, or allied), leader, and goals in ' +
				'priority order. Anything the players must not learn goes in `secret`, which stays DM only. ' +
				'Put history and holdings in `body`. Staged for DM approval; never applied immediately.',
		},
		{
			id: 'map.poi.create',
			kind: 'write',
			commandType: 'map.create-poi',
			writeRisk: 'durable',
			inputSchema: mcpMapPoiCreateInputSchema,
			title: 'Place a map point of interest (staged)',
			description:
				'Place a labelled pin on a map. Find the mapId with note.search first. `position` is ' +
				'normalized map space: x and y each run from 0 (left/top) to 1 (right/bottom), so the centre ' +
				'is {x: 0.5, y: 0.5}. Choose a category and add notes. Leave layerId out and the pin lands on ' +
				"the map's first layer. Staged for DM approval; never applied immediately.",
		},
		{
			id: 'scene.card.update',
			kind: 'write',
			commandType: 'scene-card.update',
			writeRisk: 'durable',
			inputSchema: mcpSceneCardUpdateInputSchema,
			title: 'Revise a scene card (staged)',
			description:
				'Revise an existing scene card: its title, mood (combat, exploration, mystery, social, or ' +
				'rest), and flavor text (up to 500 characters of read-aloud atmosphere). Find the cardId ' +
				'first. Revising a card never changes who can see it. Staged for DM approval; never applied ' +
				'immediately.',
		},
		{
			id: 'note.append',
			kind: 'write',
			commandType: 'content.update-item',
			writeRisk: 'durable',
			inputSchema: mcpNoteAppendInputSchema,
			title: 'Append to a note (staged)',
			description:
				'Add text to the END of an existing note, keeping everything already written. Find the ' +
				'itemId with note.search or note.list. Pass an optional `heading` to start a new section. ' +
				'Prefer this over note.update when you are adding to a note rather than rewriting it. If ' +
				'the note changes before approval, Lamplight records a conflict instead of overwriting the ' +
				'newer edit. Staged for DM approval; never applied immediately.',
		},
	]);
}
