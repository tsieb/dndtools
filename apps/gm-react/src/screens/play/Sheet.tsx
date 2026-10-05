import { Avatar, Badge, Chip, ConditionBadge, Icon, Stat } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { CommandRequest } from '../../net/messages';
import { sheetCombatCommands, type SheetWrites } from '../../net/viewModels';
import { capabilitiesFromWrites } from '../characters/sheet/capabilities';
import { useSheetFeedback } from '../characters/sheet/feedback';
import { SheetBody } from '../characters/sheet/SheetBody';
import type { SheetSubject } from '../characters/sheet/subject';
import type { VitalsWrite } from '../characters/sheet/VitalsBlock';
import { condKey, Panel, PvPage, SectionHead, type LiveData } from './shared';
import { useI18n } from '../../i18n';

/**
 * 2 · MY CHARACTER — the player's own sheet. RC-CHR-6.2: the one sheet body `/characters/:id` and
 * `/player` render, writing through `onWrite`: a command REQUEST the host stamps when joined, a local
 * dispatch as the viewer when previewing. Panels and controls follow `writes` (the core's authority
 * for this viewer, folded with read-only preview by the caller), so nothing is drawn the actor cannot
 * dispatch.
 */
export function SheetSection({
	data,
	writes,
	actorId,
	onWrite,
}: {
	data: LiveData;
	writes: SheetWrites;
	actorId: string;
	/** Send one command; resolves false when refused (the caller has already said why). */
	onWrite: (command: CommandRequest) => Promise<boolean>;
}) {
	const { t } = useI18n();
	const viewport = useViewport();
	const runtime = useRuntime();
	// Refusals are already toasted by the frame (`writeSheet`), so a refused write says nothing here.
	const feedback = useSheetFeedback({
		run: async (command) =>
			(await onWrite({ type: command.type, payload: command.payload }))
				? { ok: true }
				: { ok: false, message: null },
		newId: () => runtime.newId(),
		failure: () => t('play.sheet.writeDeclined'),
	});
	const C = data.pc;
	const pcId = data.pcId;
	if (!C || !pcId) {
		return (
			<PvPage max={1140}>
				<SectionHead title={t('play.sheet.title')} />
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>{t('play.sheet.unassigned')}</div>
				</Panel>
			</PvPage>
		);
	}
	// The body's writes carry no actor here: the host (joined) or the caller (preview) stamps it.
	// While the PC fights, a vitals change also lands on its tracker row (see `sheetCombatCommands`).
	const writeVitals = async (write: VitalsWrite) => {
		for (const command of sheetCombatCommands(pcId, data.pcCombatantId ?? null, write)) {
			if (!(await onWrite(command))) return false;
		}
		return true;
	};
	const extra = data.sheet;
	const subject: SheetSubject = {
		id: pcId,
		view: C,
		level: data.level,
		resources: data.resources,
		profBonus: extra?.profBonus ?? null,
		passive: extra?.passive ?? null,
		inventory: extra?.inventory ?? null,
		encumbrance: extra?.encumbrance ?? null,
		advancement: extra?.advancement ?? null,
		xpEligible: extra?.xpEligible ?? null,
		milestoneEligible: extra?.milestoneEligible ?? null,
		journal: data.journal,
		// The companion reads no vault of the DM's to search, and is never the DM who shares.
		mentions: [],
		sharing: null,
	};
	// Real sheet identity: the `data.class` field the draft flow writes + the CHAR-009 level.
	const cls = typeof C.data?.class === 'string' && C.data.class.trim() !== '' ? C.data.class : null;
	const clsLabel = cls ? cls.charAt(0).toUpperCase() + cls.slice(1) : t('play.sheet.adventurer');
	return (
		<div>
			<div
				style={{
					position: 'sticky',
					top: 'var(--native-titlebar-height)',
					zIndex: 5,
					display: 'flex',
					alignItems: 'center',
					gap: T.space.four,
					padding:
						viewport === 'phone'
							? `${T.space.three} ${T.space.four}`
							: `${T.space.three} ${T.space.eight}`,
					background: 'color-mix(in srgb, var(--color-surface) 94%, transparent)',
					backdropFilter: 'blur(6px)',
					borderBottom: `1px solid ${T.bd}`,
					flexWrap: 'wrap',
				}}
			>
				<Avatar name={C.name} size="md" ring="active" />
				<div style={{ minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: T.space.two }}>
						{/* Every other section renders SectionHead's <h1>; the sheet jumped straight to this
						    strip, so the ONE section a player lives in had no heading at all. */}
						<h1 style={{ margin: T.space.zero, font: `700 16px ${T.sans}`, color: T.ink }}>
							{C.name}
						</h1>
						<Badge status="success">{t('play.sheet.pc')}</Badge>
					</div>
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{clsLabel}
						{data.level != null ? t('play.sheet.characterLevel', { level: data.level }) : ''}
					</div>
				</div>
				<div
					style={{
						textAlign: 'center',
						minWidth: 70,
						padding: `${T.space.oneHalf} ${T.space.three}`,
						borderRadius: T.radius.lg,
						background: T.alt,
						border: `1px solid ${T.bd}`,
					}}
				>
					<div
						style={{
							font: `700 18px ${T.mono}`,
							color: C.combat.maxHp > 0 && C.combat.hp / C.combat.maxHp < 0.3 ? T.err : T.ink,
							lineHeight: 1,
						}}
					>
						{C.combat.hp}
						<span style={{ font: `13px ${T.mono}`, color: T.ter }}> / {C.combat.maxHp}</span>
					</div>
					<div style={{ ...eb, color: T.ter }}>{t('play.sheet.hitPoints')}</div>
				</div>
				<Stat label={t('play.sheet.armorClass')} value={String(C.combat.ac)} icon="shield" />
				<div style={{ display: 'flex', gap: T.space.oneHalf, flexWrap: 'wrap' }}>
					{C.combat.conditions.map((c) => {
						const k = condKey(c);
						return k ? (
							<ConditionBadge key={c} condition={k} compact />
						) : (
							<Chip key={c} tone="accent">
								{c}
							</Chip>
						);
					})}
				</div>
				{/* A successful write otherwise changes only a number, which announces nothing. */}
				<div role="status" style={{ font: `12px ${T.sans}`, color: T.sub }}>
					{feedback.note}
				</div>
			</div>
			{feedback.error && (
				<div
					key={feedback.error.seq}
					role="alert"
					style={{
						padding: `${T.space.two} ${T.space.four}`,
						font: `12px ${T.sans}`,
						color: 'var(--color-status-warning-text)',
						background: 'var(--color-status-warning-subtle)',
					}}
				>
					<Icon name="warning" size={13} /> {feedback.error.text}
				</div>
			)}
			<PvPage max={1140}>
				<SheetBody
					subject={subject}
					caps={capabilitiesFromWrites(writes)}
					actorId={actorId}
					io={feedback.io}
					writeVitals={writeVitals}
					singleColumn={viewport === 'phone'}
					compact={viewport !== 'desktop'}
					idBase="play-sheet"
				/>
			</PvPage>
		</div>
	);
}
