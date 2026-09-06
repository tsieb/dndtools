import { useEffect, useState } from 'react';
import { Field, Input } from '../../ds';
import { T } from '../screen-kit';
import { issueText, issuesForPath, type SystemDraft, type SystemDraftIssue } from './draft';
import type { MessageKey, MessageValues } from '../../i18n';

/** The catalog lookup every step threads down, so no step file renders English of its own. */
export type Translate = (key: MessageKey, values?: MessageValues) => string;

/** What every step of the system builder receives. */
export interface SystemStepProps {
	draft: SystemDraft;
	patch: (next: Partial<SystemDraft>) => void;
	/** Only the issues belonging to this step; each row looks up its own by path. */
	issues: SystemDraftIssue[];
	t: Translate;
}

/** A labelled text field wired to the draft, with the schema's own message under it when it fails. */
export function TextField({
	label,
	help,
	value,
	path,
	issues,
	t,
	onChange,
	maxLength = 200,
	placeholder,
}: {
	label: string;
	help?: string;
	value: string;
	path: string;
	issues: readonly SystemDraftIssue[];
	t: Translate;
	onChange: (next: string) => void;
	maxLength?: number;
	placeholder?: string;
}) {
	return (
		<Field label={label} help={help} error={issuesForPath(issues, path, t)}>
			<Input
				value={value}
				maxLength={maxLength}
				placeholder={placeholder}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
			/>
		</Field>
	);
}

/**
 * A number field that keeps `null` reachable: a system without a level cap, without a crit range or
 * without a stack limit has to be authorable, and an empty box is how the DM says so.
 */
export function NullableNumberField({
	label,
	help,
	value,
	path,
	issues,
	t,
	onChange,
	min = 1,
	max = 1000,
}: {
	label: string;
	help?: string;
	value: number | null;
	path: string;
	issues: readonly SystemDraftIssue[];
	t: Translate;
	onChange: (next: number | null) => void;
	min?: number;
	max?: number;
}) {
	return (
		<Field label={label} help={help} error={issuesForPath(issues, path, t)}>
			<Input
				type="number"
				min={min}
				max={max}
				value={value === null ? '' : String(value)}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
					const raw = e.target.value.trim();
					onChange(raw === '' ? null : Number(raw));
				}}
			/>
		</Field>
	);
}

/**
 * A comma-separated list edited as text. The draft holds an array, so a naive controlled field
 * would delete the comma the moment it was typed; this one keeps the raw text while the field has
 * focus and commits the parsed list on blur.
 */
export function CommaListField({
	label,
	help,
	value,
	path,
	issues,
	t,
	onCommit,
}: {
	label: string;
	help?: string;
	value: readonly string[];
	path: string;
	issues: readonly SystemDraftIssue[];
	t: Translate;
	onCommit: (next: string[]) => void;
}) {
	const joined = value.join(', ');
	const [text, setText] = useState(joined);
	const [editing, setEditing] = useState(false);
	useEffect(() => {
		if (!editing) setText(joined);
	}, [joined, editing]);
	const commit = () => {
		setEditing(false);
		onCommit(
			text
				.split(',')
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0),
		);
	};
	return (
		<Field label={label} help={help} error={issuesForPath(issues, path, t)}>
			<Input
				value={text}
				onFocus={() => setEditing(true)}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
				onBlur={commit}
				onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
					if (e.key === 'Enter') commit();
				}}
			/>
		</Field>
	);
}

/** The issues a step raised that no single field claimed, so nothing is ever silently swallowed. */
export function StepIssues({
	issues,
	claimed,
	t,
}: {
	issues: readonly SystemDraftIssue[];
	claimed: readonly string[];
	t: Translate;
}) {
	const orphans = issues.filter((issue) => !claimed.includes(issue.path));
	if (orphans.length === 0) return null;
	return (
		<ul
			role="status"
			style={{
				margin: 0,
				padding: '10px 12px 10px 28px',
				borderRadius: 9,
				border: `1px solid ${T.bd}`,
				background: T.sunken,
				font: `12px/1.55 ${T.sans}`,
				color: T.sub,
			}}
		>
			{orphans.map((issue) => (
				<li key={`${issue.path}:${issue.message}`}>
					<code style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{issue.path}</code> —{' '}
					{issueText(issue, t)}
				</li>
			))}
		</ul>
	);
}
