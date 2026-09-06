import { useState } from 'react';
import type { McpConflictHunk, McpProposalConflict } from '@dndtools/core';
import { Button, Chip, Icon } from '../../ds';
import { T, srOnly } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';

/* ---- RC-AI-2.2 — the THREE-WAY CONFLICT a DM settles before a staged rewrite can land -------------
 * A staged note rewrite is written against the revision the assistant read. When a human edits that
 * note first, the two edits have diverged: approving as staged would record a conflict and write
 * NOTHING while reporting success. The Core computes the three-way record (base as captured at
 * staging, the assistant's version, the note as it stands, the per-passage attribution and the diff3
 * merge); this component renders it and dispatches the DM's choice as ONE validated command.
 * Merge is offered only when the Core says a clean merge exists — never as a control that cannot act. */

const KIND_LABEL: Record<McpConflictHunk['kind'], MessageKey> = {
	unchanged: 'settings.ai.conflictKind.agreed',
	'ai-only': 'settings.ai.conflictKind.aiOnly',
	'mine-only': 'settings.ai.conflictKind.mineOnly',
	agreed: 'settings.ai.conflictKind.agreed',
	conflicting: 'settings.ai.conflictKind.conflicting',
};

const WARNING_LABEL: Record<string, MessageKey> = {
	'no-base-snapshot': 'settings.ai.conflictWarn.noBaseSnapshot',
	'overlapping-edits': 'settings.ai.conflictWarn.overlappingEdits',
	'title-conflict': 'settings.ai.conflictWarn.titleConflict',
	'diff-bounded': 'settings.ai.conflictWarn.diffBounded',
	'hunks-bounded': 'settings.ai.conflictWarn.hunksBounded',
};

/** One side of one passage: its label and its lines. Renders an em dash when the side is empty. */
function SideLines({ label, lines }: { label: string; lines: string[] }) {
	return (
		<div
			style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 180px' }}
		>
			<span style={{ font: `11px ${T.sans}`, color: T.ter }}>{label}</span>
			<span style={{ font: `11.5px/1.5 ${T.mono}`, color: T.ink, wordBreak: 'break-word' }}>
				{lines.length === 0 ? '—' : lines.join('\n')}
			</span>
		</div>
	);
}

/**
 * The conflict block for ONE pending proposal whose base went stale. The three-way detail sits behind
 * a disclosure so a long note cannot bury the choices; the choices themselves are always visible,
 * because a DM must be able to settle the divergence without reading every line first.
 */
export function AiProposalConflict({
	conflict,
	canWrite,
	busy,
	onResolve,
}: {
	conflict: McpProposalConflict;
	canWrite: boolean;
	busy: boolean;
	onResolve: (resolution: 'keep-ai' | 'keep-mine' | 'merge') => void;
}) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const canMerge = conflict.resolutions.includes('merge');

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 8,
				marginTop: 8,
				padding: '10px 11px',
				borderRadius: 9,
				border: `1px solid ${T.warn}`,
				background: T.alt,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
				<Icon name="warning" size={14} color={T.warn} />
				<span style={{ font: `600 12.5px ${T.sans}`, color: T.ink }}>
					{t('settings.ai.conflictHeading')}
				</span>
				{conflict.hunks.length > 0 && (
					<Button
						variant="ghost"
						size="sm"
						icon={open ? 'chevron-down' : 'chevron-right'}
						aria-expanded={open}
						onClick={() => setOpen((prev) => !prev)}
					>
						{open ? t('settings.ai.conflictHide') : t('settings.ai.conflictShow')}
					</Button>
				)}
			</div>
			<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
				{t('settings.ai.conflictIntro')}
			</div>
			{conflict.warnings.map((warning) => (
				<div key={warning.code} style={{ font: `11.5px ${T.sans}`, color: T.warn }}>
					{WARNING_LABEL[warning.code] ? t(WARNING_LABEL[warning.code]!) : warning.message}
				</div>
			))}
			{open && conflict.hunks.length > 0 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					<span style={srOnly}>{t('settings.ai.conflictRegion', { target: conflict.label })}</span>
					{conflict.titleConflict && (
						<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
							<SideLines label={t('settings.ai.conflictTitleRow')} lines={[conflict.ai.title]} />
							<SideLines label={t('settings.ai.conflictMine')} lines={[conflict.current.title]} />
						</div>
					)}
					{conflict.hunks.map((hunk) => (
						<div key={hunk.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
							<div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
								<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
									{t('settings.ai.conflictLine', { line: hunk.line })}
								</span>
								<Chip tone={hunk.kind === 'conflicting' ? 'danger' : 'neutral'}>
									{t(KIND_LABEL[hunk.kind])}
								</Chip>
							</div>
							<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
								{conflict.base.available && (
									<SideLines label={t('settings.ai.conflictBase')} lines={hunk.base} />
								)}
								<SideLines label={t('settings.ai.conflictAi')} lines={hunk.ai} />
								<SideLines label={t('settings.ai.conflictMine')} lines={hunk.current} />
							</div>
						</div>
					))}
				</div>
			)}
			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
				<Button
					variant="secondary"
					size="sm"
					icon="check"
					disabled={!canWrite || busy}
					onClick={() => onResolve('keep-ai')}
				>
					{t('settings.ai.conflictKeepAi')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					icon="close"
					disabled={!canWrite || busy}
					onClick={() => onResolve('keep-mine')}
				>
					{t('settings.ai.conflictKeepMine')}
				</Button>
				{canMerge && (
					<Button
						variant="secondary"
						size="sm"
						disabled={!canWrite || busy}
						onClick={() => onResolve('merge')}
					>
						{t('settings.ai.conflictMerge')}
					</Button>
				)}
			</div>
			{canMerge && (
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
					{t('settings.ai.conflictMergeHint')}
				</div>
			)}
		</div>
	);
}
