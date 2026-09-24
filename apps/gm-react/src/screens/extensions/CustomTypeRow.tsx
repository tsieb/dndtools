import type { CustomObjectTypeDefinition, CustomObjectTypeSummary } from '@dndtools/core';
import { Badge, Button, Icon } from '../../ds';
import { T, mono } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useFocusOnReveal, VISIBILITY_WORD } from './shared';

/** One defined custom type: what it declares, how many objects use it, and its actions. */
export function CustomTypeRow({
	s,
	def,
	count,
	canWrite,
	busy,
	confirmingDelete,
	onNewInstance,
	onEdit,
	onAskDelete,
	onDelete,
	onKeep,
}: {
	s: CustomObjectTypeSummary;
	def: CustomObjectTypeDefinition | undefined;
	count: number;
	canWrite: boolean;
	busy: boolean;
	confirmingDelete: boolean;
	onNewInstance: () => void;
	onEdit: () => void;
	onAskDelete: () => void;
	onDelete: () => void;
	onKeep: () => void;
}) {
	const { t } = useI18n();
	const confirmRef = useFocusOnReveal<HTMLSpanElement>(confirmingDelete);
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				// A 36px glyph, the name/meta block, a count and up to three action buttons
				// need ~350px of no-wrap width against ~327px of inner width on a 393px
				// phone. DS Button wraps its own label rather than refusing to shrink, so
				// without this the actions squeezed into unreadable slivers instead of
				// dropping to a second line. Every sibling panel already wraps.
				flexWrap: 'wrap',
				gap: 'var(--space-3)',
				padding: 'var(--space-3)',
				border: `1px solid ${T.bd}`,
				borderRadius: 'var(--radius-lg)',
				background: T.surf,
			}}
		>
			<span
				aria-hidden="true"
				style={{
					width: 36,
					height: 36,
					borderRadius: 'var(--radius-md)',
					background: T.alt,
					color: T.acc,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					flex: '0 0 auto',
				}}
			>
				<Icon name="tag" size="md" />
			</span>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						flexWrap: 'wrap',
					}}
				>
					<span style={{ font: `600 var(--text-sm) ${T.sans}` }}>{s.label}</span>
					<Badge status="neutral">{t('extensions.customTypes.custom')}</Badge>
					{s.dmOnlyFields.length > 0 && (
						<Badge status="neutral" icon="dm-only">
							{t('extensions.objects.dmOnlyFields', {
								count: s.dmOnlyFields.length,
							})}
						</Badge>
					)}
				</div>
				<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
					<span style={mono}>{s.id}</span>{' '}
					{t('extensions.customTypes.summaryMeta', {
						fields: s.fieldCount,
						visibility: VISIBILITY_WORD[s.defaultVisibility]
							? t(VISIBILITY_WORD[s.defaultVisibility])
							: s.defaultVisibility,
					})}
				</div>
			</div>
			<span
				style={{
					font: `var(--text-xs) ${T.mono}`,
					color: count ? T.ink : T.sub,
					flex: '0 0 auto',
				}}
			>
				{t('extensions.objects.inVault', { count })}
			</span>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					flex: '0 0 auto',
					flexWrap: 'wrap',
				}}
			>
				{def && (
					<Button
						variant="secondary"
						size="sm"
						icon="add"
						disabled={!canWrite || busy}
						onClick={onNewInstance}
					>
						{t('extensions.customTypes.new')}
					</Button>
				)}
				{def && (
					<Button
						variant="ghost"
						size="sm"
						icon="edit"
						disabled={!canWrite || busy}
						aria-label={t('extensions.customTypes.editLabel', { label: s.label })}
						onClick={onEdit}
					>
						{t('common.action.edit')}
					</Button>
				)}
				{def && confirmingDelete && (
					<span ref={confirmRef} style={{ display: 'contents' }}>
						<Button variant="danger" size="sm" disabled={!canWrite || busy} onClick={onDelete}>
							{count > 0
								? t('extensions.customTypes.confirmDeleteCount', { count, label: s.label })
								: t('extensions.customTypes.confirmDelete', { label: s.label })}
						</Button>
						<Button variant="ghost" size="sm" onClick={onKeep}>
							{t('extensions.compendium.keep')}
						</Button>
					</span>
				)}
				{def && !confirmingDelete && (
					<Button
						variant="ghost"
						size="sm"
						icon="delete"
						disabled={!canWrite || busy}
						aria-label={t('extensions.customTypes.deleteLabel', { label: s.label })}
						onClick={onAskDelete}
					>
						{t('common.action.delete')}
					</Button>
				)}
			</div>
		</div>
	);
}
