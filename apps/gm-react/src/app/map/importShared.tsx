import { type ReactNode } from 'react';
import { type MapImportElementKind } from '@dndtools/core';
import { eb } from '../screen-kit';

/* The import dialog's small shared pieces. Extracted from MapBuilder.tsx unchanged (RC-STB-2.6). */

export function PanelLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				margin: '2px 0 8px',
			}}
		>
			<span style={eb}>{children}</span>
			{action}
		</div>
	);
}

// ── Import wizard (real map.import-asset / map.commit-import) ───────────────────────────────────

export const IMPORT_ELEMENT_KINDS: MapImportElementKind[] = [
	'dimensions',
	'grid',
	'background-image',
	'walls',
	'lights',
	'notes',
	'layers',
	'tokens',
];

export const SUPPORT_PILL: Record<
	string,
	{ tone: string; bg: string; label: string; icon: string }
> = {
	importable: {
		tone: 'var(--color-status-success)',
		bg: 'var(--color-status-success-subtle)',
		label: 'Importable',
		icon: 'success',
	},
	lossy: {
		tone: 'var(--color-status-warning)',
		bg: 'var(--color-status-warning-subtle)',
		label: 'Lossy',
		icon: 'warning',
	},
	unsupported: {
		tone: 'var(--color-status-error)',
		bg: 'var(--color-status-error-subtle)',
		label: 'Unsupported',
		icon: 'error',
	},
	blocked: {
		tone: 'var(--color-text-tertiary)',
		bg: 'var(--color-surface-sunken)',
		label: 'Blocked',
		icon: 'lock',
	},
};

export interface PickedFile {
	file: File;
	bytes: Uint8Array;
	dimensions: { width: number; height: number } | null;
}
