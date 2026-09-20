/**
 * CharBuilder import review diff — the fields where the reviewed file differs from the roster
 * character of the same name (RC-CHR-5.2; the comparison itself is `./importDiff`).
 */
import { useId } from 'react';
import type { Character } from '@dndtools/core';
import { T, eb } from '../screen-kit';
import { KIND_LABEL, type CharKind } from './data';
import {
	findRosterMatch,
	importDiff,
	type ImportDiffField,
	type ImportDiffRow,
} from './importDiff';
import type { ImportPlan } from '../charImport/ddbJson';
import { useI18n, type MessageKey } from '../../i18n';

const FIELD_LABEL: Partial<Record<ImportDiffField, MessageKey>> = {
	kind: 'charBuilder.kind',
	hp: 'charBuilder.diff.hp',
	maxHp: 'charBuilder.diff.maxHp',
	ac: 'charBuilder.diff.ac',
	level: 'charBuilder.level',
	class: 'charBuilder.class',
	race: 'charBuilder.ancestry',
	background: 'charBuilder.background',
	alignment: 'charBuilder.alignment',
	attacks: 'charBuilder.diff.attacks',
	spells: 'charBuilder.diff.spells',
	skills: 'charBuilder.diff.skills',
	saves: 'charBuilder.diff.saves',
};

const cell: React.CSSProperties = {
	textAlign: 'left',
	verticalAlign: 'top',
	padding: `${T.space.one} ${T.space.two} ${T.space.one} ${T.space.zero}`,
	borderTop: `1px solid ${T.bd}`,
	overflowWrap: 'anywhere',
};

export function ImportDiff({ plan, roster }: { plan: ImportPlan; roster: readonly Character[] }) {
	const { t } = useI18n();
	const titleId = useId();
	const match = findRosterMatch(plan, roster);
	if (!match) {
		return (
			<div style={{ font: `var(--text-sm)/1.5 ${T.sans}`, color: T.ter }}>
				{t('charBuilder.diffNew', { name: plan.name })}
			</div>
		);
	}
	const rows = importDiff(plan, match);
	const changed = rows.filter((row) => row.changed);
	const label = (field: ImportDiffField) => {
		const key = FIELD_LABEL[field];
		return key ? t(key) : field.toUpperCase();
	};
	const value = (row: ImportDiffRow, v: string) =>
		row.field === 'kind' && v in KIND_LABEL ? t(KIND_LABEL[v as CharKind]) : v;
	return (
		<section
			aria-labelledby={titleId}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: T.space.two,
				padding: T.space.four,
				borderRadius: T.radius.lg,
				border: `1px solid ${T.accBd}`,
				background: T.surf,
			}}
		>
			<div id={titleId} style={{ ...eb, color: T.acc }}>
				{t('charBuilder.diffTitle')}
			</div>
			<div style={{ font: `var(--text-sm)/1.5 ${T.sans}`, color: T.sub }}>
				{t('charBuilder.diffMatch', { name: match.name })}
			</div>
			{changed.length === 0 ? (
				<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ok }}>
					{t('charBuilder.diffIdentical')}
				</div>
			) : (
				<table
					style={{
						width: '100%',
						borderCollapse: 'collapse',
						tableLayout: 'fixed',
						font: `var(--text-xs)/1.45 ${T.sans}`,
						color: T.sub,
					}}
				>
					<caption
						style={{
							textAlign: 'left',
							paddingBottom: T.space.one,
							font: `600 var(--text-xs) ${T.sans}`,
						}}
					>
						{t('charBuilder.diffChanged', { count: changed.length })}
					</caption>
					<thead>
						<tr>
							{(
								['charBuilder.diffField', 'charBuilder.diffRoster', 'charBuilder.diffFile'] as const
							).map((key) => (
								<th key={key} scope="col" style={{ ...cell, ...eb, borderTop: 'none' }}>
									{t(key)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{changed.map((row) => (
							<tr key={row.field}>
								<th scope="row" style={{ ...cell, fontWeight: 600, color: T.ink }}>
									{label(row.field)}
								</th>
								<td style={{ ...cell, color: T.ter }}>{value(row, row.roster)}</td>
								<td style={{ ...cell, color: T.ink }}>{value(row, row.file)}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			{changed.length > 0 && changed.length < rows.length && (
				<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
					{t('charBuilder.diffSame', { count: rows.length - changed.length })}
				</div>
			)}
		</section>
	);
}
