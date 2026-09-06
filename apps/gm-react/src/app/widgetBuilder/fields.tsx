import type { ReactNode } from 'react';
import { Button, IconButton } from '../../ds';
import { T } from '../screen-kit';
import type { DraftIssue, WidgetDraft } from './draft';
import type { MessageKey, MessageValues } from '../../i18n';

/** The catalog lookup the steps thread down, so this module renders no English of its own. */
export type Translate = (key: MessageKey, values?: MessageValues) => string;

/**
 * Shared form furniture for the widget builder's steps (RC-WID-2.1).
 *
 * Every step is a stack of `StepSection`s, and every repeating declaration (a data query, a config
 * field, a command, a style token) is a `RowList`. Keeping the chrome here is what lets each step
 * file stay about its own vocabulary, and it means every list is added to and removed from with the
 * same two real buttons — so every pointer action already has its keyboard equivalent.
 */

export function StepHeader({ title, help }: { title: string; help: string }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
			<h2 style={{ margin: 0, font: `600 15px ${T.disp}`, color: T.ink }}>{title}</h2>
			<p style={{ margin: 0, font: `12.5px/1.55 ${T.sans}`, color: T.ter }}>{help}</p>
		</div>
	);
}

export function StepSection({
	title,
	help,
	children,
}: {
	title: string;
	help?: string;
	children: ReactNode;
}) {
	return (
		<section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
				<span style={{ font: `600 12px ${T.sans}`, color: T.sub }}>{title}</span>
				{help && <span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>{help}</span>}
			</div>
			{children}
		</section>
	);
}

/** A two-column grid that collapses to one column in the narrow rail. */
export function FieldGrid({ children, columns = 2 }: { children: ReactNode; columns?: number }) {
	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: `repeat(auto-fit, minmax(${columns > 1 ? 150 : 240}px, 1fr))`,
				gap: 10,
			}}
		>
			{children}
		</div>
	);
}

/** A group of checkbox-like toggles rendered as a real fieldset, so the group has one name. */
export function ToggleGroup({ legend, children }: { legend: string; children: ReactNode }) {
	return (
		<fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
			<legend style={{ font: `600 12px ${T.sans}`, color: T.sub, padding: 0, marginBottom: 8 }}>
				{legend}
			</legend>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{children}</div>
		</fieldset>
	);
}

export function RowCard({
	title,
	onRemove,
	removeLabel,
	children,
}: {
	title: string;
	onRemove: () => void;
	removeLabel: string;
	children: ReactNode;
}) {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 10,
				padding: 11,
				border: `1px solid ${T.bd}`,
				borderRadius: 10,
				background: T.surf,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<span style={{ flex: 1, minWidth: 0, font: `600 12.5px ${T.sans}`, color: T.ink }}>
					{title}
				</span>
				<IconButton
					icon="delete"
					label={removeLabel}
					variant="ghost"
					size="sm"
					onClick={onRemove}
				/>
			</div>
			{children}
		</div>
	);
}

export function RowList({
	empty,
	addLabel,
	onAdd,
	children,
}: {
	empty: string;
	addLabel: string;
	onAdd: () => void;
	children: ReactNode;
}) {
	const items = Array.isArray(children) ? children : [children];
	const isEmpty = items.filter(Boolean).length === 0;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
			{isEmpty ? <div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>{empty}</div> : children}
			<div>
				<Button variant="secondary" size="sm" icon="add" onClick={onAdd}>
					{addLabel}
				</Button>
			</div>
		</div>
	);
}

/** Swap one entry of a list without mutating it — the shape every step's edit handlers take. */
export function replaceAt<Item>(items: Item[], index: number, next: Item): Item[] {
	return items.map((item, i) => (i === index ? next : item));
}

export function removeAt<Item>(items: Item[], index: number): Item[] {
	return items.filter((_, i) => i !== index);
}

/** What every step receives: the draft, a patch function, and the issues raised against it. */
export interface StepProps {
	draft: WidgetDraft;
	patch: (next: Partial<WidgetDraft>) => void;
	issues: DraftIssue[];
}

/** The message raised against one field, rendered for `Field`'s `error` slot. */
export function issueFor(issues: DraftIssue[], field: string, t: Translate): string | undefined {
	const issue = issues.find((entry) => entry.field === field);
	return issue ? t(issue.message, issue.values) : undefined;
}
