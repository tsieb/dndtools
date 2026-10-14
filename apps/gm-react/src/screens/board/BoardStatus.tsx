import { Callout, Icon } from '../../ds';
import { srOnly } from '../../app/screen-kit';

/**
 * Every board write's confirmation surfaces here, so it has to be a live region (WCAG 4.1.3) — but a
 * polite region must ALREADY be in the DOM for a content change to be announced. Mounting
 * `<div role="status">Layout saved.</div>` inserts the host and its text in one mutation, which
 * screen readers routinely drop. So the host is permanent and only its contents change.
 * ⚠️ It used to collapse with `display:'none'`, which takes the node out of the ACCESSIBILITY TREE —
 * so flipping to `inline-flex` WITH content was the exact insert-region-and-text-together mutation
 * the comment above warns about, and every board confirmation ("Layout saved.", "Layout applied.",
 * "Previous layout restored.") was silent. It now collapses with `srOnly` instead: absolutely
 * positioned, so it is not a flex item and contributes no box and no parent `gap`, but it stays in
 * the a11y tree. RC-POL-1.2 moved it, and the failure callout under it, out of `Board.tsx`.
 */
export function BoardStatus({ status, error }: { status: string | null; error: string | null }) {
	return (
		<>
			<div
				role="status"
				aria-live="polite"
				data-testid="board-status"
				style={
					status
						? {
								display: 'inline-flex',
								alignItems: 'center',
								gap: 'var(--space-1-5)',
								font: 'var(--text-xs) var(--font-sans)',
								color: 'var(--color-text-secondary)',
								flex: '0 0 auto',
							}
						: srOnly
				}
			>
				{status && (
					<>
						<Icon name="info" size="sm" /> {status}
					</>
				)}
			</div>
			{error && (
				<Callout tone="error" role="alert">
					{error}
				</Callout>
			)}
		</>
	);
}
