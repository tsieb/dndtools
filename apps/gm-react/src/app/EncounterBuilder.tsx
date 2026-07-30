import { useEffect, useMemo, useState } from 'react';
import {
	computeEncounterChallenge,
	listCharactersForActor,
	type CommandResult,
} from '@dndtools/core';
import {
	Badge,
	Button,
	Dialog,
	Field,
	Icon,
	IconButton,
	Input,
	ProgressMeter,
	Toaster,
} from '../ds';
import { T, eb } from './screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * EncounterBuilder — the Session screen's encounter-composition dialog (SES-006 → SES-002), split
 * out of Session.tsx for size. `start` mode picks combatants from the real roster across kinds,
 * quick-adds ad-hoc monsters, sets/rolls per-combatant initiative, shows the deterministic challenge
 * budget (`computeEncounterChallenge`), then dispatches `encounter.build` → `combat.start`.
 * `reinforce` mode feeds the same roster picker into RUNNING combat via `combat.add-combatants`
 * (blank initiative auto-rolls in the core).
 */

export type RosterCharacter = ReturnType<typeof listCharactersForActor>[number];

function extractId(result: CommandResult, key: string): string | null {
	if (result.status !== 'accepted') return null;
	for (const event of result.events) {
		const value = (event as Record<string, unknown>)[key];
		if (typeof value === 'string') return value;
	}
	return null;
}

let draftKeySeq = 0;

interface DraftRow {
	key: string;
	/** The tracker combatant kind — vault PCs stay `character` (live sheet mirroring); foes are instances. */
	kind: 'character' | 'npc' | 'monster';
	name: string;
	characterId: string | null;
	maxHp: number;
	ac: number;
	/** Kept as text so blank can mean "auto-roll" (locally at start; core 1d20 on mid-combat add). */
	initiative: string;
	cr: number;
	quantity: number;
	hidden: boolean;
	dexMod: number;
}

function dexModOf(c: RosterCharacter): number {
	const dex = typeof c.abilityScores?.dex === 'number' ? c.abilityScores.dex : 10;
	return Math.floor((dex - 10) / 2);
}

function rowFromCharacter(c: RosterCharacter): DraftRow {
	// Vault PCs join as `character` combatants (the core mirrors their live sheet HP). NPC/monster
	// sheets seed per-encounter instances instead — three goblins must not share one sheet.
	const kind = c.kind === 'pc' ? 'character' : c.kind === 'monster' ? 'monster' : 'npc';
	const data = c.data as Record<string, unknown>;
	return {
		key: `char-${c.id}`,
		kind,
		name: c.name,
		characterId: c.id,
		maxHp: c.combat?.maxHp ?? 0,
		ac: c.combat?.ac ?? 10,
		initiative: '',
		cr: typeof data.cr === 'number' ? (data.cr as number) : 1,
		quantity: 1,
		hidden: false,
		dexMod: dexModOf(c),
	};
}

const DIFFICULTY_BADGE: Record<string, 'neutral' | 'success' | 'info' | 'warning' | 'error'> = {
	trivial: 'neutral',
	easy: 'success',
	medium: 'info',
	hard: 'warning',
	deadly: 'error',
};

const KIND_GROUPS: { label: string; match: (c: RosterCharacter) => boolean }[] = [
	{ label: 'Party', match: (c) => c.kind === 'pc' },
	{ label: 'NPCs', match: (c) => c.kind === 'npc' || c.kind === 'sidekick' },
	{ label: 'Monsters', match: (c) => c.kind === 'monster' },
];

