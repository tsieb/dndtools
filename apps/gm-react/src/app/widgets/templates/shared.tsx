import type { ReactNode } from 'react';
import type { WidgetDefinition } from '@dndtools/core';
import { Icon } from '../../../ds';
import type { BoardWidget } from '../../board-helpers';
import type { WidgetCommandHandler } from '../../widget-bodies';
import { WITHHELD_COPY, type WidgetQueryResult, type WidgetTemplateData } from '../dataEnvironment';

/**
 * Shared chrome for the eight template renderers (RC-WID-1.2).
 *
 * The templates are deliberately PURE: they take the already-resolved data rather than reaching for
 * the runtime, so each one renders in a unit test from a fixture package with no DOM store, no
 * IndexedDB and no provider. `templates/index.tsx` is the single place that does the runtime lookup
 * and hands the result down.
 */

export interface WidgetTemplateProps {
	widget: BoardWidget;
	/** The widget's definition — where declared commands and config fields come from. */
	definition: WidgetDefinition | null;
	/** Everything the definition's `dataQueries`/`computedFields` resolved to for this viewer. */
	data: WidgetTemplateData;
	/** Dispatches a widget-declared command; absent while the layout is being edited. */
	onCommand?: WidgetCommandHandler;
}

/** The frame body every template fills: a column that scrolls rather than escaping its widget. */
export function TemplateShell({ children, testId }: { children: ReactNode; testId: string }) {
	return (
		<div
			data-testid={testId}
			style={{
				height: '100%',
				minHeight: 0,
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				overflow: 'auto',
			}}
		>
			{children}
		</div>
	);
}

/** A muted supporting line: the empty state, the withheld notice, a header. */
export function TemplateNote({ children }: { children: ReactNode }) {
	return (
		<span
			style={{
				font: 'var(--text-xs)/1.4 var(--font-sans)',
				color: 'var(--color-text-tertiary)',
			}}
		>
			{children}
		</span>
	);
}

/**
 * What to say when a query produced no rows — and nothing when it produced some. A query withheld
 * from this viewer says so; an empty one says it is empty. Never the same sentence, because "nothing
 * yet" for data that exists but is DM-only would be a lie.
 */
export function emptyNoticeOf(query: WidgetQueryResult | null): string | null {
	if (!query) return 'This widget has no data source yet.';
	if (query.withheld) return WITHHELD_COPY[query.withheld];
	if (query.rows.length === 0) return query.emptyLabel;
	return null;
}

/** A withheld query gets the padlock; an empty one is just quiet. */
export function TemplateEmpty({ query }: { query: WidgetQueryResult | null }) {
	const notice = emptyNoticeOf(query);
	if (!notice) return null;
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 'var(--space-1)',
				font: 'var(--text-xs)/1.4 var(--font-sans)',
				color: 'var(--color-text-tertiary)',
			}}
		>
			{query?.withheld ? <Icon name="dm-only" size={12} /> : null}
			{notice}
		</span>
	);
}

/** The computed fields as one compact readout line. Omitted entirely when none are declared. */
export function ComputedFields({ data }: { data: WidgetTemplateData }) {
	if (data.computed.length === 0) return null;
	return (
		<dl
			style={{
				margin: 0,
				display: 'flex',
				flexWrap: 'wrap',
				gap: 'var(--space-1) var(--space-3)',
				flex: '0 0 auto',
			}}
		>
			{data.computed.map((field) => (
				<div key={field.id} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
					<dt
						style={{
							font: '600 var(--text-2xs) var(--font-sans)',
							letterSpacing: 'var(--tracking-wider)',
							textTransform: 'uppercase',
							color: 'var(--color-text-tertiary)',
						}}
					>
						{field.label}
					</dt>
					<dd
						style={{
							margin: 0,
							font: 'var(--text-xs) var(--font-mono)',
							color: 'var(--color-text-primary)',
						}}
					>
						{field.display}
					</dd>
				</div>
			))}
		</dl>
	);
}

/** Read a configured value, falling back to the declared field default (the bodies' own rule). */
export function cfg<T = unknown>(widget: BoardWidget, key: string): T | undefined {
	const raw = widget.configuration[key];
	if (raw !== undefined && raw !== null && raw !== '') return raw as T;
	return widget.configFields.find((field) => field.key === key)?.default as T | undefined;
}

/** The first configured value among several candidate keys — packages name the same thing differently. */
export function cfgText(widget: BoardWidget, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = cfg<unknown>(widget, key);
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
}
