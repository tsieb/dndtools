import { hasDmAuthority } from '../state/permission-state';
import type { PermissionState } from '../state/permission-state';
import type {
	QuickReferencePanel,
	QuickReferenceTargetKind,
	SessionState,
} from '../state/session-state';
import type { VaultContentState } from '../state/content';
import type { CharacterState } from '../state/character-state';
import { getContentItemDetailForActor } from './content-query';
import { getPartyOverviewForActor } from './party-overview';
import { getSessionWidgetMode } from './session-control';
import { VAULT_OBJECT_SUBTYPE_KEY } from '../state/vault-object';

/**
 * SES-007 — THE single actor-filtered QUICK-REFERENCE read model. The DM pins panels that reference
 * content BY REFERENCE; this read resolves each reference against the LIVE target through the EXISTING
 * actor-filtered queries (Contract 3 Axis 1 / Cross-Contract Non-Negotiable 2), so a panel shows only
 * content the viewer may see.
 *
 * Fail-closed posture (SES-007 AC2):
 *
 *   - A pinned reference to a target that is now HIDDEN or DELETED degrades to an `unavailable` panel —
 *     the panel still appears (the DM authored it) but carries NO target content (no title, body, name,
 *     or stats), indistinguishable from a missing target. The read NEVER crashes on a dangling reference.
 *   - Quick-reference is a DM authoring surface (dm-only): a non-DM receives an EMPTY panel list, so a
 *     player never even learns which references the DM pinned.
 *
 * Pins are DURABLE (SES-007 AC1): they live in session state, so this read returns them across route
 * changes/reloads. Pure + deterministic: a function of (session, content, characters, permissions, actor).
 */

/** The resolved content of one quick-reference panel, when its target is visible to the actor. */
export interface QuickReferenceContent {
	/** A short title resolved from the target (note title, character name, etc). */
	title: string;
	/** A snippet/body resolved from the target (may be empty). */
	snippet: string;
}

/** One pinned quick-reference panel as projected to an actor. */
export interface QuickReferencePanelView {
	id: string;
	kind: QuickReferenceTargetKind;
	label: string;
	/**
	 * RC-SES-2.3 — the id the pin REFERENCES (null for `session-context`). Safe to expose here: this
	 * whole read is DM-only, so an id never reaches a player, and the DM authored the reference. A
	 * surface that lists pinnable things (the session tables tab) needs it to tell a pinned row from
	 * an unpinned one; it is echoed for BOTH statuses, so it leaks nothing about the target's state.
	 */
	targetId: string | null;
	order: number;
	/** `available` ⇒ the target resolved and is visible; `unavailable` ⇒ hidden/deleted/missing (no leak). */
	status: 'available' | 'unavailable';
	/** Resolved content, present ONLY when `status` is `available`. */
	content: QuickReferenceContent | null;
}

const UNAVAILABLE = (panel: QuickReferencePanel): QuickReferencePanelView => ({
	id: panel.id,
	kind: panel.kind,
	label: panel.label,
	targetId: panel.targetId,
	order: panel.order,
	status: 'unavailable',
	content: null,
});

const AVAILABLE = (
	panel: QuickReferencePanel,
	content: QuickReferenceContent,
): QuickReferencePanelView => ({
	id: panel.id,
	kind: panel.kind,
	label: panel.label,
	targetId: panel.targetId,
	order: panel.order,
	status: 'available',
	content,
});

interface ResolveInputs {
	session: SessionState;
	content: VaultContentState;
	characters: CharacterState;
	permissions: PermissionState;
	actorId: string;
}

/** Resolve a content-item-backed panel (note / rules-snippet / open-thread) through the content read. */
function resolveContentItem(
	panel: QuickReferencePanel,
	inputs: ResolveInputs,
): QuickReferencePanelView {
	if (!panel.targetId) return UNAVAILABLE(panel);
	const detail = getContentItemDetailForActor(
		inputs.content,
		inputs.permissions,
		inputs.actorId,
		panel.targetId,
	);
	// `not-found` / `hidden` / a non-visible detail all degrade to the SAME unavailable state (no leak of
	// which one it was).
	if (!('visible' in detail) || detail.visible !== true) return UNAVAILABLE(panel);
	return AVAILABLE(panel, { title: detail.title, snippet: detail.body });
}

