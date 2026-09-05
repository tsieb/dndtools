import { Badge, StatusDot } from '../../../ds';
import {
	ComputedFields,
	TemplateEmpty,
	TemplateNote,
	TemplateShell,
	type WidgetTemplateProps,
} from './shared';

/**
 * `status-list` — a compact roster where each row's STATE is the point (RC-WID-1.2): who is up, what
 * is shared, what is hidden. Every state is carried by a shape AND a word, never by colour alone
 * (A11Y-011): the active row gets a live dot plus the word "Now", and a row's tag is a badge with
 * its own icon.
 */
export function StatusListTemplate({ data }: WidgetTemplateProps) {
	const query = data.primary;
	const rows = query?.rows ?? [];

	return (
		<TemplateShell testId="widget-template-status-list">
			{query?.header ? <TemplateNote>{query.header}</TemplateNote> : null}
			<ComputedFields data={data} />
			{rows.length === 0 ? (
				<TemplateEmpty query={query} />
			) : (
				<ul
					style={{
						margin: 0,
						padding: 0,
						listStyle: 'none',
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-1)',
					}}
				>
					{rows.map((row) => (
						<li
							key={row.id}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								padding: '2px 0',
								minWidth: 0,
							}}
						>
							<StatusDot status={row.active ? 'live' : 'idle'} />
							<span
								style={{
									flex: 1,
									minWidth: 0,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									font: `${row.active ? '600' : '400'} var(--text-xs) var(--font-sans)`,
									color: 'var(--color-text-primary)',
								}}
							>
								{row.primary}
								{row.secondary ? (
									<span style={{ color: 'var(--color-text-tertiary)' }}> · {row.secondary}</span>
								) : null}
							</span>
							{row.active ? <Badge status="success">Now</Badge> : null}
							{row.meta ? <Badge status="neutral">{row.meta}</Badge> : null}
						</li>
					))}
				</ul>
			)}
		</TemplateShell>
	);
}
