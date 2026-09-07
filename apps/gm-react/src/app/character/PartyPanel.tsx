import { useState, type ReactNode } from 'react';
import { Avatar, Badge, Chip, ConditionBadge, HPBar, Icon } from '../../ds';
import { T } from '../screen-kit';
import { useI18n } from '../../i18n';
import { condKey } from '../../screens/play/shared';
import type { PartyMemberVitals } from '../../net/viewModels';

/**
 * RC-CHR-3.1 — the LIVE PARTY PANEL, in three densities over ONE data shape
 * ({@link PartyMemberVitals}, computed in `net/viewModels.ts` and replicated verbatim to a joined
 * player device):
 *
 *   - {@link PartyBoardTiles} — the BOARD TILE row: name, HP meter, condition count. What a player
 *     glances at mid-combat without leaving the stage.
 *   - {@link PartyQuickPanel} — the QUICK PANEL: HP, AC, conditions, concentration, one-line slot
 *     summary. No expansion; it is meant to be read, not driven.
 *   - {@link PartySheet} — the full SHEET: the quick panel plus a per-level spellcaster slot
 *     breakdown, COLLAPSED by default behind a real button (`aria-expanded`), so the common case
 *     stays scannable and the detail is one keystroke away.
 *
 * These are pure presentation. Every vital already passed the actor-filtered query layer on the DM
 * device, so there is nothing to hide here — a member the viewer may not see never arrives, and a
 * withheld field arrives as `null`/`[]` rather than as a placeholder announcing the omission.
 */

/** HP meter + the temp-HP rider, shared by all three densities. */
function Vitals({ m, size }: { m: PartyMemberVitals; size: 'sm' | 'md' }) {
	const { t } = useI18n();
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
			<div style={{ flex: 1, minWidth: 0 }}>
				<HPBar current={m.hp} max={m.maxHp} size={size} />
			</div>
			{m.tempHp > 0 && (
				<span style={{ font: `11px ${T.mono}`, color: T.info, whiteSpace: 'nowrap' }}>
					{t('play.party.tempHp', { value: m.tempHp })}
				</span>
			)}
		</div>
	);
}

/** The visible condition set, as condition badges (unknown names fall back to a neutral chip). */
function Conditions({ conditions }: { conditions: string[] }) {
	if (conditions.length === 0) return null;
	return (
		<div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'flex-end' }}>
			{conditions.map((c) => {
				const k = condKey(c);
				return k ? (
					<ConditionBadge key={c} condition={k} compact />
				) : (
					<Chip key={c} tone="neutral">
						{c}
					</Chip>
				);
			})}
		</div>
	);
}

/** The concentration line — absent entirely when the member is not concentrating. */
function Concentration({ effect }: { effect: string | null }) {
	const { t } = useI18n();
	if (!effect) return null;
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 5,
				font: `11px ${T.sans}`,
				color: T.sub,
			}}
		>
			<Icon name="concentration" size={12} color={T.acc} />
			{t('play.party.concentrating', { effect })}
		</span>
	);
}

/** The collapsed one-line spellcaster summary. Absent for a member with no slots at all. */
function SlotSummary({ m }: { m: PartyMemberVitals }) {
	const { t } = useI18n();
	if (m.spellSlots.length === 0) return null;
	const max = m.spellSlots.reduce((sum, s) => sum + s.max, 0);
	return (
		<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
			{t('play.party.slotsSummary', { available: m.availableSpellSlots, max })}
		</span>
	);
}

const rowStyle = (m: PartyMemberVitals) => {
	const downed = m.hp === 0;
	return {
		display: 'flex',
		alignItems: 'center' as const,
		gap: 13,
		padding: 12,
		borderRadius: 11,
		border: `1px solid ${downed ? 'var(--color-status-error-border)' : m.isSelf ? T.accBd : T.bd}`,
		background: downed ? 'var(--color-status-error-subtle)' : m.isSelf ? T.accSub : T.surf,
	};
};

// ── Board tile ───────────────────────────────────────────────────────────────────────────────────

/**
 * The board tile row: the smallest useful reading of the party — who is up, how hurt they are, and
 * whether anything is on them. Wraps, so it survives a phone-width board without its own breakpoint.
 */
