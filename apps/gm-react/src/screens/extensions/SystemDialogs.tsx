import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
	SystemPackage,
	SystemPackageSelectFinding,
	SystemPackageSelectPreviewResult,
} from '@dndtools/core';
import {
	CATEGORY_LABEL,
	FINDING_GROUP_LABEL,
	FINDING_GROUP_ORDER,
	FINDING_TONE,
} from './systemVocab';
import { Badge, Button, Dialog, Field, Icon, Input } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { useI18n } from '../../i18n';

/* ---- the dry-run dialog ---------------------------------------------------------------------- */

export function SystemSelectDialog({
	targetName,
	preview,
	busy,
	canWrite,
	onApply,
	onClose,
}: {
	targetName: string;
	preview: SystemPackageSelectPreviewResult;
	busy: boolean;
	canWrite: boolean;
	onApply: (acknowledgeLoss: boolean) => void;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [phrase, setPhrase] = useState('');
	const available = preview.kind === 'available';
	const destructive = available && preview.destructive;
	// RC-SYS-3.2 — a checkbox is a single click; the drop count on some switches runs into the
	// dozens, so the acknowledgment is TYPED: the DM has to read and reproduce the word the dry-run
	// itself is using ("drop"), the same self-documenting pattern account deletion already uses
	// (`settings/Account.tsx`'s `deletePhrase`).
	const dropPhrase = t('extensions.system.select.dropPhrase').trim().toLowerCase();
	const ack = phrase.trim().toLowerCase() === dropPhrase;
	const canApply = available && (!destructive || ack) && canWrite && !busy;
	const allFindings: SystemPackageSelectFinding[] =
		preview.kind === 'available' ? preview.findings : [];
	const groups = FINDING_GROUP_ORDER.map((effect) => ({
		effect,
		findings: allFindings.filter((f) => f.effect === effect),
	})).filter((group) => group.findings.length > 0);
	return (
		<Dialog
			open
			onClose={onClose}
			title={t('extensions.system.select.title', { name: targetName })}
			description={t('extensions.system.select.description', { name: targetName })}
			tone={destructive ? 'danger' : undefined}
			size="md"
			footer={
				<>
					<Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant={destructive ? 'danger' : 'primary'}
						size="sm"
						icon="check"
						disabled={!canApply}
						onClick={() => onApply(destructive && ack)}
					>
						{busy ? t('extensions.system.select.applying') : t('extensions.system.select.apply')}
					</Button>
				</>
			}
		>
			{!available && (
				// The verdict of the dry-run, announced rather than only painted (WCAG 4.1.3).
				<div role="status" style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
					{t(
						preview.reason === 'already-active'
							? 'extensions.system.reason.alreadyActive'
							: 'extensions.system.reason.notFound',
					)}{' '}
					{t('extensions.system.select.nothingChanged')}
				</div>
			)}
			{available && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-2)',
							font: `var(--text-sm) ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon
							name={destructive ? 'warning' : 'success'}
							size={16}
							color={destructive ? T.warn : T.ok}
						/>
						{destructive
							? t('extensions.system.select.destructive', {
									count: preview.droppedInstanceCount,
								})
							: t('extensions.system.select.safe')}
					</div>
					{allFindings.length === 0 ? (
						<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
							{t('extensions.system.select.noFindings')}
						</div>
					) : (
						// RC-SYS-3.2 — grouped as maps directly / carries over / drops (FINDING_GROUP_ORDER),
						// each with its own instance counts, rather than one flat list a DM has to scan for
						// the word "Dropped".
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
							{groups.map((group) => (
								<div key={group.effect}>
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 'var(--space-2)',
											marginBottom: 'var(--space-1)',
											font: `600 var(--text-xs) ${T.sans}`,
											color: T.sub,
											textTransform: 'uppercase',
											letterSpacing: '0.04em',
										}}
									>
										{t(FINDING_GROUP_LABEL[group.effect])}
										<Badge status={FINDING_TONE[group.effect] ?? 'neutral'}>
											{group.findings.length}
										</Badge>
									</div>
									{/* A long group scrolls on its own, so it takes a tab stop and a name: a keyboard
									    user can reach every finding, and a screen reader says which group it is in. */}
									<div
										role="region"
										tabIndex={0}
										aria-label={t(FINDING_GROUP_LABEL[group.effect])}
										style={{
											display: 'flex',
											flexDirection: 'column',
											border: `1px solid ${T.bd}`,
											borderRadius: 'var(--radius-lg)',
											overflow: 'hidden',
											maxHeight: 220,
											overflowY: 'auto',
										}}
									>
										{group.findings.map((f, i) => (
											<div
												key={`${f.category}.${f.key}`}
												style={{
													display: 'flex',
													alignItems: 'center',
													flexWrap: 'wrap',
													gap: 'var(--space-2)',
													padding: 'var(--space-2) var(--space-3)',
													borderTop: i ? `1px solid ${T.bd}` : 'none',
													background: i % 2 ? T.alt : 'transparent',
												}}
											>
												<span style={{ ...eb, width: 78, flex: '0 0 auto' }}>
													{t(CATEGORY_LABEL[f.category] ?? 'extensions.system.category.attribute')}
												</span>
												<span style={{ font: `600 var(--text-sm) ${T.sans}`, flex: '0 0 auto' }}>
													{f.label}
												</span>
												<span
													style={{
														font: `var(--text-xs) ${T.mono}`,
														color: T.sub,
														width: 44,
														flex: '0 0 auto',
													}}
												>
													×{f.instanceCount}
												</span>
												<span
													style={{
														flex: '1 1 200px',
														minWidth: 0,
														font: `var(--text-xs)/1.4 ${T.sans}`,
														color: T.sub,
													}}
												>
													{f.note}
												</span>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					)}
					{destructive && (
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 'var(--space-2)',
								padding: 'var(--space-2) var(--space-3)',
								borderRadius: 'var(--radius-md)',
								border: `1px solid ${T.accBd}`,
								background: T.accSub,
							}}
						>
							<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
								{t('extensions.system.select.destructiveBody')}
							</div>
							<Button
								variant="ghost"
								size="sm"
								icon="download"
								style={{ alignSelf: 'flex-start' }}
								onClick={() => navigate('/settings?tab=sync')}
							>
								{t('extensions.system.select.backupLink')}
							</Button>
							<Field label={t('extensions.system.select.dropPhraseLabel', { phrase: dropPhrase })}>
								<Input
									id="system-select-drop-confirmation"
									value={phrase}
									onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhrase(e.target.value)}
									placeholder={dropPhrase}
									autoComplete="off"
									disabled={busy}
								/>
							</Field>
						</div>
					)}
					{preview.clean && (
						<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ok }}>
							{t('extensions.system.select.clean')}
						</div>
					)}
				</div>
			)}
		</Dialog>
	);
}

/* ---- fork ("build your own") ------------------------------------------------------------------ */

export function SystemForkDialog({
	source,
	busy,
	canWrite,
	onFork,
	onClose,
}: {
	source: SystemPackage;
	busy: boolean;
	canWrite: boolean;
	onFork: (displayName: string) => void;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const [name, setName] = useState(
		t('extensions.system.fork.defaultName', { name: source.displayName }),
	);
	const trimmed = name.trim();
	return (
		<Dialog
			open
			onClose={onClose}
			title={t('extensions.system.fork.title')}
			description={t('extensions.system.fork.description', { name: source.displayName })}
			size="sm"
			footer={
				<>
					<Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="add"
						disabled={!canWrite || busy || trimmed.length === 0}
						onClick={() => onFork(trimmed)}
					>
						{t('extensions.system.fork.create')}
					</Button>
				</>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
				<Field label={t('extensions.system.fork.nameLabel')}>
					<Input
						value={name}
						maxLength={120}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
					/>
				</Field>
				<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
					{t('extensions.system.fork.note')}
				</div>
			</div>
		</Dialog>
	);
}
