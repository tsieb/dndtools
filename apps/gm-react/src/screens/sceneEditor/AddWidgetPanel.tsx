import type React from 'react';
import { type WidgetLibraryEntry } from '@dndtools/core';
import { Card, IconButton } from '../../ds';
import { WidgetGlyph } from '../../app/SceneBoardCanvas';
import { PHONE_PANEL_OVERLAY } from './shared';
import { useI18n } from '../../i18n';

export function AddWidgetPanel({
	library,
	phone,
	onAdd,
	onClose,
}: {
	library: WidgetLibraryEntry[];
	phone: boolean;
	onAdd: (entry: WidgetLibraryEntry) => void;
	onClose: () => void;
}) {
	const { t } = useI18n();
	return (
		<Card
			data-testid="scene-add-widget-panel"
			elevation="overlay"
			padding="md"
			onKeyDown={(e: React.KeyboardEvent) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					onClose();
				}
			}}
			style={{
				width: 300,
				flex: '0 0 auto',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				maxHeight: '100%',
				overflow: 'auto',
				...(phone ? PHONE_PANEL_OVERLAY : {}),
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span
					style={{
						flex: 1,
						font: '700 var(--text-md) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					{t('sceneEditor.addWidget')}
				</span>
				<IconButton
					icon="close"
					label={t('common.action.close')}
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
			</div>
			{library.length === 0 ? (
				<div
					style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}
				>
					{t('sceneEditor.noWidgetsAvailable')}
				</div>
			) : (
				library.map((entry) => (
					<button
						key={`${entry.packageId}:${entry.type}`}
						type="button"
						onClick={() => onAdd(entry)}
						style={{
							display: 'flex',
							alignItems: 'flex-start',
							gap: 'var(--space-2)',
							padding: 'var(--space-2)',
							textAlign: 'left',
							border: '1px solid var(--color-border)',
							borderRadius: 'var(--radius-md)',
							background: 'var(--color-surface-alt)',
							cursor: 'pointer',
						}}
					>
						<WidgetGlyph icon={entry.icon ?? 'widget'} size="sm" />
						<div style={{ minWidth: 0 }}>
							<div
								style={{
									font: '600 var(--text-sm) var(--font-sans)',
									color: 'var(--color-text-primary)',
								}}
							>
								{entry.displayName}
							</div>
							{entry.description && (
								<div
									style={{
										font: 'var(--text-2xs)/1.4 var(--font-sans)',
										color: 'var(--color-text-tertiary)',
									}}
								>
									{entry.description}
								</div>
							)}
						</div>
					</button>
				))
			)}
		</Card>
	);
}
