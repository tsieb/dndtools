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
	  }
	| {
			id: string;
			kind: 'write';
			/** The single core command type this tool dispatches through {@link dispatchCommand}. */
			commandType: McpBoundCommandType;
			writeRisk: McpWriteRisk;
			inputSchema: z.ZodType;
			title: string;
	  };

/**
 * The canonical BASELINE MCP tool ids (MCP-002 baseline read tools + the staged-write counterparts
 * this branch enforces). Declared as a const tuple so the registry, the dispatcher routing, and the
 * tests share ONE source of truth and a typo can never silently introduce an unrouted tool.
 */
export const MCP_BASELINE_TOOL_IDS = [
	// Baseline READ tools (MCP-002): vault summary, note read/list/search, graph context, character query.
	'vault.summary',
	'note.read',
	'note.list',
	'note.search',
	'graph.context',
	'character.query',
	// A representative WRITE tool whose enforcement this branch proves end-to-end (the staged note
	// create — Glossary "Staged Write" / MCP-004 AC2). It dispatches the existing content-create command.
	'note.create',
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
		list: () =>
			[...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
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
			id: 'note.create',
			kind: 'write',
			commandType: 'content.create-item',
			writeRisk: 'durable',
			inputSchema: mcpNoteCreateInputSchema,
			title: 'Create a note (staged)',
		},
	]);
}
