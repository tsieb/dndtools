import { useEffect, useMemo, useRef, useState } from 'react';
import {
	computeEncounterChallenge,
	getActiveSystemForActor,
	listEncountersForActor,
	systemDeclaresChallenge,
} from '@dndtools/core';
import {
	Badge,
	Button,
	Dialog,
	Field,
	Icon,
	Input,
	ProgressMeter,
	SegmentedControl,
	Select,
	Switch,
	Toaster,
} from '../ds';
import { T, eb } from './screen-kit';
import { DraftRoster, QuickAddFoe } from './EncounterDraftRoster';
import {
	AMBUSH_BOTTOM,
	AMBUSH_TOP,
	DIFFICULTY_BADGE,
	DIFFICULTY_LABEL,
	KIND_GROUPS,
	dexModOf,
	extractId,
	rowFromCharacter,
	type AmbushMode,
	type DraftRow,
	type RosterCharacter,
} from './EncounterDraft';
import { useRuntime } from '../runtime/RuntimeContext';
import { useI18n } from '../i18n';

/**
 * EncounterBuilder — the Session screen's encounter-composition dialog (SES-006 → SES-002), split
 * out of Session.tsx for size. `start` mode picks combatants from the real roster across kinds,
 * quick-adds ad-hoc monsters, sets/rolls per-combatant initiative, shows the deterministic challenge
 * budget (`computeEncounterChallenge`), then dispatches `encounter.build` → `combat.start`.
 * `reinforce` mode feeds the same roster picker into RUNNING combat via `combat.add-combatants`
 * (blank initiative auto-rolls in the core).
 *
 * RC-SES-3.5 (builder v2) adds four things on top of that: −/+ COUNT STEPPERS beside each foe's
 * quantity, SAVE/LOAD of the durable `encounter` object so prep survives the session (save is
 * `encounter.build` on its own; load rehydrates the draft from `listEncountersForActor`), a PLACE ON
 * MAP toggle for the session's active map, and AMBUSH/SURPRISE seeding that reads the party's
 * MARCHING ORDER to decide who acts first and which foes start hidden.
 */