export function EncounterDialog({
	mode,
	onClose,
	characters,
	party,
	defaultTitle,
}: {
	mode: 'start' | 'reinforce' | null;
	onClose: () => void;
	characters: RosterCharacter[];
	party: RosterCharacter[];
	defaultTitle: string;
}) {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const open = mode !== null;

	const [rows, setRows] = useState<DraftRow[]>([]);
	const [title, setTitle] = useState('');
	const [partySize, setPartySize] = useState(4);
	const [partyLevel, setPartyLevel] = useState(3);
	const [qName, setQName] = useState('');
	const [qHp, setQHp] = useState(7);
	const [qAc, setQAc] = useState(13);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	// Re-seed the draft each time the dialog opens: starting a fight pre-selects the party (the
	// common case — the DM then adds foes); reinforcing starts empty.
	useEffect(() => {
		if (!open) return;
		setRows(mode === 'start' ? party.map(rowFromCharacter) : []);
		setTitle(defaultTitle);
		setPartySize(Math.max(1, party.length || 4));
		const levels = party
			.map((c) => Number((c.data as Record<string, unknown>).level))
			.filter((n) => Number.isFinite(n) && n >= 1);
		setPartyLevel(
			levels.length
				? Math.min(20, Math.round(levels.reduce((a, b) => a + b, 0) / levels.length))
				: 3,
		);
		setQName('');
		setQHp(7);
		setQAc(13);
		setError(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open/mode change
	}, [open, mode]);

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
					size: Math.max(1, Math.trunc(partySize) || 1),
					averageLevel: Math.min(20, Math.max(1, Math.trunc(partyLevel) || 1)),
				},
			),
		[rows, partySize, partyLevel],
	);

	function patchRow(key: string, patch: Partial<DraftRow>) {
		setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
	}

	// Raw text for the CR fields while they are being edited. Coercing on every keystroke made the
	// two most common low-tier ratings impossible to type: `Number('0.')` is 0, so the controlled
	// input snapped back and swallowed the decimal point before "0.25"/"0.5" could be entered.
	const [crDrafts, setCrDrafts] = useState<Record<string, string>>({});
	function commitCr(key: string) {
		const draft = crDrafts[key];
		setCrDrafts(({ [key]: _dropped, ...rest }) => rest);
		if (draft === undefined || draft.trim() === '') return;
		const parsed = Number(draft);
		if (Number.isFinite(parsed)) patchRow(key, { cr: Math.max(0, parsed) });
	}

	function toggleCharacter(c: RosterCharacter) {
		const key = `char-${c.id}`;
		setRows((prev) =>
			prev.some((r) => r.key === key)
				? prev.filter((r) => r.key !== key)
				: [...prev, rowFromCharacter(c)],
		);
	}

	function quickAdd() {
		const name = qName.trim();
		if (!name) return;
		draftKeySeq += 1;
		setRows((prev) => [
			...prev,
			{
				key: `quick-${draftKeySeq}`,
				kind: 'monster',
				name,
				characterId: null,
				maxHp: Math.max(0, Math.trunc(qHp) || 0),
				ac: Math.max(0, Math.trunc(qAc) || 10),
				initiative: '',
				cr: 1,
				quantity: 1,
				hidden: false,
				dexMod: 0,
			},
		]);
		setQName('');
	}

	function rollInitiative(row: DraftRow) {
		// A plain table-side d20 + DEX mod pre-fill — the DM can still type over it.
		patchRow(row.key, { initiative: String(1 + Math.floor(Math.random() * 20) + row.dexMod) });
	}

	async function launch(): Promise<void> {
		if (rows.length === 0) {
			setError('Pick at least one combatant.');
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
				Toaster.success('Reinforcements joined the initiative order');
				onClose();
				return;
			}
			// Start mode: build the durable encounter (SES-006), then run it (SES-002).
			const built = await runtime.dispatch({
				type: 'encounter.build',
				actorId,
				payload: {
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
						size: Math.max(1, Math.trunc(partySize) || 1),
						averageLevel: Math.min(20, Math.max(1, Math.trunc(partyLevel) || 1)),
					},
				},
			});
			if (built.status === 'rejected') {
				setError(built.rejection.message);
				return;
			}
			const encounterId = extractId(built, 'encounterId') ?? extractId(built, 'id');
			if (!encounterId) {
				setError('The encounter couldn’t be started — try again.');
				return;
			}
			const started = await runtime.dispatch({
				type: 'combat.start',
				actorId,
				payload: { encounterId },
			});
			if (started.status === 'rejected') {
				setError(started.rejection.message);
				return;
			}
			Toaster.success('Combat started — initiative is up');
			onClose();
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title={mode === 'reinforce' ? 'Add combatants' : 'Build encounter'}
			description={
				mode === 'reinforce'
					? 'Reinforcements join the running initiative order. Blank initiative auto-rolls a d20.'
					: 'Pick combatants from your roster, set or roll initiative, and start the fight.'
			}
			icon="sword"
			size="lg"
			footer={
				<>
					<Button variant="ghost" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon={mode === 'reinforce' ? 'add' : 'sword'}
						disabled={submitting || rows.length === 0}
						onClick={() => void launch()}
					>
						{submitting ? 'Working…' : mode === 'reinforce' ? 'Add to combat' : 'Start combat'}
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
					<Field label="Encounter title">
						<Input
							value={title}
							onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
							placeholder="Ambush at the docks"
						/>
					</Field>
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
								<div style={{ ...eb, marginBottom: 6 }}>{group.label}</div>
								{members.length === 0 ? (
									<div style={{ font: `12px ${T.sans}`, color: T.ter }}>None in the vault.</div>
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
														HP {c.combat?.maxHp ?? '—'} · AC {c.combat?.ac ?? '—'}
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

				{/* Ad-hoc quick add — a monster that is not in the vault yet. */}
				<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
					<Field label="Quick add" style={{ flex: '2 1 160px' }}>
						<Input
							value={qName}
							placeholder="e.g. Brine Cultist"
							onChange={(e: { target: { value: string } }) => setQName(e.target.value)}
							onKeyDown={(e: { key: string }) => {
								if (e.key === 'Enter') quickAdd();
							}}
						/>
					</Field>
					<Field label="HP" style={{ width: 72 }}>
						<Input
							type="number"
							min={0}
							value={qHp}
							onChange={(e: { target: { value: string } }) =>
								setQHp(Math.max(0, Math.trunc(Number(e.target.value) || 0)))
							}
						/>
					</Field>
					<Field label="AC" style={{ width: 72 }}>
						<Input
							type="number"
							min={0}
							value={qAc}
							onChange={(e: { target: { value: string } }) =>
								setQAc(Math.max(0, Math.trunc(Number(e.target.value) || 0)))
							}
						/>
					</Field>
					<Button
						variant="secondary"
						size="sm"
						icon="add"
						disabled={!qName.trim()}
						onClick={quickAdd}
					>
						Add
					</Button>
				</div>

				{/* The draft roster — per-combatant initiative (typed or rolled), count, CR, visibility. */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
					<div style={eb}>Combatants · {rows.length}</div>
					{rows.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Nothing picked yet.</div>
					) : (
						rows.map((r) => (
							<div
								key={r.key}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									padding: '6px 10px',
									borderRadius: 8,
									border: `1px solid ${T.bd}`,
									background: T.surf,
									flexWrap: 'wrap',
								}}
							>
								<span
									style={{
										flex: '1 1 120px',
										minWidth: 0,
										font: `600 13px ${T.sans}`,
										color: T.ink,
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
									}}
								>
									{r.name}
								</span>
								<label
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 5,
										font: `11px ${T.sans}`,
										color: T.ter,
									}}
								>
									Init
									<Input
										value={r.initiative}
										placeholder="auto"
										aria-label={`${r.name} initiative`}
										style={{ width: 58, textAlign: 'center', fontFamily: T.mono }}
										onChange={(e: { target: { value: string } }) =>
											patchRow(r.key, { initiative: e.target.value.replace(/[^-\d]/g, '') })
										}
									/>
								</label>
								<IconButton
									icon="dice"
									label={`Roll initiative for ${r.name}`}
									variant="ghost"
									size="sm"
									onClick={() => rollInitiative(r)}
								/>
								{r.kind !== 'character' && (
									<>
										<label
											style={{
												display: 'inline-flex',
												alignItems: 'center',
												gap: 5,
												font: `11px ${T.sans}`,
												color: T.ter,
											}}
										>
											×
											<Input
												type="number"
												min={1}
												max={20}
												value={r.quantity}
												aria-label={`${r.name} quantity`}
												style={{ width: 56, textAlign: 'center', fontFamily: T.mono }}
												onChange={(e: { target: { value: string } }) =>
													patchRow(r.key, {
														quantity: Math.min(
															20,
															Math.max(1, Math.trunc(Number(e.target.value) || 1)),
														),
													})
												}
											/>
										</label>
										{mode === 'start' && (
											<label
												style={{
													display: 'inline-flex',
													alignItems: 'center',
													gap: 5,
													font: `11px ${T.sans}`,
													color: T.ter,
												}}
											>
												CR
												<Input
													type="number"
													min={0}
													step={0.25}
													value={crDrafts[r.key] ?? r.cr}
													aria-label={`${r.name} challenge rating`}
													style={{ width: 62, textAlign: 'center', fontFamily: T.mono }}
													onChange={(e: { target: { value: string } }) =>
														setCrDrafts((d) => ({ ...d, [r.key]: e.target.value }))
													}
													onBlur={() => commitCr(r.key)}
													onKeyDown={(e: { key: string; preventDefault: () => void }) => {
														if (e.key === 'Enter') {
															e.preventDefault();
															commitCr(r.key);
														}
													}}
												/>
											</label>
										)}
										<IconButton
											icon={r.hidden ? 'visibility-hidden' : 'visibility-players'}
											label={
												r.hidden
													? `${r.name} starts hidden from players`
													: `${r.name} starts visible to players`
											}
											variant="ghost"
											size="sm"
											aria-pressed={r.hidden}
											onClick={() => patchRow(r.key, { hidden: !r.hidden })}
										/>
									</>
								)}
								<IconButton
									icon="close"
									label={`Remove ${r.name} from the draft`}
									variant="ghost"
									size="sm"
									onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
								/>
							</div>
						))
					)}
					<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						Blank initiative auto-rolls a d20{mode === 'start' ? ' + DEX modifier' : ''}. Hidden
						foes show players an “Unknown creature” placeholder.
					</div>
				</div>

				{/* Challenge budget — the deterministic core guidance (the template's XP-budget meter). */}
				{mode === 'start' && (
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
						<Field label="Party size" style={{ width: 84 }}>
							<Input
								type="number"
								min={1}
								value={partySize}
								onChange={(e: { target: { value: string } }) =>
									setPartySize(Math.max(1, Math.trunc(Number(e.target.value) || 1)))
								}
							/>
						</Field>
						<Field label="Avg level" style={{ width: 84 }}>
							<Input
								type="number"
								min={1}
								max={20}
								value={partyLevel}
								onChange={(e: { target: { value: string } }) =>
									setPartyLevel(Math.min(20, Math.max(1, Math.trunc(Number(e.target.value) || 1))))
								}
							/>
						</Field>
						<div style={{ flex: '1 1 200px', minWidth: 160 }}>
							<ProgressMeter
								label="Challenge budget"
								value={challenge.encounterPoints}
								max={Math.max(1, challenge.partyDeadlyThreshold)}
								valueLabel={`${challenge.encounterPoints} / ${challenge.partyDeadlyThreshold} pts`}
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
							{challenge.difficulty}
						</Badge>
					</div>
				)}
			</div>
		</Dialog>
	);
}
