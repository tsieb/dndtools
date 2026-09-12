export interface FigureProps extends React.HTMLAttributes<HTMLElement> {
	src?: string;
	imgStyle?: React.CSSProperties;
	alt?: string;
	caption?: React.ReactNode;
	align?: 'left' | 'center' | 'right';
}

import React from 'react';

/**
 * Figure — semantic image/illustration wrapper with caption.
 */
export function Figure({
	src,
	alt = '',
	caption,
	children,
	style,
	imgStyle,
	align = 'left',
	...rest
}: FigureProps) {
	const alignMap = {
		left: 'flex-start',
		center: 'center',
		right: 'flex-end',
	};
	const alignItems = alignMap[align] || alignMap.left;

	return (
		<figure
			style={{
				margin: 0,
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-1)',
				alignItems,
				...style,
			}}
			{...rest}
		>
			{src ? (
				<img
					src={src}
					alt={alt}
					style={{
						display: 'block',
						maxWidth: '100%',
						height: 'auto',
						borderRadius: 'var(--radius-md)',
						...imgStyle,
					}}
				/>
			) : (
				children
			)}
			{caption && (
				<figcaption
					style={{
						fontSize: 'var(--text-2xs)',
						color: 'var(--color-text-tertiary)',
						fontFamily: 'var(--font-sans)',
						lineHeight: 1.4,
					}}
				>
					{caption}
				</figcaption>
			)}
		</figure>
	);
}
