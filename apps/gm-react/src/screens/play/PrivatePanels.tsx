import type { ReactNode } from 'react';
import { Badge, Icon } from '../../ds';
import { T } from '../../app/screen-kit';

/** The "only you" heading plus the safety line every private panel sits under. */
export function PrivatePanels({
	heading,
	sub,
	children,
}: {
	heading: string;
	sub: string;
	children: ReactNode;
}) {
	return (
		<section
			data-testid="private-journal"
			style={{ marginTop: T.space.six, display: 'grid', gap: T.space.three }}
			aria-label={heading}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: T.space.two }}>
				<Icon name="lock" size={16} color={T.ter} />
				<h2 style={{ margin: T.space.zero, font: `600 17px ${T.sans}`, color: T.ink }}>
					{heading}
				</h2>
			</div>
			<div
				style={{
					font: `12.5px/1.5 ${T.sans}`,
					color: T.sub,
					marginTop: `calc(-1 * ${T.space.oneHalf})`,
				}}
			>
				{sub}
			</div>
			{children}
		</section>
	);
}

/** The one list shape all three private collections render. */
export function RecordList({
	rows,
	empty,
}: {
	empty: string;
	rows: {
		id: string;
		title: string;
		body: string;
		testId: string;
		badge?: string;
		badgeStatus?: 'success' | 'neutral';
		actions: ReactNode;
	}[];
}) {
	if (rows.length === 0) {
		return (
			<div style={{ marginTop: T.space.three, font: `12.5px ${T.sans}`, color: T.ter }}>
				{empty}
			</div>
		);
	}
	return (
		<div style={{ marginTop: T.space.three, display: 'flex', flexDirection: 'column' }}>
			{rows.map((row) => (
				<div
					key={row.id}
					data-testid={row.testId}
					style={{
						display: 'flex',
						alignItems: 'flex-start',
						gap: T.space.two,
						padding: `${T.space.two} ${T.space.zero}`,
						// Every row keeps a top rule, including the first: it also separates the list from
						// the draft form above it.
						borderTop: `1px solid ${T.bd}`,
					}}
				>
					<div style={{ minWidth: 0, flex: 1 }}>
						<div
							style={{ display: 'flex', alignItems: 'center', gap: T.space.two, flexWrap: 'wrap' }}
						>
							<span style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{row.title}</span>
							{row.badge && <Badge status={row.badgeStatus ?? 'neutral'}>{row.badge}</Badge>}
						</div>
						{row.body && (
							<div style={{ marginTop: T.space.one, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
								{row.body}
							</div>
						)}
					</div>
					<span style={{ flex: '0 0 auto' }}>{row.actions}</span>
				</div>
			))}
		</div>
	);
}
