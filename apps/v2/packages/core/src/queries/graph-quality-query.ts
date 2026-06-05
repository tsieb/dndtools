import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import { parseMarkdownNote } from '../state/markdown';
import {
	buildQualityNode,
	computeGraphQuality,
	GRAPH_QUALITY_SCHEMA_VERSION,
	GRAPH_QUALITY_THRESHOLD_VERSION,
	type GraphQualityReport,
	type QualityNode,
} from '../state/graph-quality';
import { buildWikilinkCandidatesForActor } from './wikilink-graph';
import { getContentItemsForActor } from './content-query';

/**
 * GRAPH-003 — the ACTOR-FILTERED GRAPH-QUALITY surface: unresolved links + repair candidates, alias /
 * duplicate-title disambiguation, orphan + hub notes, and relationship-quality scores, all over the
 * actor's VISIBLE graph.
 *
 * This is the single choke-point that feeds the pure {@link computeGraphQuality} engine ONLY the notes —
 * and the links — the actor may see. It is built ENTIRELY on the EXISTING actor-filtered link graph, NOT
 * a second relationship source:
 *
 *   - The visible note SET comes from {@link getContentItemsForActor} (CONTENT-011) — the SAME
 *     visibility-and-tombstone choke-point every CONTENT/SRCH/GRAPH surface uses. A `dm-only` /
 *     `shared`-but-undelivered / soft-deleted note never enters the set, so it can never be a node, an
 *     inbound source, a duplicate, a hub, an orphan, or a repair candidate (GRAPH-003 actor-filtering,
 *     fail closed; Cross-Contract Non-Negotiable 2).
 *   - The link RESOLUTION + repair candidate index come from {@link buildWikilinkCandidatesForActor}
 *     (CONTENT-006) — the SAME actor-filtered candidate index the wikilink repair path uses. A link to a
 *     target the actor cannot see is therefore `unresolved` exactly as it would be in the repair UI, so an
 *     UNRESOLVED-LINK finding can NEVER distinguish "target is hidden from this actor" from "target truly
 *     missing": a player can never probe a dangling link to discover that a DM-only note exists.
 *
 * Because every input is drawn from an actor-filtered read, the data layer decided visibility BEFORE
 * the quality engine sees anything. An unknown/unauthenticated actor receives an EMPTY report (fail
 * closed). The report a player sees and the report the DM sees over the same vault differ ONLY by which
 * notes are visible — there is no separate "quality index" that could leak hidden structure.
 *
 * Pure + deterministic: the same content + permissions + actor always produce the same report. The
 * Processing Core owns the algorithm; the GUI renders the computed findings (Architecture Contract 1).
 */

/** The fail-closed EMPTY report (an unknown actor, or a vault with no visible notes). */
function emptyReport(): GraphQualityReport {
	return {
		schemaVersion: GRAPH_QUALITY_SCHEMA_VERSION,
		thresholdVersion: GRAPH_QUALITY_THRESHOLD_VERSION,
		unresolvedLinks: [],
		disambiguation: [],
		orphans: [],
		hubs: [],
		scores: [],
	};
}

/**
 * GRAPH-003 — build the ACTOR-FILTERED quality nodes: every NOTE the actor may see becomes a
 * {@link QualityNode} (id + title + aliases + outbound link targets). Hidden/tombstoned notes never enter
 * the set (omitted by {@link getContentItemsForActor}), so they are neither analyzed nor revealed. The
 * outbound targets are parsed from the visible body the SAME way the rest of the graph parses links. Pure.
 */
function buildQualityNodesForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
): QualityNode[] {
	return getContentItemsForActor(content, permissions, actorId)
		.filter((view) => view.kind === 'note')
		.map((view) => {
			const parsed = parseMarkdownNote(view.body);
			return buildQualityNode({
				id: view.id,
				title: view.title,
				aliases: parsed.aliases,
				body: parsed.body,
			});
		});
}

/**
 * GRAPH-003 — the actor-filtered GRAPH-QUALITY report: unresolved links (+ deterministic repair
 * candidates, AC1), alias / duplicate-title disambiguation (AC2), orphan + hub notes, and per-note
 * relationship-quality scores carrying deterministic inputs + threshold version + source references (AC3).
 *
 * Composes the actor-visible quality nodes with the actor-visible wikilink candidate index, so link
 * resolution + repair candidates never reach a target the actor cannot see. Every finding is over the
 * visible graph only and never reveals a hidden note. An unknown/unauthenticated actor yields the empty
 * report (fail closed). Pure + deterministic — identical visible content fingerprints identically across
 * fresh fixtures whose ids differ and across repeated runs.
 */
export function getGraphQualityForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
): GraphQualityReport {
	if (!permissions.actors[actorId]) return emptyReport();
	const nodes = buildQualityNodesForActor(content, permissions, actorId);
	const candidates = buildWikilinkCandidatesForActor(content, permissions, actorId);
	return computeGraphQuality(nodes, candidates);
}
