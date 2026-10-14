import { useId } from 'react';
import type { WidgetLibraryEntry } from '@dndtools/core';
import { Icon } from '../../ds';
import { tileMetadataForDefinition } from '../widgets/tileMeta';
import { WidgetGlyph } from './frameParts';

// RC-POL-1.2 — the Add panel's row, out of `WidgetFrame.tsx`.

/** Row text: one font shorthand plus a colour. */
const rowText = (font: string, color: string) => ({ font: `${font} var(--font-sans)`, color });
const ONE_LINE = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
type RowProps = {
	entry: WidgetLibraryEntry;
	/** The pick control's whole name, "Add Dice": the row's visible title is part of it. */
	label: string;
	onPick: () => void;
	/** Hover by mouse or keyboard focus: the row to show a miniature beside, or null to hide it. */
	onPreview?: (row: HTMLElement | null) => void;
};

/**
 * One Add-panel row (RC-CAN-8.5): glyph, title, category and a one-line purpose, all inside ONE
 * button named "Add <widget>". The miniature is not part of the row — the gallery draws it beside
 * the row on mouse hover or keyboard focus, `aria-hidden` and `inert`, so a list of forty widgets
 * is forty short rows and forty tab stops, not forty live bodies full of dead buttons.
 */
export function WidgetLibraryCard({ entry, label, onPick, onPreview }: RowProps) {
	const baseId = useId();
	const [descId, reasonId] = [`${baseId}-desc`, `${baseId}-reason`];
	const meta = tileMetadataForDefinition(entry);
	const reason = entry.availability.available ? null : entry.availability.reason;
	const accent = reason ? 'var(--color-border-strong)' : `var(${meta.accentToken})`;
	const show = (e: React.SyntheticEvent<HTMLElement>) => onPreview?.(e.currentTarget);
	const hide = () => onPreview?.(null);
	return (
		<li data-testid={`gallery-card-${entry.type}`} className={meta.silhouetteClass}>
			<button
				type="button"
				data-testid={`gallery-entry-${entry.type}`}
				data-category={entry.category ?? ''}
				aria-label={label}
				aria-describedby={reason ? `${descId} ${reasonId}` : descId}
				// `aria-disabled`, not `disabled`, keeps the reason reachable by keyboard (tab order).
				aria-disabled={reason ? true : undefined}
				onClick={() => reason || onPick()}
				onPointerEnter={(e) => e.pointerType === 'mouse' && show(e)}
				onPointerLeave={hide}
				// Keyboard focus only: a tap focuses the row on its way to picking it.
				onFocus={(e) => e.currentTarget.matches(':focus-visible') && show(e)}
				onBlur={hide}
				style={{
					display: 'grid',
					gridTemplateColumns: 'auto minmax(0, 1fr) auto',
					alignItems: 'center',
					columnGap: 'var(--space-2)',
					rowGap: 'var(--space-0-5)',
					width: '100%',
					minHeight: 44,
					padding: 'var(--space-2) var(--space-3)',
					textAlign: 'left',
					border: '1px solid var(--color-border)',
					// The accent rail is a border, not a background: forced-colors keeps it (as WidgetFrame's).
					borderLeft: `4px solid ${accent}`,
					borderRadius: 'var(--radius-md)',
					background: reason ? 'var(--color-surface-sunken)' : 'var(--color-surface-raised)',
					cursor: reason ? 'not-allowed' : 'pointer',
				}}
			>
				<WidgetGlyph
					icon={meta.icon}
					size={16}
					color={reason ? 'var(--color-text-tertiary)' : accent}
				/>
				<span
					style={{
						...ONE_LINE,
						...rowText(
							'600 var(--text-sm)',
							reason ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
						),
					}}
				>
					{entry.displayName}
				</span>
				{/* Tertiary only on the raised row: a dimmed row's sunken fill takes it under 4.5:1. */}
				<span
					style={rowText(
						'var(--text-2xs)',
						reason ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
					)}
				>
					{entry.category ?? ''}
				</span>
				<span
					id={descId}
					style={{
						gridColumn: '2 / -1',
						...ONE_LINE,
						...rowText('var(--text-2xs)/1.4', 'var(--color-text-secondary)'),
					}}
				>
					{meta.description}
				</span>
				{reason && (
					<span
						id={reasonId}
						style={{
							gridColumn: '2 / -1',
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-1)',
							...rowText('600 var(--text-2xs)/1.4', 'var(--color-text-primary)'),
						}}
					>
						<Icon name="lock" size="sm" />
						{reason}
					</span>
				)}
			</button>
		</li>
	);
}
