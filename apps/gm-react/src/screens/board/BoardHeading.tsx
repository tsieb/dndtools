import { Icon } from '../../ds';

/**
 * The board toolbar's leading block: the screen's glyph, its name as the pane's heading, and a one-line
 * summary under it. Moved out of `Board.tsx` (RC-CAN-7.3) so the same block names whichever screen the
 * board engine is rendering — the GM screen at `/board`, or any canvas screen at `/screen/:id`.
 */
export function BoardHeading({
	icon,
	title,
	summary,
}: {
	icon: string;
	title: string;
	summary: string;
}) {
	return (
		<>
			<span
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: 30,
					height: 30,
					borderRadius: 'var(--radius-md)',
					background: 'var(--color-accent)',
					color: 'var(--color-accent-foreground)',
					flex: '0 0 auto',
				}}
			>
				<Icon name={icon} size="sm" />
			</span>
			<div style={{ minWidth: 0, flex: '1 1 160px' }}>
				{/* The shell's <h1> lives in the top bar, outside <main>, so heading navigation
				    found nothing inside the board pane. */}
				<h2
					style={{
						margin: 'var(--space-0)',
						font: '700 var(--text-xl) var(--font-display)',
						color: 'var(--color-text-primary)',
						overflowWrap: 'anywhere',
					}}
				>
					{title}
				</h2>
				<div
					style={{
						font: 'var(--text-2xs) var(--font-sans)',
						color: 'var(--color-text-tertiary)',
					}}
				>
					{summary}
				</div>
			</div>
		</>
	);
}
