import { useState } from 'react';
import {
	computeMcpProposalPreview,
	type McpProposalPreview,
	type McpStagedProposal,
} from '@dndtools/core';
import { Badge, Button, Chip, Icon } from '../../ds';
import { T, srOnly } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';

/* ---- RC-AI-2.1 — the SEMANTIC DIFF PREVIEW a DM reads before approving a staged write -------------
 * "content.update-item on note-7" is not a reviewable statement. The Core computes the preview
 * (`computeMcpProposalPreview` — structural field summary, line delta, backlink impact, all derived
 * from CURRENT state and read as the PROPOSAL'S bound actor); this component only renders it. The
 * one-line summary is always visible so the pending list stays scannable; the field-by-field detail
 * sits behind a disclosure so a long note cannot bury the approve/reject controls.
 * Nothing here dispatches: the preview is read-only, and AI still proposes rather than disposes. */

const CHANGE_KIND_LABEL: Record<McpProposalPreview['changeKind'], MessageKey> = {
	create: 'settings.ai.previewSummary.create',
	update: 'settings.ai.previewSummary.update',
	append: 'settings.ai.previewSummary.append',
	other: 'settings.ai.previewSummary.other',
};

/** The Core's warning codes, localized. An unrecognized code falls back to the Core's own message. */
const WARNING_LABEL: Record<string, MessageKey> = {
	'no-baseline': 'settings.ai.previewWarn.noBaseline',
	'stale-base-revision': 'settings.ai.previewWarn.staleBase',
	'diff-bounded': 'settings.ai.previewWarn.diffBounded',
	'backlinks-bounded': 'settings.ai.previewWarn.backlinksBounded',
};

const CHANGE_LABEL: Record<McpProposalPreview['fields'][number]['change'], MessageKey> = {
	added: 'settings.ai.previewChange.added',
	changed: 'settings.ai.previewChange.changed',
	removed: 'settings.ai.previewChange.removed',
};

/** One labelled row of wikilink chips. Renders nothing when the list is empty. */
function LinkRow({ label, links }: { label: string; links: string[] }) {
	if (links.length === 0) return null;
	return (
		<div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
			<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{label}</span>
			{links.map((link) => (
				<Chip key={link} tone="neutral">
					{link}
				</Chip>
			))}
		</div>
	);
}

/**
 * The preview block for ONE pending proposal, rendered inside the staged-writes review panel. The
 * disclosure is a real button with `aria-expanded`, so the detail is reachable by keyboard exactly as
 * it is by pointer.
 */
export function AiProposalPreview({ proposal }: { proposal: McpStagedProposal }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [open, setOpen] = useState(false);
	const preview = computeMcpProposalPreview(runtime.state, proposal);
	const target = preview.target.label ?? t('settings.ai.previewUnknownTarget');
	const delta = preview.lineDelta;
	const hasDetail =
		preview.fields.length > 0 ||
		preview.backlinks.added.length > 0 ||
		preview.backlinks.removed.length > 0 ||
		preview.backlinks.incoming.length > 0;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
				<span style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ink }}>
					{t(CHANGE_KIND_LABEL[preview.changeKind], { target })}
				</span>
				{delta !== null && (
					<Badge status="info">
						{t('settings.ai.previewLines', { added: delta.added, removed: delta.removed })}
					</Badge>
				)}
				{hasDetail && (
					<Button
						variant="ghost"
						size="sm"
						icon={open ? 'chevron-down' : 'chevron-right'}
						aria-expanded={open}
						onClick={() => setOpen((prev) => !prev)}
					>
						{open ? t('settings.ai.previewHide') : t('settings.ai.previewShow')}
					</Button>
				)}
			</div>
			{preview.warnings.map((warning) => (
				<div
					key={warning.code}
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						font: `11.5px ${T.sans}`,
						color: T.warn,
					}}
				>
					<Icon name="warning" size={13} color={T.warn} />
					{WARNING_LABEL[warning.code] ? t(WARNING_LABEL[warning.code]!) : warning.message}
				</div>
			))}
			{open && hasDetail && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 8,
						padding: '9px 11px',
						borderRadius: 9,
						border: `1px solid ${T.bd}`,
						background: T.alt,
					}}
				>
					<span style={srOnly}>{t('settings.ai.previewRegion', { target })}</span>
					{preview.fields.map((field) => (
						<div key={field.path} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
							<div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
								<span style={{ font: `600 11.5px ${T.mono}`, color: T.ink }}>{field.path}</span>
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
									{t(CHANGE_LABEL[field.change])}
								</span>
							</div>
							{field.before !== null && (
								<div style={{ font: `11.5px/1.5 ${T.mono}`, color: T.ter }}>
									{t('settings.ai.previewBefore')}: {field.before}
								</div>
							)}
							{field.after !== null && (
								<div style={{ font: `11.5px/1.5 ${T.mono}`, color: T.ink }}>
									{t('settings.ai.previewAfter')}: {field.after}
								</div>
							)}
						</div>
					))}
					<LinkRow label={t('settings.ai.previewLinksAdded')} links={preview.backlinks.added} />
					<LinkRow label={t('settings.ai.previewLinksRemoved')} links={preview.backlinks.removed} />
					<LinkRow
						label={t('settings.ai.previewLinksIncoming')}
						links={preview.backlinks.incoming}
					/>
				</div>
			)}
		</div>
	);
}
