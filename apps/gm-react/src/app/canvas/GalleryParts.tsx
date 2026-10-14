import type React from 'react';
import { useId } from 'react';
import { useI18n } from '../../i18n';
import { CreateEntry, GenerateGateNote, useGenerateGate } from '../widgetBuilder/GenerateDialog';

// RC-POL-1.2 — the Add panel's empty-board header and its "More ways to add" group, out of
// `AddWidgetGallery.tsx`.

/** Shown while the board is empty: what a tile is, and the template entry beside it. */
export function GalleryStartHeader({ action }: { action?: React.ReactNode }) {
	const { t } = useI18n();
	return (
		<div
			data-testid="gallery-start-header"
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-1)',
				padding: 'var(--space-3)',
				borderRadius: 'var(--radius-md)',
				border: '1px solid var(--color-accent-border)',
				background: 'var(--color-accent-subtle)',
			}}
		>
			<h3
				style={{
					margin: 'var(--space-0)',
					font: '700 var(--text-sm) var(--font-sans)',
					color: 'var(--color-text-primary)',
				}}
			>
				{t('boardCanvas.add.startTitle')}
			</h3>
			<div
				style={{
					font: 'var(--text-xs)/1.45 var(--font-sans)',
					color: 'var(--color-text-secondary)',
				}}
			>
				{t('boardCanvas.add.startBody')}
			</div>
			{action}
		</div>
	);
}

/** "Generate with assistant" and "Build your own", after the library. */
export function GalleryMoreWays({
	onClose,
	onGenerate,
	onBuild,
}: {
	onClose: () => void;
	onGenerate?: () => void;
	onBuild?: () => void;
}) {
	const { t } = useI18n();
	const moreId = useId();
	const generate = useGenerateGate();
	return (
		<div
			role="group"
			aria-labelledby={moreId}
			style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
		>
			<div id={moreId} style={{ font: '600 var(--text-xs) var(--font-sans)' }}>
				{t('boardCanvas.add.moreWays')}
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
					gap: 'var(--space-2)',
				}}
			>
				{onGenerate && (
					<CreateEntry
						icon="sparkle"
						label={t(
							generate.ready && generate.local
								? 'boardCanvas.add.generateLocal'
								: 'boardCanvas.add.generate',
						)}
						hint={t('boardCanvas.add.generateHint')}
						blocked={
							generate.ready ? undefined : <GenerateGateNote gate={generate} onFollow={onClose} />
						}
						onClick={() => {
							onClose();
							onGenerate();
						}}
					/>
				)}
				{onBuild && (
					<CreateEntry
						icon="wand"
						label={t('boardCanvas.add.build')}
						hint={t('boardCanvas.add.buildHint')}
						onClick={() => {
							onClose();
							onBuild();
						}}
					/>
				)}
			</div>
		</div>
	);
}
