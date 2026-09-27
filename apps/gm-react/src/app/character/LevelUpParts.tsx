import { useState, type ReactNode } from 'react';
import { xpForLevel, type AdvancementDraft, type EligibilityResult } from '@dndtools/core';
import { Button, Dialog, Icon, Input, ProgressMeter, type DSChangeEvent } from '../../ds';
import { Panel, T } from '../screen-kit';
import { useI18n } from '../../i18n';
import type { Change } from './LevelUp';

/** The level card + the two ways in, shown while no advancement is open. */
export function LevelUpEntry({
	level,
	xp,
	xpEligible,
	milestoneEligible,
	onOpen,
}: {
	level: number;
	xp: number;
	xpEligible: EligibilityResult | null;
	milestoneEligible: EligibilityResult | null;
	onOpen: (mode: 'xp' | 'milestone') => void;
}) {
	const { t, formatNumber } = useI18n();
	const nextXp = xpForLevel(level + 1);
	return (
		<div style={{ maxWidth: 680, margin: '0 auto' }}>
			<LevelBadgeRow
				badge={level}
				title={t('character.levelUp.level', { level })}
				subtitle={
					nextXp === null
						? t('character.levelUp.maxLevel')
						: t('character.levelUp.next', { level: level + 1 })
				}
			/>
			{nextXp !== null && (
				<Panel
					title={t('character.levelUp.experience')}
					pad={14}
					style={{ marginBottom: 'var(--space-4)' }}
				>
					<ProgressMeter
						value={Math.min(xp, nextXp)}
						max={nextXp}
						label={t('character.levelUp.xpMeter', {
							xp: formatNumber(xp),
							next: formatNumber(nextXp),
						})}
					/>
					{xpEligible && !xpEligible.eligible && (
						<div
							style={{
								font: `var(--text-xs) ${T.sans}`,
								color: T.ter,
								marginTop: 'var(--space-1-5)',
							}}
						>
							{xpEligible.message}
						</div>
					)}
				</Panel>
			)}
			<div
				style={{
					display: 'flex',
					gap: 'var(--space-2)',
					justifyContent: 'center',
					flexWrap: 'wrap',
				}}
			>
				<Button
					variant="primary"
					size="md"
					icon="flag"
					disabled={!xpEligible?.eligible}
					onClick={() => onOpen('xp')}
				>
					{t('character.levelUp.byXp')}
				</Button>
				<Button
					variant="secondary"
					size="md"
					disabled={!milestoneEligible?.eligible}
					onClick={() => onOpen('milestone')}
				>
					{t('character.levelUp.byMilestone')}
				</Button>
			</div>
			{milestoneEligible && !milestoneEligible.eligible && (
				<div
					style={{
						font: `var(--text-xs) ${T.sans}`,
						color: T.ter,
						textAlign: 'center',
						marginTop: 'var(--space-2)',
					}}
				>
					{milestoneEligible.message}
				</div>
			)}
		</div>
	);
}

export function WizardHeader({
	name,
	draft,
	onCancel,
}: {
	draft: AdvancementDraft;
	name: string;
	onCancel: () => void;
}) {
	const { t } = useI18n();
	const [confirming, setConfirming] = useState(false);
	return (
		<>
			<LevelBadgeRow
				badge={draft.toLevel}
				title={t('character.levelUp.fromTo', { from: draft.fromLevel, to: draft.toLevel })}
				subtitle={t(
					draft.mode === 'xp' ? 'character.levelUp.modeXp' : 'character.levelUp.modeMilestone',
				)}
				action={
					<Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
						{t('character.levelUp.discard')}
					</Button>
				}
			/>
			<Dialog
				open={confirming}
				onClose={() => setConfirming(false)}
				title={t('player.levelUp.discardTitle', { name })}
				description={t('player.levelUp.discardBody')}
				footer={
					<>
						<Button variant="secondary" onClick={() => setConfirming(false)}>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="danger"
							onClick={() => {
								setConfirming(false);
								onCancel();
							}}
						>
							{t('character.levelUp.discard')}
						</Button>
					</>
				}
			/>
		</>
	);
}

function LevelBadgeRow({
	badge,
	title,
	subtitle,
	action,
}: {
	badge: number;
	title: string;
	subtitle: string;
	action?: ReactNode;
}) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-4)',
				padding: 'var(--space-4) var(--space-5)',
				borderRadius: 'var(--radius-lg)',
				background: `linear-gradient(135deg, ${T.accSub}, ${T.surf})`,
				border: `1px solid ${T.accBd}`,
				marginBottom: 'var(--space-4)',
			}}
		>
			<span
				style={{
					width: 50,
					height: 50,
					borderRadius: 'var(--radius-lg)',
					flex: '0 0 auto',
					background: T.acc,
					color: T.accFg,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					font: `700 var(--text-lg) ${T.mono}`,
				}}
			>
				{badge}
			</span>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ font: `700 var(--text-lg) ${T.sans}` }}>{title}</div>
				<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>{subtitle}</div>
			</div>
			{action}
		</div>
	);
}

/** One choice field: what is stored now, a field to change it, and a Save that dispatches. */
export function ChoiceInput({
	label,
	value,
	saved,
	numeric,
	onChange,
	onSave,
}: {
	label: string;
	value: string;
	saved: unknown;
	numeric?: boolean;
	onChange: (next: string) => void;
	onSave: (value: string) => void;
}) {
	const { t } = useI18n();
	const stored = saved === undefined || saved === null ? null : String(saved);
	return (
		<div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
			<Input
				type={numeric ? 'number' : 'text'}
				value={value}
				placeholder={stored ?? label}
				aria-label={label}
				onChange={(e: DSChangeEvent) => onChange(e.target.value)}
				style={{ maxWidth: 220 }}
			/>
			<Button variant="secondary" size="sm" disabled={!value.trim()} onClick={() => onSave(value)}>
				{stored === null ? t('character.levelUp.choose') : t('character.levelUp.change')}
			</Button>
			{stored !== null && (
				<span
					style={{
						font: `var(--text-sm) ${T.sans}`,
						color: T.acc,
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'var(--space-1)',
					}}
				>
					<Icon name="check" size={14} />
					{stored}
				</span>
			)}
		</div>
	);
}

/** A derived from → to list, or an honest line when the package declares no change. */
export function ChangeList({ rows, empty }: { rows: Change[]; empty: string }) {
	const { t } = useI18n();
	if (rows.length === 0) {
		return (
			<p style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.ter, margin: 'var(--space-0)' }}>
				{empty}
			</p>
		);
	}
	return (
		<ul
			style={{
				listStyle: 'none',
				margin: 'var(--space-0)',
				padding: 'var(--space-0)',
				display: 'grid',
				gap: 'var(--space-1-5)',
			}}
		>
			{rows.map((row) => (
				<li
					key={row.key}
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						gap: 'var(--space-3)',
						padding: 'var(--space-2) var(--space-2)',
						borderRadius: 'var(--radius-md)',
						background: T.alt,
					}}
				>
					<span style={{ font: `var(--text-sm) ${T.sans}` }}>{row.label}</span>
					<span style={{ font: `var(--text-sm) ${T.mono}`, color: T.acc }}>
						{t('character.levelUp.fromToValue', { from: row.from, to: row.to })}
					</span>
				</li>
			))}
		</ul>
	);
}
