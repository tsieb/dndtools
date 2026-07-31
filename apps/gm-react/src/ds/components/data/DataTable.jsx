import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * DataTable — the tabular primitive for vault lists, players, audit logs, prep checklists. Header
 * row is an uppercase tracked eyebrow; numeric columns set `mono align="right"` for tabular
 * alignment; rows zebra-stripe on the alt surface and wash gold on hover. Sortable headers show a
 * direction caret (wire `onSort`). Keep it flat inside a Card — the Card provides the elevation.
 */
export function DataTable({
	columns = [],
	rows = [],
	rowKey,
	sort,
	onSort,
	onRowClick,
	zebra = true,
	dense = false,
	empty,
	ariaLabel,
	style,
	...rest
}) {
	const cellPad = dense ? 'var(--space-1-5) var(--space-2)' : 'var(--space-2) var(--space-3)';
	// Cells default to `nowrap`, so a wide table (Settings → Active grants is 6 columns incl. a button)
	// blows past a 393px phone. The scroll port belongs on the primitive, not on every call site —
	// `maxWidth:100%` keeps it from widening its own flex/grid parent.
	//
	// A scroll port that only responds to a pointer strands keyboard-only users at the first visible
	// column (axe `scrollable-region-focusable`, WCAG 2.1.1): on a 393px phone Settings → Active grants
	// is six columns wide and its Revoke button lives past the right edge, so there was no way to reach
	// it without a mouse. `tabIndex={0}` makes the port arrow-scrollable; `role="group"` + a name is
	// what stops it announcing as an unlabelled focus stop.
	return (
		<div
			tabIndex={0}
			role={ariaLabel ? 'group' : undefined}
			aria-label={ariaLabel}
			style={{ maxWidth: '100%', overflowX: 'auto' }}
		>
			<table
				style={{
					width: '100%',
					borderCollapse: 'collapse',
					fontFamily: 'var(--font-sans)',
					...style,
				}}
				{...rest}
			>
				<thead>
					<tr>
						{columns.map((c) => {
							const active = sort && sort.key === c.key;
							return (
								<th
									key={c.key}
									scope="col"
									style={{
										textAlign: c.align || 'left',
										padding: cellPad,
										width: c.width,
										borderBottom: '1px solid var(--color-border-strong)',
										fontFamily: 'var(--font-sans)',
										fontSize: 'var(--text-2xs)',
										fontWeight: 'var(--font-weight-semibold)',
										letterSpacing: 'var(--tracking-wider)',
										textTransform: 'uppercase',
										color: 'var(--color-text-tertiary)',
										whiteSpace: 'nowrap',
										cursor: c.sortable ? 'pointer' : 'default',
										userSelect: 'none',
									}}
									onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
								>
									<span
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 4,
											flexDirection: c.align === 'right' ? 'row-reverse' : 'row',
										}}
									>
										{c.header}
										{c.sortable && (
											<Icon
												name={
													active
														? sort.dir === 'desc'
															? 'chevron-down'
															: 'chevron-up'
														: 'chevron-down'
												}
												size={12}
												style={{ opacity: active ? 1 : 0.35 }}
											/>
										)}
									</span>
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 && (
						<tr>
							<td
								colSpan={columns.length}
								style={{
									padding: 'var(--space-6)',
									textAlign: 'center',
									color: 'var(--color-text-tertiary)',
									fontSize: 'var(--text-sm)',
								}}
							>
								{empty || 'Nothing here yet.'}
							</td>
						</tr>
					)}
					{rows.map((row, i) => (
						<tr
							key={rowKey ? rowKey(row, i) : i}
							// The gold hover wash is a CLICK affordance, so it is wired only when a row
							// activation handler exists. Every live table (Characters' roster, Settings'
							// active grants) is read-only, and painting a pressable highlight under a
							// pointer that does nothing is a promise the table cannot keep.
							style={{
								background: zebra && i % 2 === 1 ? 'var(--color-surface-alt)' : 'transparent',
								transition: 'background var(--duration-fast) var(--easing-standard)',
								cursor: onRowClick ? 'pointer' : undefined,
							}}
							onClick={onRowClick ? () => onRowClick(row, i) : undefined}
							onMouseEnter={
								onRowClick
									? (e) => {
											e.currentTarget.style.background = 'var(--color-interactive-hover)';
										}
									: undefined
							}
							onMouseLeave={
								onRowClick
									? (e) => {
											e.currentTarget.style.background =
												zebra && i % 2 === 1 ? 'var(--color-surface-alt)' : 'transparent';
										}
									: undefined
							}
						>
							{columns.map((c) => (
								<td
									key={c.key}
									style={{
										textAlign: c.align || 'left',
										padding: cellPad,
										borderBottom: '1px solid var(--color-border)',
										fontFamily: c.mono ? 'var(--font-mono)' : 'var(--font-sans)',
										fontSize: 'var(--text-sm)',
										fontWeight: c.strong
											? 'var(--font-weight-semibold)'
											: 'var(--font-weight-regular)',
										color: c.strong ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
										whiteSpace: c.wrap ? 'normal' : 'nowrap',
									}}
								>
									{c.render ? c.render(row[c.key], row, i) : row[c.key]}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