export function EncounterDialog({
	mode,
	onClose,
	characters,
	party,
	defaultTitle,
	activeMapId = null,
	marchingOrder = [],
}: {
	mode: 'start' | 'reinforce' | null;
	onClose: () => void;
	characters: RosterCharacter[];
	party: RosterCharacter[];
	defaultTitle: string;
	/** The session's active map, or null. Token auto-placement only exists when there is one. */
	activeMapId?: string | null;
	/** CHAR-011 party marching order (visible character ids, front first) — the ambush seed. */
	marchingOrder?: string[];
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const open = mode !== null;

	const [rows, setRows] = useState<DraftRow[]>([]);
	const [title, setTitle] = useState('');
	// Raw text, like `crDrafts` below: clamping on every keystroke meant clearing the field to retype
	// snapped it straight back to the floor, so it could not be emptied. Every consumer below already
	// re-clamps, so the draft only ever has to survive being mid-edit.
	const [partySize, setPartySize] = useState('4');
	const [partyLevel, setPartyLevel] = useState('3');
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	// RC-SES-3.5 — how the fight opens, and whether starting it puts tokens on the active map.
	const [ambush, setAmbush] = useState<AmbushMode>('none');
	const [placeOnMap, setPlaceOnMap] = useState(true);
	// The saved encounter picked in the reuse row, and whether a save is in flight.
	const [loadId, setLoadId] = useState('');
	const [saving, setSaving] = useState(false);
	// Bumped on every open/mode change so the quick-add and draft-roster sections remount with fresh
	// local state. They own the typed DRAFTS (quick-add name/HP/AC, the per-row count and CR text)
	// that this dialog used to reset by hand when it held them itself.
	const [draftGen, setDraftGen] = useState(0);
	// Initiative/hidden as they stood before an ambush mode was applied, keyed by row. Restored when
	// the DM goes back to "none", so seeding an ambush and undoing it does not eat hand-typed
	// initiative or a foe the DM had already marked hidden.
	const preAmbushRef = useRef<Record<string, { initiative: string; hidden: boolean }>>({});
	// The durable encounter a previous Start attempt already committed, held so a retry after a
	// rejected `combat.start` reuses it instead of minting another. Cleared whenever the roster or
	// title changes (the held encounter no longer describes what is on screen) and on close.
	const builtIdRef = useRef<string | null>(null);

	// Re-seed the draft each time the dialog opens: starting a fight pre-selects the party (the
	// common case — the DM then adds foes); reinforcing starts empty.
	useEffect(() => {
		if (!open) return;
		setRows(mode === 'start' ? party.map(rowFromCharacter) : []);
		setTitle(defaultTitle);
		// These four are typed DRAFTS (string state, coerced on submit) so backspacing a digit no
		// longer snaps the field back to a fallback — the reset has to write strings too.
		setPartySize(String(Math.max(1, party.length || 4)));
		const levels = party
			.map((c) => Number((c.data as Record<string, unknown>).level))
			.filter((n) => Number.isFinite(n) && n >= 1);
		setPartyLevel(
			String(
				levels.length
					? Math.min(20, Math.round(levels.reduce((a, b) => a + b, 0) / levels.length))
					: 3,
			),
		);
		// CR is another typed draft, but it only commits on blur/Enter — and React fires no blur on
		// unmount. Escaping the dialog mid-edit therefore left the draft behind, so on reopen the CR
		// field showed the abandoned text while the difficulty meter still read the committed `r.cr`.
		setDraftGen((n) => n + 1);
		setError(null);
		// RC-SES-3.5 — a fresh open is an ordinary fight on a fresh draft: no ambush seed, no saved
		// encounter selected, and tokens placed if there is a map to place them on.
		setAmbush('none');
		preAmbushRef.current = {};
		setLoadId('');
		setPlaceOnMap(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open/mode change
	}, [open, mode]);

	// RC-SYS-2.5 — the CR/XP budget belongs to the active rules system. A system that declares neither
	// challenge ratings nor an XP table gets `null` here, and the meter, its party inputs and the
	// per-combatant CR field all go away rather than sitting there as controls that feed nothing.
	const activePackage = useMemo(
		() =>
			getActiveSystemForActor(runtime.state.systems, runtime.state.permissions, actorId)
				.activePackage,
		[runtime.state.systems, runtime.state.permissions, actorId],
	);
	const declaresChallenge = systemDeclaresChallenge(activePackage);
	const challenge = useMemo(
		() =>
			computeEncounterChallenge(
				rows.map((r, i) => ({
					id: r.key || `draft-${i}`,
					kind: r.kind,
					name: r.name,
					characterId: r.characterId,
					challengeRating: r.kind === 'character' ? 0 : r.cr,
					quantity: r.kind === 'character' ? 1 : Math.max(1, r.quantity),
					maxHp: r.maxHp,
					ac: r.ac,
					initiative: 0,
					hidden: r.hidden,
				})),
				{
					size: Math.max(1, Math.trunc(Number(partySize)) || 1),
					averageLevel: Math.min(20, Math.max(1, Math.trunc(Number(partyLevel)) || 1)),
				},
				activePackage,
			),
		[rows, partySize, partyLevel, activePackage],
	);

	// Any edit to what the encounter IS invalidates the one a failed Start already committed: the
	// held id no longer describes the roster on screen, so the next attempt must build afresh. Doing
	// it here rather than in each mutator covers the inline `setRows` call sites and the title field.
	useEffect(() => {
		builtIdRef.current = null;
	}, [rows, title, partySize, partyLevel]);

	function patchRow(key: string, patch: Partial<DraftRow>) {
		setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
	}

	// RC-SES-3.5 — the DM's saved encounters, newest first. Actor-scoped: `listEncountersForActor`
	// returns an EMPTY list to anyone without DM authority, so a player preview never sees prep.
	const savedEncounters = useMemo(
		() =>
			listEncountersForActor(
				runtime.state.encounters,
				runtime.state.permissions,
				actorId,
				runtime.state.systems,
			)
				.slice()
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
		[runtime.state.encounters, runtime.state.permissions, runtime.state.systems, actorId],
	);

	/** The build payload the durable `encounter.build` command takes — shared by Save and Start. */
	function buildPayload() {
		return {
			title: title.trim() || defaultTitle,
			combatants: rows.map((r) => ({
				kind: r.kind,
				name: r.name,
				characterId: r.characterId,
				challengeRating: r.kind === 'character' ? 0 : r.cr,
				quantity: r.kind === 'character' ? 1 : Math.max(1, r.quantity),
				maxHp: r.maxHp,
				ac: r.ac,
				// Blank ⇒ roll here (d20 + DEX mod) so the DM never starts a fight of all-0 initiative.
				initiative:
					r.initiative.trim() === ''
						? 1 + Math.floor(Math.random() * 20) + r.dexMod
						: Math.trunc(Number(r.initiative)) || 0,
				hidden: r.hidden,
			})),
			party: {
				size: Math.max(1, Math.trunc(Number(partySize)) || 1),
				averageLevel: Math.min(20, Math.max(1, Math.trunc(Number(partyLevel)) || 1)),
			},
		};
	}

	/**
	 * RC-SES-3.5 — SAVE the composed roster as a durable `encounter` object WITHOUT starting a fight,
	 * so a DM can prep a week ahead. The dialog stays open (prep is often several encounters in a
	 * row) and the saved encounter appears in the reuse picker immediately.
	 */
	async function save(): Promise<void> {
		if (rows.length === 0) {
			setError(t('encounter.pickOne'));
			return;
		}
		setError(null);
		setSaving(true);
		try {
			const built = await runtime.dispatch({
				type: 'encounter.build',
				actorId,
				payload: buildPayload(),
			});
			if (built.status === 'rejected') {
				setError(built.rejection.message);
				return;
			}
			const encounterId = extractId(built, 'encounterId') ?? extractId(built, 'id');
			// A saved encounter is exactly the thing a subsequent Start would build, so hold it: the
			// next Start reuses it instead of committing a near-duplicate.
			builtIdRef.current = encounterId;
			if (encounterId) setLoadId(encounterId);
			Toaster.success(t('encounter.saved'));
		} finally {
			setSaving(false);
		}
	}

	/** RC-SES-3.5 — rehydrate the draft from a saved encounter (its roster, party context, title). */
	function loadSaved(encounterId: string) {
		const saved = savedEncounters.find((e) => e.id === encounterId);
		if (!saved) return;
		setTitle(saved.title);
		setPartySize(String(saved.party.size));
		setPartyLevel(String(saved.party.averageLevel));
		setDraftGen((n) => n + 1);
		setAmbush('none');
		preAmbushRef.current = {};
		setRows(
			saved.combatants.map((c) => {
				// A selection that still points at a live vault character re-adopts that character's DEX
				// so a blank initiative rolls the same way it would from the roster picker.
				const character = c.characterId
					? characters.find((r) => r.id === c.characterId)
					: undefined;
				return {
					key: c.characterId ? `char-${c.characterId}` : `saved-${c.id}`,
					kind: c.kind === 'character' || c.kind === 'monster' ? c.kind : 'npc',
					name: c.name,
					characterId: c.characterId,
					maxHp: c.maxHp,
					ac: c.ac,
					initiative: '',
					cr: c.challengeRating,
					quantity: Math.max(1, c.quantity),
					hidden: c.hidden,
					dexMod: character ? dexModOf(character) : 0,
				};
			}),
		);
		setError(null);
		Toaster.success(t('encounter.loaded', { title: saved.title }));
	}

	/**
	 * RC-SES-3.5 — seed initiative and hidden flags from the party's MARCHING ORDER.
	 *
	 * The marching order already says who is in front, so it is the honest answer to "who reacts
	 * first" when a fight opens badly. `party-ambushes` puts the party on top of the order in
	 * marching-order sequence; `party-surprised` puts the foes on top AND starts them hidden (players
	 * see the tracker's "Unknown creature" placeholder until the DM reveals them). `none` restores
	 * whatever the fields held before a mode was applied.
	 */
	function applyAmbush(next: AmbushMode) {
		setAmbush(next);
		setRows((prev) => {
			if (next === 'none') {
				const before = preAmbushRef.current;
				preAmbushRef.current = {};
				return prev.map((r) => (before[r.key] ? { ...r, ...before[r.key]! } : r));
			}
			// Snapshot once, on the first application, so mode→mode switching still restores the
			// ORIGINAL values rather than the previous mode's seed.
			if (Object.keys(preAmbushRef.current).length === 0) {
				preAmbushRef.current = Object.fromEntries(
					prev.map((r) => [r.key, { initiative: r.initiative, hidden: r.hidden }]),
				);
			}
			const partyTop = next === 'party-ambushes';
			const rank = (r: DraftRow) => {
				const index = r.characterId ? marchingOrder.indexOf(r.characterId) : -1;
				// Unplaced party members fall in behind everyone the marching order does place.
				return index >= 0 ? index : marchingOrder.length;
			};
			let foeIndex = 0;
			return prev.map((r) => {
				if (r.kind === 'character') {
					return {
						...r,
						initiative: String((partyTop ? AMBUSH_TOP : AMBUSH_BOTTOM) - rank(r)),
					};
				}
				const seat = foeIndex;
				foeIndex += 1;
				return {
					...r,
					initiative: String((partyTop ? AMBUSH_BOTTOM : AMBUSH_TOP) - seat),
					// Only the foes' ambush hides them; a party ambush leaves visibility alone.
					hidden: partyTop ? r.hidden : true,
				};
			});
		});
	}

	// Raw text for the CR fields while they are being edited. Coercing on every keystroke made the
	// two most common low-tier ratings impossible to type: `Number('0.')` is 0, so the controlled
	// input snapped back and swallowed the decimal point before "0.25"/"0.5" could be entered.
	// Same story for the per-row count: `Math.trunc(Number(v) || 1)` on every keystroke snapped the
	// field back to 1 the moment it was cleared, so "12" could not be retyped over "3".
	function toggleCharacter(c: RosterCharacter) {
		const key = `char-${c.id}`;
		setRows((prev) =>
			prev.some((r) => r.key === key)
				? prev.filter((r) => r.key !== key)
				: [...prev, rowFromCharacter(c)],
		);
	}

	async function launch(): Promise<void> {
		if (rows.length === 0) {
			setError(t('encounter.pickOne'));
			return;
		}
		setError(null);
		setSubmitting(true);
		try {
			if (mode === 'reinforce') {
				const result = await runtime.dispatch({
					type: 'combat.add-combatants',
					actorId,
					payload: {
						combatants: rows.map((r) => ({
							kind: r.kind,
							name: r.name,
							characterId: r.characterId,
							ac: r.ac,
							// Blank ⇒ null ⇒ the core auto-rolls 1d20 deterministically.
							initiative: r.initiative.trim() === '' ? null : Math.trunc(Number(r.initiative)) || 0,
							maxHp: r.maxHp,
							hidden: r.hidden,
							quantity: Math.min(20, Math.max(1, r.kind === 'character' ? 1 : r.quantity)),
						})),
					},
				});
				if (result.status === 'rejected') {
					setError(result.rejection.message);
					return;
				}
				Toaster.success(t('encounter.reinforced'));
				onClose();
				return;
			}
			// Start mode: build the durable encounter (SES-006), then run it (SES-002).
			// `encounter.build` commits DURABLY before `combat.start` runs, and the most likely
			// rejection of the second step ("start a session first") leaves this dialog open with the
			// roster intact — so pressing Start again used to build a SECOND encounter, and a third,
			// with no screen anywhere that can list or delete them. Reuse the one we already made.
			if (builtIdRef.current) {
				await start(builtIdRef.current);
				return;
			}
			const built = await runtime.dispatch({
				type: 'encounter.build',
				actorId,
				payload: buildPayload(),
			});
			if (built.status === 'rejected') {
				setError(built.rejection.message);
				return;
			}
			const encounterId = extractId(built, 'encounterId') ?? extractId(built, 'id');
			if (!encounterId) {
				setError(t('encounter.startFailed'));
				return;
			}
			builtIdRef.current = encounterId;
			await start(encounterId);
		} finally {
			setSubmitting(false);
		}
	}

	async function start(encounterId: string) {
		const started = await runtime.dispatch({
			type: 'combat.start',
			actorId,
			payload: { encounterId },
		});
		if (started.status === 'rejected') {
			setError(started.rejection.message);
			return;
		}
		// RC-SES-3.5 — "Place on map". The core auto-places a token per combatant whenever the session
		// has an active map (deterministic formation, `combat.start`), which is what most fights want.
		// When the DM turns the toggle off — a theatre-of-the-mind fight, or a board they want to set
		// by hand — take those tokens straight back off, so the board matches the choice that was made.
		if (activeMapId && !placeOnMap) {
			for (const combatantId of started.nextState.session.combat.order) {
				await runtime.dispatch({
					type: 'combat.remove-token',
					actorId,
					payload: { combatantId },
				});
			}
		}
		builtIdRef.current = null;
		Toaster.success(t('encounter.started'));
		onClose();
	}

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title={mode === 'reinforce' ? t('encounter.titleReinforce') : t('encounter.titleStart')}
			description={mode === 'reinforce' ? t('encounter.descReinforce') : t('encounter.descStart')}
			icon="sword"
			size="lg"
			// A composed roster is real work with no draft persistence and no undo, and this dialog is
			// large enough that the scrim is an easy miss-click target. Escape and Cancel still close it
			// — those are deliberate — but a stray outside click no longer throws the encounter away.
			backdropDismissible={rows.length === 0}
			footer={
				<>
					<Button variant="ghost" size="sm" onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					{/* RC-SES-3.5 — saving is prep, not play: it commits the durable encounter and leaves
					    the dialog open, so a DM can build next week's fights without starting one. */}
					{mode === 'start' && (
						<Button
							variant="secondary"
							size="sm"
							icon="folder"
							disabled={saving || submitting}
							aria-disabled={rows.length === 0 || undefined}
							title={rows.length === 0 ? t('encounter.needOne') : undefined}
							onClick={() => void save()}
						>
							{saving ? t('encounter.working') : t('encounter.save')}
						</Button>
					)}
					<Button
						variant="primary"
						size="sm"
						icon={mode === 'reinforce' ? 'add' : 'sword'}
						disabled={submitting}
						// Hard `disabled` removes the tab stop and suppresses the tooltip, so the reason it
						// is unavailable had no channel. The DS soft form keeps it focusable and announced.
						aria-disabled={rows.length === 0 || undefined}
						title={rows.length === 0 ? t('encounter.needOne') : undefined}
						onClick={() => void launch()}
					>
						{submitting
							? t('encounter.working')
							: mode === 'reinforce'
								? t('encounter.addToCombat')
								: t('encounter.startCombat')}
					</Button>
				</>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				{error && (
					<div role="alert" style={{ font: `12.5px ${T.sans}`, color: T.err }}>
						{error}
					</div>
				)}

				{mode === 'start' && (
					<Field label={t('encounter.encounterTitle')}>
						<Input
							value={title}
							onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
							placeholder={t('encounter.titlePlaceholder')}
						/>
					</Field>
				)}

				{/* RC-SES-3.5 — reuse: load a previously saved encounter back into the draft. Hidden
				    entirely when nothing has been saved yet, rather than showing an empty picker. */}
				{mode === 'start' && savedEncounters.length > 0 && (
					<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
						<Field label={t('encounter.savedEncounters')} style={{ flex: '1 1 200px' }}>
							<Select
								value={loadId}
								onChange={(e: { target: { value: string } }) => setLoadId(e.target.value)}
								options={[
									{ value: '', label: t('encounter.savedPlaceholder') },
									...savedEncounters.map((enc) => {
										// The band is only appended when the ACTIVE package still declares one —
										// a saved 5e encounter reopened under Generic is just its title.
										const band = enc.challenge && DIFFICULTY_LABEL[enc.challenge.difficulty];
										return {
											value: enc.id,
											label: band ? `${enc.title} — ${t(band)}` : enc.title,
										};
									}),
								]}
							/>
						</Field>
						<Button
							variant="secondary"
							size="sm"
							icon="retry"
							aria-disabled={loadId === '' || undefined}
							title={loadId === '' ? t('encounter.savedPlaceholder') : undefined}
							onClick={() => {
								if (loadId !== '') loadSaved(loadId);
							}}
						>
							{t('encounter.load')}
						</Button>
					</div>
				)}

				{/* Roster picker — the real character roster across kinds (actor-filtered core read). */}
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
						gap: 12,
					}}
				>
					{KIND_GROUPS.map((group) => {
						const members = characters.filter(group.match);
						return (
							<div key={group.label} style={{ minWidth: 0 }}>
								<div style={{ ...eb, marginBottom: 6 }}>{t(group.label)}</div>
								{members.length === 0 ? (
									<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
										{t('encounter.groupEmpty')}
									</div>
								) : (
									<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
										{members.map((c) => {
											const picked = rows.some((r) => r.key === `char-${c.id}`);
											return (
												<button
													key={c.id}
													type="button"
													aria-pressed={picked}
													onClick={() => toggleCharacter(c)}
													style={{
														display: 'flex',
														alignItems: 'center',
														gap: 8,
														padding: '6px 8px',
														borderRadius: 7,
														border: `1px solid ${picked ? T.accBd : T.bd}`,
														background: picked ? T.accSub : T.surf,
														cursor: 'pointer',
														textAlign: 'left',
													}}
												>
													<Icon
														name={picked ? 'check' : 'add'}
														size={13}
														color={picked ? T.acc : T.ter}
													/>
													<span
														style={{
															flex: 1,
															minWidth: 0,
															font: `600 12.5px ${T.sans}`,
															color: T.ink,
															whiteSpace: 'nowrap',
															overflow: 'hidden',
															textOverflow: 'ellipsis',
														}}
													>
														{c.name}
													</span>
													<span
														style={{ font: `10.5px ${T.mono}`, color: T.ter, whiteSpace: 'nowrap' }}
													>
														{t('encounter.hpAc', {
															hp: c.combat?.maxHp ?? '—',
															ac: c.combat?.ac ?? '—',
														})}
													</span>
												</button>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>

				<QuickAddFoe key={`quick-${draftGen}`} onAdd={(row) => setRows((prev) => [...prev, row])} />

				<DraftRoster
					key={`roster-${draftGen}`}
					rows={rows}
					mode={mode}
					declaresChallenge={declaresChallenge}
					patchRow={patchRow}
					onRemove={(key) => setRows((prev) => prev.filter((x) => x.key !== key))}
				/>

				{/* RC-SES-3.5 — how the fight opens: the ambush seed (read from the party's marching
				    order) and whether starting it puts tokens on the session's active map. */}
				{mode === 'start' && (
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 8,
							borderTop: `1px solid ${T.bd}`,
							paddingTop: 12,
						}}
					>
						<div style={eb}>{t('encounter.opening')}</div>
						<SegmentedControl
							ariaLabel={t('encounter.opening')}
							size="sm"
							value={ambush}
							onChange={(next: AmbushMode) => applyAmbush(next)}
							options={[
								{ value: 'none', label: t('encounter.ambush.none') },
								{ value: 'party-ambushes', label: t('encounter.ambush.partyAmbushes') },
								{ value: 'party-surprised', label: t('encounter.ambush.partySurprised') },
							]}
						/>
						<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
							{ambush === 'none'
								? t('encounter.ambushNote.none')
								: marchingOrder.length === 0
									? t('encounter.ambushNote.noOrder')
									: t('encounter.ambushNote.seeded')}
						</div>
						<Switch
							checked={placeOnMap && activeMapId !== null}
							aria-disabled={activeMapId === null || undefined}
							label={t('encounter.placeOnMap')}
							onChange={(next: boolean) => {
								if (activeMapId === null) return;
								setPlaceOnMap(next);
							}}
						/>
						<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
							{activeMapId === null
								? t('encounter.placeOnMapNoMap')
								: t('encounter.placeOnMapNote')}
						</div>
					</div>
				)}

				{/* Challenge budget — the deterministic core guidance (the template's XP-budget meter). */}
				{mode === 'start' && challenge && (
					<div
						style={{
							display: 'flex',
							alignItems: 'flex-end',
							gap: 12,
							flexWrap: 'wrap',
							borderTop: `1px solid ${T.bd}`,
							paddingTop: 12,
						}}
					>
						<Field label={t('encounter.partySize')} style={{ width: 84 }}>
							<Input
								type="number"
								min={1}
								value={partySize}
								onChange={(e: { target: { value: string } }) => setPartySize(e.target.value)}
							/>
						</Field>
						<Field label={t('encounter.avgLevel')} style={{ width: 84 }}>
							<Input
								type="number"
								min={1}
								max={20}
								value={partyLevel}
								onChange={(e: { target: { value: string } }) => setPartyLevel(e.target.value)}
							/>
						</Field>
						<div style={{ flex: '1 1 200px', minWidth: 160 }}>
							<ProgressMeter
								label={t('encounter.challengeBudget')}
								value={challenge.encounterPoints}
								max={Math.max(1, challenge.partyDeadlyThreshold)}
								valueLabel={t('encounter.points', {
									value: challenge.encounterPoints,
									max: challenge.partyDeadlyThreshold,
								})}
								tone={
									challenge.difficulty === 'deadly'
										? 'error'
										: challenge.difficulty === 'hard'
											? 'warning'
											: 'accent'
								}
								markers={[0.25, 0.5, 0.75].map((f) =>
									Math.round(challenge.partyDeadlyThreshold * f),
								)}
							/>
						</div>
						<Badge status={DIFFICULTY_BADGE[challenge.difficulty] ?? 'neutral'}>
							{DIFFICULTY_LABEL[challenge.difficulty]
								? t(DIFFICULTY_LABEL[challenge.difficulty])
								: challenge.difficulty}
						</Badge>
					</div>
				)}
			</div>
		</Dialog>
	);
}
