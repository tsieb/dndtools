import { type ReactNode } from 'react';
import { type MapImportElementKind } from '@dndtools/core';
import { eb } from '../screen-kit';
import type { MessageKey } from '../../i18n';

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
	{ tone: string; bg: string; label: MessageKey; icon: string }
> = {
	importable: {
		tone: 'var(--color-status-success)',
		bg: 'var(--color-status-success-subtle)',
		label: 'mapImport.support.importable',
		icon: 'success',
	},
	lossy: {
		tone: 'var(--color-status-warning)',
		bg: 'var(--color-status-warning-subtle)',
		label: 'mapImport.support.lossy',
		icon: 'warning',
	},
	unsupported: {
		tone: 'var(--color-status-error)',
		bg: 'var(--color-status-error-subtle)',
		label: 'mapImport.support.unsupported',
		icon: 'error',
	},
	blocked: {
		tone: 'var(--color-text-tertiary)',
		bg: 'var(--color-surface-sunken)',
		label: 'mapImport.support.blocked',
		icon: 'lock',
	},
};

export interface PickedFile {
	file: File;
	bytes: Uint8Array;
	dimensions: { width: number; height: number } | null;
}
