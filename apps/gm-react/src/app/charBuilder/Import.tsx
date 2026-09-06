/**
 * CharBuilder import preview — the pure mapper's mapped/unmapped field report, shown BEFORE
 * anything is created (fail-closed: nothing is dispatched until the user confirms).
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { Avatar, Badge, Button, Icon, IconButton, VisibilityChip } from '../../ds';
import { T, eb } from '../screen-kit';
import { KIND_LABEL, KIND_TONE } from './data';
import { Overlay } from './Overlay';
import type { ImportPlan } from '../charImport/ddbJson';

export function ImportPhase({
	isPhone,
	importPlan,
	importError,
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
	error: string | null;
	submitting: boolean;
	onClose: () => void;
	onBack: () => void;
	onChooseFile: () => void;
	onConfirm: () => void;
}) {
	return (
		<Overlay key="import" onClose={onClose} label="Import character file" phone={isPhone}>
			<div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: isPhone ? '16px 16px 0' : '20px 28px 0',
					}}
				>
					<div>
						<h2 style={{ margin: 0, font: `700 24px ${T.disp}` }}>Import character file</h2>
						<p style={{ margin: '4px 0 0', font: `13px ${T.sans}`, color: T.ter }}>
							{importPlan
								? 'Review what will be imported. Nothing is created until you confirm.'
								: 'The file couldn’t be read — check that it’s a character export and try again.'}
						</p>
					</div>
					<IconButton icon="close" label="Close" variant="ghost" onClick={onClose} />
				</div>
				<div
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: 'auto',
						padding: isPhone ? '16px' : '18px 28px',
					}}
				>
					{importError && (
						<div
							role="alert"
							style={{
								font: `13px/1.6 ${T.sans}`,
								color: T.err,
								padding: '12px 14px',
								borderRadius: 10,
								border: `1px solid ${T.err}`,
							}}
						>
							{importError}
						</div>
					)}
					{importPlan && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
								<Avatar name={importPlan.name} size="lg" ring="turn" />
								<div style={{ minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
										<span style={{ font: `700 19px ${T.disp}` }}>{importPlan.name}</span>
										<Badge status={KIND_TONE[importPlan.quickCreate.kind]}>
											{KIND_LABEL[importPlan.quickCreate.kind]}
										</Badge>
										<VisibilityChip
											level={
												importPlan.quickCreate.visibility === 'dm-only' ? 'dm-only' : 'players'
											}
											compact
										/>
										<Badge status="neutral">
											{importPlan.source === 'dndbeyond' ? 'D&D Beyond export' : 'dndtools JSON'}
										</Badge>
									</div>
									<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 3 }}>
										{[
											`${Object.keys(importPlan.quickCreate.abilityScores).length} ability scores`,
											importPlan.proficiencies?.skills
												? `${Object.keys(importPlan.proficiencies.skills).length} skills`
												: null,
											importPlan.proficiencies?.saves
												? `${importPlan.proficiencies.saves.length} saves`
												: null,
											`${importPlan.spells.length} spells`,
											`${importPlan.attacks.length} attacks`,
										]
											.filter(Boolean)
											.join(' · ')}
									</div>
								</div>
							</div>
							<div
								style={{
									display: 'grid',
									gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1fr 1fr',
									gap: 14,
									alignItems: 'start',
								}}
							>
								<div
									style={{
										padding: 14,
										borderRadius: 12,
										border: `1px solid ${T.bd}`,
										background: T.surf,
									}}
								>
									<div style={{ ...eb, marginBottom: 8, color: T.ok }}>
										Will import ({importPlan.mapped.length})
									</div>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
										{importPlan.mapped.map((n, j) => (
											<div
												key={`${n.field}-${j}`}
												style={{
													display: 'flex',
													gap: 7,
													font: `12px/1.45 ${T.sans}`,
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
										padding: 14,
										borderRadius: 12,
										border: `1.5px dashed ${T.bdS}`,
										background: T.alt,
									}}
								>
									<div style={{ ...eb, marginBottom: 8, color: T.warn }}>
										Couldn't map ({importPlan.unmapped.length})
									</div>
									{importPlan.unmapped.length === 0 ? (
										<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
											Every field in the file mapped cleanly.
										</div>
									) : (
										<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
											{importPlan.unmapped.map((n, j) => (
												<div
													key={`${n.field}-${j}`}
													style={{
														display: 'flex',
														gap: 7,
														font: `12px/1.45 ${T.sans}`,
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
									<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter, marginTop: 10 }}>
										These fields will NOT be imported — listed here so nothing is lost silently.
									</div>
								</div>
							</div>
							{error && (
								<div
									role="alert"
									style={{
										font: `12.5px/1.5 ${T.sans}`,
										color: T.err,
										padding: '10px 12px',
										borderRadius: 10,
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
						gap: 10,
						padding: isPhone ? '12px 16px' : '14px 28px',
						flexWrap: 'wrap',
						borderTop: `1px solid ${T.bd}`,
					}}
				>
					<Button variant="ghost" icon="chevron-left" onClick={onBack}>
						Back
					</Button>
					<div style={{ flex: 1 }} />
					<Button variant="secondary" onClick={onChooseFile}>
						Choose another file
					</Button>
					{importPlan && (
						<Button variant="primary" icon="check" disabled={submitting} onClick={onConfirm}>
							{submitting ? 'Importing…' : 'Import character'}
						</Button>
					)}
				</div>
			</div>
		</Overlay>
	);
}