export function PartyBoardTiles({ members }: { members: PartyMemberVitals[] }) {
	const { t } = useI18n();
	if (members.length === 0) return null;
	return (
		<div
			style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
			aria-label={t('play.party.vitals')}
			role="group"
		>
			{members.map((m) => {
				const downed = m.hp === 0;
				return (
					<div
						key={m.characterId}
						data-testid={`party-tile-${m.characterId}`}
						style={{
							flex: '1 1 160px',
							minWidth: 0,
							padding: '8px 10px',
							borderRadius: 9,
							border: `1px solid ${downed ? 'var(--color-status-error-border)' : m.isSelf ? T.accBd : T.bd}`,
							background: downed ? 'var(--color-status-error-subtle)' : T.surf,
						}}
					>
						<div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
							<span
								style={{
									font: `600 12px ${T.sans}`,
									color: T.ink,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
								}}
							>
								{m.name}
							</span>
							{m.isSelf && <Badge status="accent">{t('play.party.you')}</Badge>}
							<div style={{ flex: 1 }} />
							{m.concentration && <Icon name="concentration" size={12} color={T.acc} />}
							{m.conditions.length > 0 && (
								<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
									{t('play.party.conditionCount', { count: m.conditions.length })}
								</span>
							)}
						</div>
						<div style={{ marginTop: 5 }} data-testid={`party-tile-hp-${m.characterId}`}>
							<HPBar current={m.hp} max={m.maxHp} size="sm" />
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ── Quick panel ──────────────────────────────────────────────────────────────────────────────────

/** One member row, shared by the quick panel and the sheet. `detail` is the sheet's extra block. */
function MemberRow({ m, detail }: { m: PartyMemberVitals; detail?: ReactNode }) {
	const { t } = useI18n();
	const downed = m.hp === 0;
	return (
		<div
			data-testid={`party-row-${m.characterId}`}
			style={{ ...rowStyle(m), flexDirection: 'column', alignItems: 'stretch' }}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
				<Avatar name={m.name} size="sm" ring={downed ? 'danger' : m.isSelf ? 'active' : 'none'} />
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
						<span style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>{m.name}</span>
						{m.isSelf && <Badge status="accent">{t('play.party.you')}</Badge>}
						<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
							{t('play.party.armorClass', { value: m.ac })}
						</span>
						{m.marchingPosition != null && (
							<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
								{t('play.party.orderPosition', { position: m.marchingPosition })}
							</span>
						)}
					</div>
					<div style={{ marginTop: 5, maxWidth: 260 }} data-testid={`party-hp-${m.characterId}`}>
						<Vitals m={m} size="sm" />
					</div>
					<div
						style={{
							marginTop: 4,
							display: 'flex',
							flexWrap: 'wrap',
							alignItems: 'center',
							gap: 10,
						}}
					>
						<Concentration effect={m.concentration} />
						<SlotSummary m={m} />
					</div>
				</div>
				<Conditions conditions={m.conditions} />
			</div>
			{detail}
		</div>
	);
}

/** The quick panel: every visible PC's vitals, read-only, no expansion. */
export function PartyQuickPanel({ members }: { members: PartyMemberVitals[] }) {
	const { t } = useI18n();
	if (members.length === 0) {
		return <div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('play.party.empty')}</div>;
	}
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
			{members.map((m) => (
				<MemberRow key={m.characterId} m={m} />
			))}
		</div>
	);
}

// ── Sheet ────────────────────────────────────────────────────────────────────────────────────────

/** A member row plus its collapsible per-level slot breakdown. */
function SheetRow({ m }: { m: PartyMemberVitals }) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const panelId = `party-slots-${m.characterId}`;
	const detail =
		m.spellSlots.length === 0 ? undefined : (
			<div style={{ marginTop: 9 }}>
				<button
					type="button"
					aria-expanded={open}
					aria-controls={panelId}
					onClick={() => setOpen((v) => !v)}
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 6,
						font: `11px ${T.sans}`,
						color: T.sub,
						background: 'transparent',
						border: `1px solid ${T.bd}`,
						borderRadius: 999,
						padding: '3px 9px',
						cursor: 'pointer',
					}}
				>
					<Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
					{t(open ? 'play.party.slotsHide' : 'play.party.slotsShow', { name: m.name })}
				</button>
				{open && (
					<div id={panelId} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
						{m.spellSlots.map((slot) => (
							<span
								key={slot.level}
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 5,
									font: `11px ${T.mono}`,
									color: slot.available === 0 ? T.ter : T.ink,
									border: `1px solid ${T.bd}`,
									borderRadius: 8,
									padding: '3px 8px',
									background: T.sunken,
								}}
							>
								<Icon name="spell-slot" size={11} color={slot.available === 0 ? T.ter : T.acc} />
								{t('play.party.slotLevel', {
									level: slot.level,
									available: slot.available,
									max: slot.max,
								})}
							</span>
						))}
					</div>
				)}
			</div>
		);
	return <MemberRow m={m} detail={detail} />;
}

/** The full party sheet: quick-panel rows plus the collapsed spellcaster detail. */
export function PartySheet({ members }: { members: PartyMemberVitals[] }) {
	const { t } = useI18n();
	if (members.length === 0) {
		return <div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('play.party.empty')}</div>;
	}
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
			{members.map((m) => (
				<SheetRow key={m.characterId} m={m} />
			))}
		</div>
	);
}
