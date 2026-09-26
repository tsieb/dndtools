import { useRef, useState } from 'react';
import { Button, Card, Icon, Menu } from '../../ds';
import { useI18n } from '../../i18n';
import type { boardLayoutIssues } from '../../app/board-helpers';

/**
 * RC-CAN-3.3/3.4: a widget dragged (or preset-applied) past the board's columns is clamped back onto
 * the grid at the point it commits, but that snap can still land it on top of another widget. This
 * banner names that honestly instead of leaving an invisible overlap, and its own text is the quality
 * indicator's trigger: a Popover lists every offender by name (shape — warning triangle for an
 * overflow, error circle for an overlap — carries the distinction, not colour alone) with a "Select"
 * that jumps the DM straight to it, alongside the one-click "Fix layout".
 *
 * Moved out of `Board.tsx` unchanged (RC-CAN-7.3) so the board could take the screen route's props
 * inside its line budget. The popover owns its own open state, separate from Add/Layouts, so opening
 * it does not fight their shared side slot.
 */
export function BoardLayoutBanner({
	issues,
	titleOf,
	onFix,
	onSelect,
}: {
	issues: ReturnType<typeof boardLayoutIssues>;
	titleOf: (widgetId: string) => string;
	onFix: () => Promise<void>;
	onSelect: (widgetId: string) => void;
}) {
	const { t } = useI18n();
	const [qualityOpen, setQualityOpen] = useState(false);
	const qualityTriggerRef = useRef<HTMLButtonElement>(null);
	return (
		<Card
			elevation="flat"
			padding="sm"
			data-testid="board-layout-banner"
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-2)',
				flex: '0 0 auto',
				position: 'relative',
				borderColor: 'var(--color-status-warning)',
			}}
		>
			<Icon name="warning" size="sm" />
			<button
				type="button"
				ref={qualityTriggerRef}
				aria-haspopup="menu"
				aria-expanded={qualityOpen}
				data-testid="board-layout-quality-trigger"
				onClick={() => setQualityOpen((v) => !v)}
				style={{
					flex: 1,
					textAlign: 'left',
					background: 'transparent',
					border: 'none',
					padding: 'var(--space-0)',
					cursor: 'pointer',
					font: 'var(--text-xs) var(--font-sans)',
					color: 'var(--color-text-primary)',
					textDecoration: 'underline',
					textUnderlineOffset: 2,
				}}
			>
				{t('board.layoutIssues', { count: issues.length })}
			</button>
			<Button
				variant="secondary"
				size="sm"
				onClick={() => void onFix().then(() => setQualityOpen(false))}
			>
				{t('board.fixLayout')}
			</Button>
			{qualityOpen && (
				<Menu
					triggerRef={qualityTriggerRef}
					title={t('board.layoutIssuesTitle')}
					onClose={() => setQualityOpen(false)}
					style={{ position: 'absolute', top: '100%', left: 0, marginTop: 'var(--space-1)' }}
				>
					<div
						data-testid="board-layout-issue-list"
						style={{
							margin: 'var(--space-0)',
							padding: 'var(--space-0)',
							display: 'flex',
							flexDirection: 'column',
							gap: 'var(--space-2)',
						}}
					>
						{issues.map((issue, index) => {
							const text =
								issue.kind === 'overflow'
									? t('board.layoutIssueOverflow', { widget: titleOf(issue.widgetId) })
									: t('board.layoutIssueOverlap', {
											widget: titleOf(issue.widgetId),
											other: titleOf(issue.otherWidgetId!),
										});
							return (
								<Button
									key={`${issue.kind}-${issue.widgetId}-${issue.otherWidgetId ?? index}`}
									role="menuitem"
									variant="ghost"
									size="sm"
									onClick={() => {
										setQualityOpen(false);
										onSelect(issue.widgetId);
									}}
									style={{
										width: '100%',
										justifyContent: 'space-between',
										textAlign: 'left',
										gap: 'var(--space-2)',
									}}
								>
									<span
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 'var(--space-2)',
											minWidth: 0,
										}}
									>
										<Icon name={issue.kind === 'overflow' ? 'warning' : 'error'} size="sm" />
										<span style={{ flex: 1, font: 'var(--text-xs) var(--font-sans)' }}>{text}</span>
									</span>
									<span style={{ font: 'var(--text-xs) var(--font-sans)' }}>
										{t('board.selectIssue')}
									</span>
								</Button>
							);
						})}
					</div>
				</Menu>
			)}
		</Card>
	);
}