/** Resolve a stat-block panel: a content-item stat block OR a character, through the actor-filtered reads. */
function resolveStatBlock(
	panel: QuickReferencePanel,
	inputs: ResolveInputs,
): QuickReferencePanelView {
	if (!panel.targetId) return UNAVAILABLE(panel);
	// Prefer a character target (visible via the party overview), else fall back to a content-item.
	const party = getPartyOverviewForActor(inputs.characters, inputs.permissions, inputs.actorId);
	const member = party.members.find((candidate) => candidate.characterId === panel.targetId);
	if (member) {
		const conditions = member.conditions.length > 0 ? `, ${member.conditions.join(', ')}` : '';
		return AVAILABLE(panel, {
			title: member.name,
			snippet: `HP ${member.hp}/${member.maxHp}, AC ${member.ac}${conditions}`,
		});
	}
	// Not a visible character — try a content-item stat block.
	return resolveContentItem(panel, inputs);
}

/**
 * RC-SES-2.3 — resolve a pinned ROLLABLE TABLE panel. The pin references a `dice-table` Vault Object by
 * id; this read resolves it through the same actor-filtered content detail every other panel uses, so a
 * table the viewer may not see degrades to `unavailable` exactly like a hidden note. The snippet carries
 * the table's dice expression and row COUNT — what a DM needs to decide whether to draw it — never the
 * rows themselves, so a pinned panel cannot spoil the table's contents at a glance.
 *
 * A content item that is visible but is NOT a `dice-table` (the subtype was changed, or the pin was
 * hand-authored against a note) resolves to `unavailable` rather than rendering a table panel over a
 * non-table: the panel promises a drawable table, so it fails closed when it cannot keep that promise.
 */
function resolveDiceTable(
	panel: QuickReferencePanel,
	inputs: ResolveInputs,
): QuickReferencePanelView {
	if (!panel.targetId) return UNAVAILABLE(panel);
	const detail = getContentItemDetailForActor(
		inputs.content,
		inputs.permissions,
		inputs.actorId,
		panel.targetId,
	);
	if (!('visible' in detail) || detail.visible !== true) return UNAVAILABLE(panel);
	const fields = detail.visibleFields;
	if (fields[VAULT_OBJECT_SUBTYPE_KEY] !== 'dice-table') return UNAVAILABLE(panel);
	const dice = fields['dice'];
	const entries = fields['entries'];
	if (typeof dice !== 'string' || dice.trim() === '') return UNAVAILABLE(panel);
	if (!Array.isArray(entries) || entries.length === 0) return UNAVAILABLE(panel);
	return AVAILABLE(panel, {
		title: detail.title,
		snippet: `${dice.trim()} · ${entries.length} rows`,
	});
}

/** Resolve a session-context panel: live session workflow context (no referenced entity). */
function resolveSessionContext(
	panel: QuickReferencePanel,
	inputs: ResolveInputs,
): QuickReferencePanelView {
	const mode = getSessionWidgetMode(inputs.session);
	return AVAILABLE(panel, {
		title: 'Session context',
		snippet: `Workflow: ${mode.workflow}. Status: ${mode.status}.`,
	});
}

/** Resolve ONE pinned panel for an actor against the live, actor-filtered target. */
export function resolveQuickReferencePanelForActor(
	panel: QuickReferencePanel,
	inputs: ResolveInputs,
): QuickReferencePanelView {
	switch (panel.kind) {
		case 'note':
		case 'rules-snippet':
		case 'open-thread':
			return resolveContentItem(panel, inputs);
		case 'stat-block':
			return resolveStatBlock(panel, inputs);
		case 'session-context':
			return resolveSessionContext(panel, inputs);
		case 'dice-table':
			return resolveDiceTable(panel, inputs);
	}
}

/**
 * SES-007 — the actor-filtered list of pinned quick-reference panels, in pin order. Quick reference is a
 * DM authoring surface: a non-DM receives an EMPTY list (fail closed). Each panel resolves its reference
 * against the live target; a hidden/deleted target degrades to an `unavailable` panel (no crash, no leak).
 */
export function getQuickReferencePanelsForActor(
	session: SessionState,
	content: VaultContentState,
	characters: CharacterState,
	permissions: PermissionState,
	actorId: string,
): QuickReferencePanelView[] {
	const actor = permissions.actors[actorId];
	if (!actor || !hasDmAuthority(actor.role)) return [];
	const inputs: ResolveInputs = { session, content, characters, permissions, actorId };
	return Object.values(session.quickReferencePanels)
		.sort((a, b) => (a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order))
		.map((panel) => resolveQuickReferencePanelForActor(panel, inputs));
}
