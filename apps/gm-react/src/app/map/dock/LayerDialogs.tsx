import type { MapLayerQueryEntry } from '@dndtools/core';
import { useState } from 'react';
import { Button, Dialog, Icon, Input } from '../../../ds';
import { useI18n } from '../../../i18n';
import { T } from '../../screen-kit';
import type { MapEditorApi } from '../useMapEditor';

export function MenuItem({
	icon,
	label,
	onClick,
	disabled,
	danger,
}: {
	icon: string;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
}) {
	// There is no global `button:hover` rule anywhere in this app and an inline style cannot express
	// `:hover`, so this menu had ZERO pointer feedback: the row under the cursor looked exactly like
	// the other four. A menu you cannot see yourself pointing at is genuinely hard to operate.
	// `ds/components/map/LayerRow.jsx` is the in-repo pattern.
	const [hov, setHov] = useState(false);
	const highlight = hov && !disabled;
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			onFocus={() => setHov(true)}
			onBlur={() => setHov(false)}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-2)',
				padding: 'var(--space-2) var(--space-2)',
				borderRadius: 'var(--radius-md)',
				border: 'none',
				background: highlight
					? danger
						? 'var(--color-status-error-subtle)'
						: T.hover
					: 'transparent',
				cursor: disabled ? 'not-allowed' : 'pointer',
				opacity: disabled ? 0.4 : 1,
				color: danger ? 'var(--color-status-error-text)' : T.ink,
				font: `12.5px ${T.sans}`,
				textAlign: 'left',
			}}
		>
			<Icon name={icon} size={14} color={danger ? T.err : T.ter} />
			{label}
		</button>
	);
}

export function TagsDialog({
	editor,
	layer,
	onClose,
}: {
	editor: MapEditorApi;
	layer: MapLayerQueryEntry;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const [draft, setDraft] = useState(layer.tags.join(', '));
	const [failed, setFailed] = useState(false);
	return (
		<Dialog
			open
			onClose={onClose}
			title={t('mapDock.tagsTitle', { name: layer.name })}
			icon="tag"
			size="sm"
			footer={
				<>
					<Button variant="ghost" size="sm" onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="check"
						disabled={editor.busy}
						onClick={async () => {
							setFailed(false);
							const tags = draft
								.split(',')
								.map((t) => t.trim())
								.filter(Boolean);
							const accepted = await editor.run({
								type: 'map.set-layer-tags',
								actorId: editor.actorId,
								payload: { mapId: editor.mapId, layerId: layer.layerId, tags, query: layer.query },
							} as never);
							if (accepted) onClose();
							else setFailed(true);
						}}
					>
						{t('common.action.save')}
					</Button>
				</>
			}
		>
			{failed && <p role="alert">{editor.notice ?? t('atlas.actionFailed')}</p>}
			<Input
				value={draft}
				aria-label={t('mapDock.tagsLabel')}
				placeholder={t('mapDock.tagsPlaceholder')}
				onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
			/>
			<div style={{ marginTop: 'var(--space-2)', font: `11.5px ${T.sans}`, color: T.ter }}>
				{t('mapDock.tagsHelp')}
			</div>
		</Dialog>
	);
}
