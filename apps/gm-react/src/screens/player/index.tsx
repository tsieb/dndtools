import { usePlayerData } from './usePlayerData';
import { useMemo, useState } from 'react';
import { Button, Badge, EmptyState, Icon, Select } from '../../ds';
import type { DSChangeEvent } from '../../ds';
import { Page, T, useSingleColumn } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useViewport } from '../../app/useViewport';
import { cap } from './shared';
import { PrintableSheet } from '../../app/character/PrintableSheet';
import { Portrait } from './Portrait';
import { RestDialog } from '../../app/character/RestDialog';
import { restSubjectOf } from './Vitals';
import { PlayerParty } from './Party';
import { PartyStash } from '../../app/character/PartyStash';
import { sheetCapabilitiesFor } from '../characters/sheet/capabilities';
import { useSheetFeedback } from '../characters/sheet/feedback';
import { SheetBody } from '../characters/sheet/SheetBody';
import { buildSheetSubject } from '../characters/sheet/subject';

/**
 * `/player` — the DM shell's entry to the one character sheet body (RC-CHR-6.2): this frame keeps the
 * route, the PC picker, the vitals bar (portrait, identity, rests, inspiration), the PDF export and the
 * Party tab; the sheet itself is `SheetBody`, the same composition `/characters/:id` and the companion
 * render, gated by the core's authority for this actor on the chosen PC.
 */
export function Player() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const viewport = useViewport();
	const singleColumn = useSingleColumn();
	const actorId = runtime.defaultActorId;

	// The switcher's selection — null falls back to the first visible PC. A signed-in player may
	// control multiple PCs (multiple `owner` grants / shared PCs), so the pick is theirs, not `pcs[0]`.
	const [pcChoice, setPcChoice] = useState<string | null>(null);
	const data = usePlayerData(pcChoice);
	const charId = data.characterId;
	const subject = useMemo(
		() => (charId ? buildSheetSubject(runtime.state, actorId, charId) : null),
		[runtime.state, actorId, charId],
	);
	const [tab, setTab] = useState('sheet');
	const [restKind, setRestKind] = useState<'short' | 'long' | null>(null);
	const feedback = useSheetFeedback({
		run: async (command) => {
			const result = await runtime.dispatch(command);
			return result.status === 'rejected'
				? { ok: false, message: result.rejection.message }
				: { ok: true };
		},
		newId: () => runtime.newId(),
		failure: () => t('player.saveFailed'),
		savedNote: t('player.saved'),
	});

	if (!subject || !charId) {
		return (
			<Page max={1080}>
				<section aria-labelledby="player-empty-title">
					<h2 id="player-empty-title">{t('player.empty.title')}</h2>
					<EmptyState illustration="characters-empty" description={t('player.empty.body')} />
				</section>
			</Page>
		);
	}

	const caps = sheetCapabilitiesFor(runtime.state, actorId, charId, runtime.readOnly);
	const C = subject.view;
	const name = C.name;
	const level = subject.level;
	// A `data.<key>` sheet string; null when the field was never written — rendered honestly as absent.
	const ds = (key: string): string | null => {
		const v = C.data?.[key];
		return typeof v === 'string' && v.trim() !== '' ? v : null;
	};
	// Real inspiration flag, persisted as the `data.inspiration` sheet string ('yes' when inspired).
	const insp = ds('inspiration') === 'yes';
	// Inspiration is an owner-or-DM field write; without it the toggle is a readout.
	const inspBlocked = !caps.manage;
	const toggleInspiration = () =>
		feedback.io.dispatch({
			type: 'character.edit-field',
			actorId,
			payload: { characterId: charId, path: 'data.inspiration', value: insp ? '' : 'yes' },
		});

	// Identity line — composed ONLY from real fields (class/level/background/subclass from the draft
	// flow + advancement commits; race authored in the Identity panel). Absent pieces are omitted.
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
			<PrintableSheet character={C} inventory={subject.inventory} level={level} />
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
					canEdit={caps.dm}
					dispatch={feedback.io.dispatch}
				/>
				<div style={{ minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
						<span style={{ font: `700 var(--text-xl) ${T.disp}` }}>{name}</span>
						<Badge status="success">{t('player.pcBadge')}</Badge>
					</div>
					<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>{identityLine}</div>
				</div>
				{/* PC switcher — a signed-in player may control multiple PCs (the actor-filtered list);
				    the whole sheet body follows the selection. */}
				{data.pcs.length > 1 && (
					<Select
						value={charId}
						onChange={(e: DSChangeEvent) => {
							// The banners are frame-level: a rejected write must not keep accusing the user
							// from the top of an unrelated character.
							feedback.clear();
							setRestKind(null);
							setPcChoice(e.target.value);
						}}
						options={data.pcs.map((p) => ({ value: p.id, label: p.name }))}
						aria-label={t('player.switchCharacter')}
					/>
				)}

				{tab === 'sheet' && caps.manage && (
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
					aria-disabled={inspBlocked || undefined}
					title={data.readOnlyPreview ? t('player.blockedPreview') : undefined}
					onClick={inspBlocked ? undefined : toggleInspiration}
					style={{
						marginLeft: 'auto',
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'var(--space-1-5)',
						padding: 'var(--space-1-5) var(--space-3)',
						borderRadius: 'var(--radius-full)',
						cursor: inspBlocked ? 'not-allowed' : 'pointer',
						opacity: inspBlocked ? 0.6 : 1,
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
				open={restKind !== null && caps.manage}
				defaultRest={restKind ?? 'short'}
				subject={restSubjectOf(subject)}
				onClose={() => setRestKind(null)}
				onConfirm={(choice) => {
					setRestKind(null);
					void feedback.io.dispatch({
						type: 'character.rest',
						actorId,
						payload: { characterId: charId, ...choice },
					});
				}}
			/>

			{/* A successful write otherwise changes only a number, which announces nothing. */}
			<div role="status" className="player-save-status">
				{feedback.saving ? t('player.saving') : feedback.note}
			</div>

			{feedback.error && (
				<div
					key={feedback.error.seq}
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
						<Icon name="warning" size={13} /> {feedback.error.text}
					</span>
				</div>
			)}

			<Page max={1080}>
				<SheetBody
					subject={subject}
					caps={caps}
					actorId={actorId}
					io={feedback.io}
					singleColumn={singleColumn}
					compact={viewport === 'phone'}
					idBase="player"
					section={tab}
					onSectionChange={(next) => {
						feedback.clear();
						setTab(next);
					}}
					frameSections={[
						{
							// The party and its stash are the DM shell's own tab, not a panel of this sheet.
							id: 'party',
							label: t('player.tab.party'),
							icon: 'players',
							after: 'resources',
							render: () => (
								<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
									<PlayerParty
										party={data.party}
										selfId={charId}
										isDm={data.isDm}
										actorId={actorId}
										compact={viewport === 'phone'}
										dispatch={feedback.io.dispatch}
									/>
									{/* RC-CHR-3.2 — party stash v2 (quantity/weight, claim-to-PC, deposit, baseline). */}
									<PartyStash
										key={charId}
										party={data.party}
										partyStrength={data.partyStrength}
										selfId={charId}
										selfName={name}
										selfInventory={subject.inventory}
										isDm={data.isDm}
										canClaim={caps.manage}
										actorId={actorId}
										dispatch={feedback.io.dispatch}
									/>
								</div>
							),
						},
					]}
				/>
			</Page>
		</div>
	);
}
