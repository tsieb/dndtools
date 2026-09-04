import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { listCharactersForActor } from '@dndtools/core';
import {
	abilityModifier,
	Button,
	EmptyState,
	Icon,
	IconButton,
	Tabs,
	tabPanelProps,
} from '../../ds';
import { CharBuilder } from '../../app/CharBuilder';
import { Page, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { CharCard } from './CharCard';
import { CharacterSheet } from './CharacterSheet';

/**
 * Characters — the roster library, wired to the live Processing Core.
 * The roster is the actor-filtered `listCharactersForActor` read model (a player/observer sees only
 * what the core permits — a dm-only NPC is omitted, never redacted-but-listed); opening a character
 * loads the redacted `getCharacterForActor` view bound to a real sheet (ability scores, combat vitals,
 * attacks, spells + spell slots, conditions, level/XP). "New character" opens the guided CharBuilder
 * overlay (`../app/CharBuilder` — the ported design-prototype wizard): a PC runs the REAL guided
 * draft flow (`character.create-draft` → `update-draft-step` ×3 → `finalize-draft` → DM `set-combat`),
 * everything else lands through the durable `character.quick-create`. The DM edit mode dispatches
 * `character.set-combat` (HP/AC/conditions) and `character.edit-field` (name); spell slots
 * spend/restore through `character.set-spell-slots`, prepared spells toggle/add through
 * `character.set-spell` (both DM-or-owner, CHAR-008 — no active-session gate); the level-up panel runs
 * the staged `character.{set-xp,open/set-choices/commit/cancel-advancement}` flow. Every mutation
 * flows through the single `runtime.dispatch` write choke point — the GUI never writes core state
 * directly (Architecture Contract 1).
 *
 * Sheet extension slices (WS-4, all core-backed — formerly listed here as honest gaps):
 *   - Skills & saves / hit dice / passive perception render from the structured
 *     `Character.proficiencies` block on the redacted view; the bonuses derive from the PURE core
 *     queries `effectiveProficiencyBonus` / `passivePerception` (computed on read, never stored).
 *     A character with no proficiency data gets an honest empty state, not a fabricated sheet.
 *   - Spell rows show the extended `PreparedSpell` detail fields (school / casting time / range /
 *     components / duration) when present; older `{id,name,level,prepared}` records render as before.
 *   - Attacks are DM/owner-editable post-create through `character.update-attacks` (full-replacement
 *     semantics: the saved rows ARE the new list).
 *   - The Sharing panel widens visibility through the DM-only `character.set-sharing`
 *     (entity level + explicit `sharedWith` delivery list — fail-closed, never widened by default).
 *   - "Import character (JSON)" is REAL (WS-4): the toolbar button opens the CharBuilder's import
 *     path (D&D Beyond export / native JSON with a fail-closed field-mapping preview).
 *
 * Honest gaps (no backing command after checking commands/ + the Svelte route):
 *   - "Start combat" — `combat.start` is DM + active-session gated and is authoritatively driven from
 *     the Session / Combat Tracker surfaces; it is dispatched here as a convenience and surfaces the
 *     core rejection (e.g. "start a session first") rather than silently no-op-ing.
 */

export function Characters() {
	const runtime = useRuntime();
	const navigate = useNavigate();
	const location = useLocation();
	// URL-driven detail (`/characters/:id`) so Story cards, palette hits, and note mentions can
	// deep-link a specific sheet instead of dumping the user on the roster.
	const { id: detailId = null } = useParams<{ id: string }>();
	const actorId = runtime.defaultActorId;
	const [kind, setKind] = useState('all');
	const [creating, setCreating] = useState(false);
	const [initialKind, setInitialKind] = useState<string | null>(null);
	// When set, the CharBuilder overlay opens straight into the file-import path (WS-4 JSON import).
	const [importIntent, setImportIntent] = useState(false);
	// A rejection ("Start a session first") used to render in the same accent-tinted success chip as
	// "Combat started", polite rather than assertive, so a refusal read as a confirmation.
	const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

	// Create-intent handoff: "New character" launchers elsewhere (home hub, ⌘K) navigate here with
	// router state instead of leaving the user to re-find the button. Consumed once, then cleared.
	useEffect(() => {
		const intent = (location.state ?? null) as { create?: boolean; kind?: string } | null;
		if (intent?.create) {
			setCreating(true);
			setInitialKind(typeof intent.kind === 'string' ? intent.kind : null);
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.state, location.pathname, navigate]);

	const data = useMemo(() => {
		const actor = runtime.state.permissions.actors[actorId] ?? null;
		const characters = listCharactersForActor(
			runtime.state.characters,
			runtime.state.permissions,
			actorId,
		);
		return { isDm: actor?.role === 'dm', characters };
	}, [runtime.state, actorId]);

	// `key` is load-bearing, not decoration. CharacterSheet holds a dozen pieces of per-character
	// draft state (shareDraft, attackRows, acDraft, xpInput, editMode, error) and has NO effect keyed
	// on `id`, so navigating sheet -> sheet (the command palette does exactly that) reused the
	// mounted component and carried A's drafts onto B — where `applySharing` and `saveAttacks`, both
	// full replacements, would happily write them. Remounting on id change is the fix.
	if (detailId)
		return <CharacterSheet key={detailId} id={detailId} onBack={() => navigate('/characters')} />;

	const list = data.characters.filter((c) => {
		if (kind === 'all') return true;
		if (kind === 'npc') return c.kind === 'npc' || c.kind === 'sidekick';
		return c.kind === kind;
	});
	const tabs = [
		{ id: 'all', label: 'All' },
		{ id: 'pc', label: 'Party' },
		{ id: 'npc', label: 'NPCs' },
		{ id: 'monster', label: 'Bestiary' },
	];

	const partyPcs = data.characters.filter((c) => c.kind === 'pc');

	// `combat.start` is DM + active-session gated and authoritatively driven from the Session / Combat
	// Tracker. Dispatched here as a convenience over the party; the core rejection is surfaced (e.g.
	// "start a session first" / "combat already running") rather than silently swallowed.
	async function startCombat() {
		setNotice(null);
		const result = await runtime.dispatch({
			type: 'combat.start',
			actorId,
			payload: {
				// SES-002 combatant rows: a PC seeds as kind `character` (resources flow from its combat
				// block) — `combatantKindSchema` is character/npc/monster, not the roster's `pc`.
				combatants: partyPcs.map((c) => ({
					kind: 'character',
					name: c.name,
					characterId: c.id,
					ac: c.combat.ac,
					maxHp: c.combat.maxHp,
					// Was a flat 0 for every PC, producing a degenerate all-tied order with no reroll
					// path. Use the same d20 + DEX roll EncounterBuilder already applies for exactly
					// this reason, so this convenience button can't start a fight of all-0 initiative.
					initiative:
						1 + Math.floor(Math.random() * 20) + abilityModifier(c.abilityScores.dex ?? 10),
				})),
			},
		});
		setNotice(
			result.status === 'rejected'
				? { tone: 'error', text: result.rejection.message }
				: { tone: 'ok', text: 'Combat started — open the Session screen to run it.' },
		);
	}

	return (
		<Page>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					marginBottom: 18,
					flexWrap: 'wrap',
				}}
			>
				<Tabs
					value={kind}
					onChange={setKind}
					tabs={tabs}
					idBase="characters"
					aria-label="Roster filter"
				/>
				<div style={{ flex: 1 }} />
				{data.isDm && partyPcs.length > 0 && (
					<Button variant="ghost" size="sm" icon="sword" onClick={startCombat}>
						Start combat
					</Button>
				)}
				{/* REAL import (WS-4): opens the CharBuilder's file-import path — a D&D Beyond export or
				    native JSON, previewed field-by-field (fail closed) before anything is created. */}
				{data.isDm && (
					<Button
						variant="ghost"
						size="sm"
						icon="import"
						onClick={() => {
							setImportIntent(true);
							setCreating(true);
						}}
					>
						Import character (JSON)
					</Button>
				)}
				{data.isDm && (
					<Button
						variant="primary"
						size="sm"
						icon="new-character"
						onClick={() => setCreating(true)}
					>
						New character
					</Button>
				)}
			</div>

			{notice && (
				<div
					role={notice.tone === 'error' ? 'alert' : 'status'}
					style={{
						marginBottom: 14,
						display: 'flex',
						alignItems: 'flex-start',
						gap: 8,
						font: `13px ${T.sans}`,
						color: notice.tone === 'error' ? 'var(--color-status-error-text)' : T.sub,
						background: notice.tone === 'error' ? 'var(--color-status-error-subtle)' : T.accSub,
						border: `1px solid ${
							notice.tone === 'error' ? 'var(--color-status-error-border)' : T.accBd
						}`,
						borderRadius: 8,
						padding: '8px 12px',
					}}
				>
					<Icon name={notice.tone === 'error' ? 'warning' : 'check'} size={14} />
					<span style={{ flex: 1, minWidth: 0 }}>{notice.text}</span>
					<IconButton
						icon="close"
						label="Dismiss message"
						variant="ghost"
						size="sm"
						onClick={() => setNotice(null)}
					/>
				</div>
			)}

			<div {...tabPanelProps('characters', kind)}>
				{list.length === 0 ? (
					<EmptyState
						icon="characters-person"
						title={
							data.characters.length === 0 ? 'Your roster is empty' : 'No one matches this filter'
						}
						description={
							data.characters.length === 0
								? 'Add the party’s heroes, then the NPCs they’ll meet.'
								: 'No characters match this filter.'
						}
						action={
							data.isDm ? (
								<Button
									variant="primary"
									size="sm"
									icon="new-character"
									onClick={() => setCreating(true)}
								>
									New character
								</Button>
							) : undefined
						}
					/>
				) : (
					<div
						style={{
							display: 'grid',
							// `min()` retains the useful desktop card width without forcing horizontal
							// page scrolling on a 320px phone (292px after page gutters).
							gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 230px),1fr))',
							gap: 16,
						}}
					>
						{list.map((c) => (
							<CharCard key={c.id} view={c} onOpen={() => navigate(`/characters/${c.id}`)} />
						))}
					</div>
				)}
			</div>

			{/* The guided creation overlay (ported design-prototype wizard): PC → real core draft flow;
			    NPC/Monster/Sidekick → character.quick-create. Created characters open their sheet. */}
			{creating && data.isDm && (
				<CharBuilder
					initialKind={initialKind ?? undefined}
					initialAction={importIntent ? 'import' : undefined}
					onClose={() => {
						setCreating(false);
						setInitialKind(null);
						setImportIntent(false);
					}}
					onCreated={(id) => {
						setCreating(false);
						setInitialKind(null);
						setImportIntent(false);
						navigate(`/characters/${id}`);
					}}
				/>
			)}
		</Page>
	);
}
