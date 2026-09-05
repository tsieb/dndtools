import { Icon } from '../../ds';
import { WIDGET_PLACEHOLDER_COPY } from './resolveRenderer';

/**
 * The frame body for a widget nothing can draw: what is missing, and what was kept.
 *
 * Extracted from `WidgetRenderSlot` (which still re-exports it, so no caller changed) when RC-WID-1.3
 * needed the same card for the sandbox host's own failure states. The alternative was an import cycle
 * between the registry and one of the renderers in it, or a second empty state that would drift from
 * this one — and "disabled, preserved" is a promise the DM should read in exactly one wording.
 */
export function WidgetPlaceholder({ diagnostic }: { diagnostic: string }) {
	return (
		<div
			data-testid="widget-placeholder"
			style={{
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				gap: 4,
				minHeight: 0,
				overflow: 'hidden',
				color: 'var(--color-text-secondary)',
			}}
		>
			<span
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 5,
					font: '600 var(--text-2xs) var(--font-sans)',
					color: 'var(--color-text-primary)',
					flex: '0 0 auto',
				}}
			>
				<Icon name="info" size={12} />
				{WIDGET_PLACEHOLDER_COPY.label}
			</span>
			<span style={{ font: 'var(--text-xs)/1.4 var(--font-sans)' }}>{diagnostic}</span>
			<span
				style={{
					font: 'var(--text-2xs)/1.4 var(--font-sans)',
					color: 'var(--color-text-tertiary)',
				}}
			>
				{WIDGET_PLACEHOLDER_COPY.reassurance}
			</span>
		</div>
	);
}
