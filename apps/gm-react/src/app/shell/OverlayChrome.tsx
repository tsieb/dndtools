import type { CSSProperties, ReactNode } from 'react';

/** Overlay captions sit on sunken and selected surfaces as well as raised panels. */
export function OverlayChrome({ children }: { children: ReactNode }) {
	return (
		<div
			style={
				{
					display: 'contents',
					'--color-text-tertiary': 'var(--color-text-secondary)',
				} as CSSProperties
			}
		>
			{children}
		</div>
	);
}
