import { PlayerCombat } from './Combat';
import { usePlayerData } from './usePlayerData';
import { useState } from 'react';
import { Button, Badge, EmptyState, Icon, Select, Tabs, tabPanelProps } from '../../ds';
import type { DSChangeEvent } from '../../ds';
import { Page, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useViewport } from '../../app/useViewport';
import { cap } from './shared';
import { PrintableSheet } from '../../app/character/PrintableSheet';
import { Portrait } from './Portrait';
import { SheetSpellcasting } from './SheetSpellcasting';
import { PlayerSheet } from './Sheet';
import { RestDialog } from '../../app/character/RestDialog';
import { PlayerResources } from './Vitals';
import { PlayerParty } from './Party';
import { PlayerLevelUp } from './Advancement';
import { PlayerJournal } from './Journal';
import { CharacterHistoryTimeline } from '../../app/character/History';
import { PartyStash } from '../../app/character/PartyStash';

export function Player() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const viewport = useViewport();
	const actorId = runtime.defaultActorId;

	// The switcher's selection — null falls back to the first visible PC. A signed-in player may
	// control multiple PCs (multiple `owner` grants / shared PCs), so the pick is theirs, not `pcs[0]`.
	const [pcChoice, setPcChoice] = useState<string | null>(null);

	const data = usePlayerData(pcChoice);

	const C = data.view;
	const [tab, setTab] = useState('sheet');
	const [err, setErr] = useState<string | null>(null);
	const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
	// The HP stepper was ±1-only, so taking 27 damage meant 27 separate durable commands (each one a
	// full-state persist + op-log entry), and a SUCCESSFUL write announced nothing at all — the number
	// changed silently for anyone not looking at it. The amount is a string draft so backspacing to
	// empty doesn't snap to a coerced value mid-edit.
	const [restKind, setRestKind] = useState<'short' | 'long' | null>(null);
	const [hpAmount, setHpAmount] = useState('1');
	const [hpNote, setHpNote] = useState<string | null>(null);

	// A `data.<key>` sheet string authored through `character.edit-field` (draft flow / advancement /
	// the identity editor below). Null when the field was never written — rendered honestly as absent.
	const ds = (key: string): string | null => {
		const v = C?.data?.[key];
		return typeof v === 'string' && v.trim() !== '' ? v : null;
	};

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		setErr(null);
		setHpNote(null);
		setSaveState('saving');
		try {
			const result = await runtime.dispatch(command);
			if (result.status === 'rejected') {
				setErr(result.rejection.message);
				setSaveState('idle');
				return false;
			}
			setSaveState('saved');
			return true;
		} catch {
			setSaveState('idle');
			setErr(t('player.saveFailed'));
			return false;
		}
	}

	if (!C || !data.characterId) {
		return (
			<Page max={1080}>
				<section aria-labelledby="player-empty-title">
					<h2 id="player-empty-title">{t('player.empty.title')}</h2>
					<EmptyState illustration="characters-empty" description={t('player.empty.body')} />
				</section>
			</Page>
		);
	}

	const charId = data.characterId;
	const hp = C.combat.hp;
	const maxHp = C.combat.maxHp;
	const conditions = C.combat.conditions;
	const name = C.name;
	const level = data.advancement?.level ?? null;
	// Real inspiration flag, persisted as the `data.inspiration` sheet string ('yes' when inspired).
	const insp = ds('inspiration') === 'yes';

	const tabs = [
		{ id: 'sheet', label: t('player.tab.sheet'), icon: 'characters-person' },
		{ id: 'resources', label: t('player.tab.resources'), icon: 'sparkle' },
		{ id: 'party', label: t('player.tab.party'), icon: 'players' },
		// The level-up tab drives the REAL staged advancement — shown only to an actor the core would
		// authorize (DM / granted owner), so it is never a dead surface.
		...(data.canAdvance ? [{ id: 'levelup', label: t('player.tab.levelUp'), icon: 'flag' }] : []),
		{ id: 'journal', label: t('player.tab.journal'), icon: 'note-edit' },
		// RC-CHR-2.3 — the history timeline reads the SAME actor-filtered journal already fetched
		// above for the journal tab; no extra query.
		{ id: 'history', label: t('player.tab.history'), icon: 'recent' },
	];
	const activeTab = tabs.some((t) => t.id === tab) ? tab : 'sheet';

	// Real HP write: the only HP path is the combat-resource command, which the Core gates on an ACTIVE
	// session. In the idle seed it is rejected read-only — the value snaps back and the reason surfaces.
	const hpStep = () => {
		const n = Math.trunc(Number(hpAmount));
		return Number.isFinite(n) && n > 0 ? n : 1;
	};
	const stepHp = async (sign: 1 | -1) => {
		const amount = hpStep();
		setHpNote(null);
		if (
			await dispatch({
				type: 'character.update-combat-resource',
				actorId,
				payload: { characterId: charId, kind: 'hp', delta: sign * amount },
			})
		)
			setHpNote(t(sign < 0 ? 'player.hp.damaged' : 'player.hp.healed', { amount }));
	};
	// Real inspiration toggle: `character.edit-field` on the `data.inspiration` sheet string.
	const toggleInspiration = () =>
		dispatch({
			type: 'character.edit-field',
			actorId,
			payload: { characterId: charId, path: 'data.inspiration', value: insp ? '' : 'yes' },
		});

	// Identity line — composed ONLY from real fields (class/level/background/subclass from the draft
	// flow + advancement commits; race authored via the identity editor). Absent pieces are omitted.
	const cls = ds('class');
	const identityLine = [
		ds('race'),
		`${cls ? cap(cls) : t('player.identity.adventurer')}${level != null ? ` ${level}` : ''}${ds('subclass') ? ` (${cap(ds('subclass')!)})` : ''}`,
		ds('background') ? t('player.identity.background', { name: cap(ds('background')!) }) : null,
	]
		.filter(Boolean)
		.join(' · ');

	return (
		<div className="player-surface">
			<PrintableSheet character={C} inventory={data.inventory} level={level} />
			{/* persistent vitals bar */}
			<div
				style={{
					maxWidth: 1080,
					margin: 'var(--space-5) auto',
					borderRadius: 'var(--radius-md)',
					boxShadow: 'var(--shadow-sm)',
					top: 0,
					zIndex: 5,
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-4)',
					padding: 'var(--space-3) var(--space-6)',
					background: 'color-mix(in srgb, var(--color-surface) 94%, transparent)',
					backdropFilter: 'blur(6px)',
					borderBottom: `1px solid ${T.bd}`,
					flexWrap: 'wrap',
				}}
			>
				<Portrait
					key={charId}
					character={C}
					actorId={actorId}
					canEdit={data.isDm && !data.readOnlyPreview}
					dispatch={dispatch}
				/>
				<div style={{ minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
						<span style={{ font: `700 var(--text-xl) ${T.disp}` }}>{name}</span>
						<Badge status="success">{t('player.pcBadge')}</Badge>
					</div>
					<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>{identityLine}</div>
				</div>
				{/* PC switcher — a signed-in player may control multiple PCs (the actor-filtered list);
				    the whole surface (sheet/resources/level-up/journal) follows the selection. */}
				{data.pcs.length > 1 && (
					<Select
						value={charId}
						onChange={(e: DSChangeEvent) => {
							// The error banner is screen-level and was only ever cleared by the NEXT
							// successful dispatch, so a rejected write kept accusing the user from the top
							// of an unrelated character or tab.
							setErr(null);
							setHpNote(null);
							setRestKind(null);
							setPcChoice(e.target.value);
						}}
						options={data.pcs.map((p) => ({ value: p.id, label: p.name }))}
						aria-label={t('player.switchCharacter')}
					/>
				)}

				{activeTab === 'sheet' && data.canManageResources && (
					<div className="character-sheet-rest">
						<Button variant="ghost" size="sm" onClick={() => setRestKind('short')}>
							{t('player.vitals.shortRest')}
						</Button>
						<Button variant="secondary" size="sm" onClick={() => setRestKind('long')}>
							{t('player.vitals.longRest')}
						</Button>
					</div>
				)}

				<Button
					variant="secondary"
					type="button"
					aria-pressed={insp}
					aria-disabled={data.readOnlyPreview || undefined}
					title={data.readOnlyPreview ? t('player.blockedPreview') : undefined}
					onClick={data.readOnlyPreview ? undefined : toggleInspiration}
					style={{
						marginLeft: 'auto',
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'var(--space-1-5)',
						padding: 'var(--space-1-5) var(--space-3)',
						borderRadius: 'var(--radius-full)',
						cursor: data.readOnlyPreview ? 'not-allowed' : 'pointer',
						opacity: data.readOnlyPreview ? 0.6 : 1,
						border: `1px solid ${insp ? T.accBd : T.bd}`,
						background: insp ? T.accSub : T.surf,
						color: insp ? T.acc : T.ter,
						font: `600 var(--text-xs) ${T.sans}`,
					}}
				>
					<Icon name="sparkle" size={15} />
					{t(insp ? 'player.inspiration.on' : 'player.inspiration.off')}
				</Button>
			</div>

			<RestDialog
				open={restKind !== null && data.canManageResources}
				defaultRest={restKind ?? 'short'}
				subject={{
					id: charId,
					name,
					hp,
					maxHp,
					hitDice: C.proficiencies.hitDice,
					conMod: Math.floor(((C.abilityScores.con ?? 10) - 10) / 2),
					exhaustion: data.resources?.exhaustion ?? 0,
				}}
				onClose={() => setRestKind(null)}
				onConfirm={(choice) => {
					setRestKind(null);
					void dispatch({
						type: 'character.rest',
						actorId,
						payload: { characterId: charId, ...choice },
					});
				}}
			/>

			{/* A successful HP write used to change only the number, which announces nothing. */}
			<div role="status" className="player-save-status">
				{saveState === 'saving'
					? t('player.saving')
					: (hpNote ?? (saveState === 'saved' ? t('player.saved') : ''))}
			</div>

			{err && (
				<div
					role="alert"
					aria-live="assertive"
					style={{
						padding: 'var(--space-2) var(--space-6)',
						background: 'var(--color-status-warning-subtle)',
						borderBottom: `1px solid var(--color-status-warning-border)`,
					}}
				>
					<span
						style={{ font: `var(--text-xs) ${T.sans}`, color: 'var(--color-status-warning-text)' }}
					>
						<Icon name="warning" size={13} /> {err}
					</span>
				</div>
			)}

			<Page max={1080}>
				<div style={{ marginBottom: 'var(--space-4)' }}>
					<Tabs
						aria-label={t('player.sections')}
						value={activeTab}
						onChange={(next: string) => {
							setErr(null);
							setHpNote(null);
							setTab(next);
						}}
						tabs={tabs}
						idBase="player"
					/>
				</div>
				{/* One panel element, re-labelled per active tab — only one body is ever mounted. */}
				<div {...tabPanelProps('player', activeTab)}>
					{/* Keyed by charId on purpose. The PC picker in the vitals bar stays mounted across a
				    switch, so without a key these bodies kept the PREVIOUS character's draft state —
				    and `saveEdit` diffs those drafts against the NEW `C`, writing person A's race,
				    subclass, background and speed onto person B with no warning and no undo. */}
					{activeTab === 'sheet' && (
						<PlayerSheet
							key={charId}
							C={C}
							level={level}
							isDm={data.isDm && !data.readOnlyPreview}
							combat={
								<PlayerCombat
									hp={hp}
									maxHp={maxHp}
									ac={C.combat.ac}
									speed={ds('speed')}
									initiative={ds('init')}
									conditions={conditions}
									readOnly={data.readOnlyPreview}
									hpAmount={hpAmount}
									setHpAmount={setHpAmount}
									hpStep={hpStep}
									stepHp={stepHp}
								/>
							}
							spellcasting={
								<SheetSpellcasting
									resources={data.resources}
									charId={charId}
									actorId={actorId}
									canManage={data.canManageResources}
									dispatch={dispatch}
								/>
							}
							charId={charId}
							actorId={actorId}
							passive={data.passive}
							profBonus={data.profBonus}
							inventory={data.inventory}
							encumbrance={data.encumbrance}
							canManageInventory={data.canManageInventory}
							dispatch={dispatch}
						/>
					)}
					{activeTab === 'resources' && (
						<PlayerResources
							key={charId}
							charId={charId}
							resources={data.resources}
							resourceInstances={data.resourceInstances}
							canManageResources={data.canManageResources}
							actorId={actorId}
							compact={viewport === 'phone'}
							// RC-CHR-1.2 — what the rest dialog needs, all from the actor-scoped view: the
							// hit dice on the sheet, the hit-point pool a rest heals, the CON modifier the
							// core adds to each spent die, and the exhaustion a long rest steps down.
							restSubject={
								C
									? {
											id: charId,
											name: C.name,
											hp: C.combat.hp,
											maxHp: C.combat.maxHp,
											hitDice: C.proficiencies.hitDice,
											conMod: Math.floor(((C.abilityScores.con ?? 10) - 10) / 2),
											exhaustion: data.resources?.exhaustion ?? 0,
										}
									: null
							}
							dispatch={dispatch}
						/>
					)}
					{activeTab === 'party' && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
							<PlayerParty
								party={data.party}
								selfId={charId}
								isDm={data.isDm}
								actorId={actorId}
								compact={viewport === 'phone'}
								dispatch={dispatch}
							/>
							{/* RC-CHR-3.2 — party stash v2 supersedes the name/detail-only stash that used to
							    be embedded in PlayerParty (quantity/weight, claim-to-PC, deposit, baseline). */}
							<PartyStash
								key={charId}
								party={data.party}
								partyStrength={data.partyStrength}
								selfId={charId}
								selfName={name}
								selfInventory={data.inventory}
								isDm={data.isDm}
								canClaim={data.canManageInventory}
								actorId={actorId}
								dispatch={dispatch}
							/>
						</div>
					)}
					{activeTab === 'levelup' && data.canAdvance && (
						<PlayerLevelUp
							key={charId}
							charId={charId}
							actorId={actorId}
							advancement={data.advancement}
							xpEligible={data.xpEligible}
							milestoneEligible={data.milestoneEligible}
							dispatch={dispatch}
						/>
					)}
					{activeTab === 'journal' && (
						<PlayerJournal
							key={charId}
							charId={charId}
							actorId={actorId}
							entries={data.journal}
							canAuthor={data.canAuthorJournal}
							compact={viewport === 'phone'}
							dispatch={dispatch}
						/>
					)}
					{activeTab === 'history' && (
						<CharacterHistoryTimeline key={charId} characterName={name} entries={data.journal} />
					)}
				</div>
			</Page>
		</div>
	);
}
