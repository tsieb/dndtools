import { type ReactNode } from 'react';
import { Button, Field, Input } from '../../../ds';
import { xpForLevel, type AdvancementState, type AdvancementValidation } from '@dndtools/core';
import { Panel, T, mono } from '../../../app/screen-kit';
import { useI18n } from '../../../i18n';

/** The staged level-up panel — XP, open/choices/commit/cancel. Extracted from Characters.tsx
 * unchanged (RC-STB-2.6). */
export function AdvancementPanel({
	advancement,
	draft,
	xpEligible,
	draftValidation,
	hasAdvancementChoice,
	xpInput,
	setXpInput,
	className,
	setClassName,
	hpGained,
	setHpGained,
	subclass,
	setSubclass,
	abilityOrFeat,
	setAbilityOrFeat,
	setXp,
	openAdvancement,
	saveChoices,
	commitAdvancement,
	cancelAdvancement,
	fieldError,
	isPhone,
}: {
	advancement: AdvancementState;
	draft: AdvancementState['draft'];
	xpEligible: { eligible: boolean; reason?: string } | null;
	draftValidation: AdvancementValidation | null;
	hasAdvancementChoice: boolean;
	xpInput: string;
	setXpInput: (next: string) => void;
	className: string;
	setClassName: (next: string) => void;
	hpGained: string;
	setHpGained: (next: string) => void;
	subclass: string;
	setSubclass: (next: string) => void;
	abilityOrFeat: string;
	setAbilityOrFeat: (next: string) => void;
	setXp: () => Promise<void>;
	openAdvancement: (mode: 'xp' | 'milestone') => Promise<void>;
	saveChoices: () => Promise<void>;
	commitAdvancement: () => Promise<void>;
	cancelAdvancement: () => Promise<void>;
	fieldError: (field: 'ac' | 'slots' | 'xp') => ReactNode;
	isPhone: boolean;
}) {
	const { t } = useI18n();
	return (
		<Panel title={t('characters.advancement')}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 14,
					flexWrap: 'wrap',
					font: `13px ${T.sans}`,
					color: T.sub,
				}}
			>
				<span style={mono}>{t('characters.levelValue', { level: advancement.level })}</span>
				<span style={mono}>{t('characters.xpValue', { xp: advancement.xp })}</span>
				{advancement.level < 20 && (
					<span style={{ color: T.ter }}>
						{t('characters.nextAt', { xp: xpForLevel(advancement.level + 1) ?? '—' })}
					</span>
				)}
			</div>
			{draft ? (
				<div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
						{t('characters.advancingTo', { level: draft.toLevel, mode: draft.mode })}
					</div>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1fr 1fr',
							gap: 10,
						}}
					>
						<Field label={t('characters.classGaining')}>
							<Input value={className} onChange={(e: any) => setClassName(e.target.value)} />
						</Field>
						<Field label={t('characters.hpGained')}>
							<Input
								type="number"
								value={hpGained}
								onChange={(e: any) => setHpGained(e.target.value)}
							/>
						</Field>
						<Field label={t('characters.subclassIfRequired')}>
							<Input value={subclass} onChange={(e: any) => setSubclass(e.target.value)} />
						</Field>
						<Field label={t('characters.abilityOrFeat')}>
							<Input
								value={abilityOrFeat}
								onChange={(e: any) => setAbilityOrFeat(e.target.value)}
							/>
						</Field>
					</div>
					{draftValidation && draftValidation.issues.length > 0 ? (
						<ul
							style={{
								margin: 0,
								paddingLeft: 18,
								font: `12.5px ${T.sans}`,
								color: T.warn ?? T.sub,
							}}
						>
							{draftValidation.issues.map((iss: any) => (
								<li key={iss.field}>{iss.message}</li>
							))}
						</ul>
					) : draftValidation?.complete ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.acc }}>
							{t('characters.choicesValid')}
						</div>
					) : null}
					<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
						<Button
							variant="secondary"
							size="sm"
							disabled={!hasAdvancementChoice}
							onClick={saveChoices}
						>
							{t('characters.saveChoices')}
						</Button>
						<Button
							variant="primary"
							size="sm"
							disabled={!draftValidation?.complete}
							onClick={commitAdvancement}
						>
							{t('characters.finishLevelUp')}
						</Button>
						<Button variant="ghost" size="sm" onClick={cancelAdvancement}>
							{t('common.action.cancel')}
						</Button>
					</div>
				</div>
			) : (
				<div
					style={{
						marginTop: 12,
						display: 'flex',
						gap: 8,
						alignItems: 'flex-end',
						flexWrap: 'wrap',
					}}
				>
					<Field label={t('characters.setXp')} style={{ width: 120 }}>
						<Input
							type="number"
							value={xpInput}
							onChange={(e: any) => setXpInput(e.target.value)}
						/>
					</Field>
					<Button variant="secondary" size="sm" onClick={setXp}>
						{t('characters.setXp')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						disabled={!xpEligible?.eligible}
						onClick={() => openAdvancement('xp')}
					>
						{t('characters.levelUpXp')}
					</Button>
					<Button variant="secondary" size="sm" onClick={() => openAdvancement('milestone')}>
						{t('characters.levelUpMilestone')}
					</Button>
					{fieldError('xp')}
				</div>
			)}
		</Panel>
	);
}
