/**
 * CharBuilder import preview — the pure mapper's mapped/unmapped field report, shown BEFORE
 * anything is created (fail-closed: nothing is dispatched until the user confirms).
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import type { Character } from '@dndtools/core';
import { Avatar, Badge, Button, Icon, IconButton, VisibilityChip } from '../../ds';
import { T, eb } from '../screen-kit';
import { KIND_LABEL, KIND_TONE } from './data';
import { ImportDiff } from './ImportDiff';
import { Overlay } from './Overlay';
import type { ImportPlan } from '../charImport/ddbJson';
import { useI18n } from '../../i18n';

export function ImportPhase({
	isPhone,
	importPlan,
	importError,
	roster,
	error,
	submitting,
	onClose,
	onBack,
	onChooseFile,
	onConfirm,
}: {
	isPhone: boolean;
	importPlan: ImportPlan | null;
	importError: string | null;
	/** The current roster, for the diff against a same-named character. */
	roster: readonly Character[];
	error: string | null;
	submitting: boolean;
	onClose: () => void;
	onBack: () => void;
	onChooseFile: () => void;
	onConfirm: () => void;
}) {
	const { t } = useI18n();
	return (
		<Overlay key="import" onClose={onClose} label={t('charBuilder.importTitle')} phone={isPhone}>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					height: '100%',
					flex: 1,
					minWidth: 0,
					overflowWrap: 'anywhere',
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: isPhone
							? 'var(--space-4) var(--space-4) var(--space-0)'
							: 'var(--space-5) var(--space-6) var(--space-0)',
					}}
				>
					<div>
						<h2 style={{ margin: 'var(--space-0)', font: `700 var(--text-xl) ${T.disp}` }}>
							{t('charBuilder.importTitle')}
						</h2>
						<p
							style={{
								margin: 'var(--space-1) var(--space-0) var(--space-0)',
								font: `var(--text-sm) ${T.sans}`,
								color: T.ter,
							}}
						>
							{t(importPlan ? 'charBuilder.importReview' : 'charBuilder.importUnreadable')}
						</p>
					</div>
					<IconButton
						icon="close"
						label={t('common.action.close')}
						variant="ghost"
						onClick={onClose}
					/>
				</div>
				<div
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: 'auto',
						padding: isPhone ? 'var(--space-4)' : 'var(--space-4) var(--space-6)',
					}}
				>
					{importError && (
						<div
							role="alert"
							style={{
								font: `var(--text-sm)/1.6 ${T.sans}`,
								color: T.err,
								padding: 'var(--space-3) var(--space-3)',
								borderRadius: 'var(--radius-lg)',
								border: `1px solid ${T.err}`,
							}}
						>
							<Icon name="error" size="sm" /> {importError}
						</div>
					)}
					{importPlan && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
								<Avatar name={importPlan.name} size="lg" ring="turn" />
								<div style={{ minWidth: 0 }}>
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 'var(--space-2)',
											flexWrap: 'wrap',
										}}
									>
										<span style={{ font: `700 var(--text-lg) ${T.sans}` }}>{importPlan.name}</span>
										<Badge status={KIND_TONE[importPlan.quickCreate.kind]}>
											{t(KIND_LABEL[importPlan.quickCreate.kind])}
										</Badge>
										<VisibilityChip
											level={
												importPlan.quickCreate.visibility === 'dm-only' ? 'dm-only' : 'players'
											}
											compact
										/>
										<Badge status="neutral">
											{t(
												importPlan.source === 'dndbeyond'
													? 'charBuilder.sourceDndBeyond'
													: 'charBuilder.sourceDndtools',
											)}
										</Badge>
									</div>
									<div
										style={{
											font: `var(--text-xs) ${T.sans}`,
											color: T.ter,
											marginTop: 'var(--space-0-5)',
										}}
									>
										{[
											t('charBuilder.countAbilityScores', {
												count: Object.keys(importPlan.quickCreate.abilityScores).length,
											}),
											importPlan.proficiencies?.skills
												? t('charBuilder.countSkills', {
														count: Object.keys(importPlan.proficiencies.skills).length,
													})
												: null,
											importPlan.proficiencies?.saves
												? t('charBuilder.countSaves', {
														count: importPlan.proficiencies.saves.length,
													})
												: null,
											t('charBuilder.countSpells', { count: importPlan.spells.length }),
											t('charBuilder.countAttacks', { count: importPlan.attacks.length }),
										]
											.filter(Boolean)
											.join(' · ')}
									</div>
								</div>
							</div>
							<ImportDiff plan={importPlan} roster={roster} />
							<div
								style={{
									display: 'grid',
									gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1fr 1fr',
									gap: 'var(--space-3)',
									alignItems: 'start',
								}}
							>
								<div
									style={{
										padding: 'var(--space-3)',
										borderRadius: 'var(--radius-lg)',
										border: `1px solid ${T.bd}`,
										background: T.surf,
									}}
								>
									<div style={{ ...eb, marginBottom: 'var(--space-2)', color: T.ok }}>
										{t('charBuilder.willImport', { count: importPlan.mapped.length })}
									</div>
									<div
										style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}
									>
										{importPlan.mapped.map((n, j) => (
											<div
												key={`${n.field}-${j}`}
												style={{
													display: 'flex',
													gap: 'var(--space-1-5)',
													font: `var(--text-xs)/1.45 ${T.sans}`,
													color: T.sub,
												}}
											>
												<Icon name="check" size={13} color={T.ok} />
												<span style={{ minWidth: 0 }}>
													<strong style={{ color: T.ink }}>{n.field}</strong> — {n.detail}
												</span>
											</div>
										))}
									</div>
								</div>
								<div
									style={{
										padding: 'var(--space-3)',
										borderRadius: 'var(--radius-lg)',
										border: `1.5px dashed ${T.bdS}`,
										background: T.alt,
									}}
								>
									<div style={{ ...eb, marginBottom: 'var(--space-2)', color: T.warn }}>
										{t('charBuilder.couldNotMap', { count: importPlan.unmapped.length })}
									</div>
									{importPlan.unmapped.length === 0 ? (
										<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
											{t('charBuilder.allMapped')}
										</div>
									) : (
										<div
											style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}
										>
											{importPlan.unmapped.map((n, j) => (
												<div
													key={`${n.field}-${j}`}
													style={{
														display: 'flex',
														gap: 'var(--space-1-5)',
														font: `var(--text-xs)/1.45 ${T.sans}`,
														color: T.sub,
													}}
												>
													<Icon name="hidden" size={13} color={T.warn} />
													<span style={{ minWidth: 0 }}>
														<strong style={{ color: T.ink }}>{n.field}</strong> — {n.detail}
													</span>
												</div>
											))}
										</div>
									)}
									<div
										style={{
											font: `var(--text-xs)/1.5 ${T.sans}`,
											color: T.ter,
											marginTop: 'var(--space-2)',
										}}
									>
										{t('charBuilder.unmappedNote')}
									</div>
								</div>
							</div>
							{error && (
								<div
									role="alert"
									style={{
										font: `var(--text-sm)/1.5 ${T.sans}`,
										color: T.err,
										padding: 'var(--space-2) var(--space-3)',
										borderRadius: 'var(--radius-lg)',
										border: `1px solid ${T.err}`,
									}}
								>
									{error}
								</div>
							)}
						</div>
					)}
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						padding: isPhone ? 'var(--space-3) var(--space-4)' : 'var(--space-3) var(--space-6)',
						flexWrap: 'wrap',
						borderTop: `1px solid ${T.bd}`,
					}}
				>
					<Button variant="ghost" icon="chevron-left" onClick={onBack}>
						{t('common.action.back')}
					</Button>
					<div style={{ flex: 1 }} />
					<Button variant="secondary" onClick={onChooseFile}>
						{t('charBuilder.chooseAnotherFile')}
					</Button>
					{importPlan && (
						<Button variant="primary" icon="check" disabled={submitting} onClick={onConfirm}>
							{submitting ? t('charBuilder.importing') : t('charBuilder.importCharacter')}
						</Button>
					)}
				</div>
			</div>
		</Overlay>
	);
}
