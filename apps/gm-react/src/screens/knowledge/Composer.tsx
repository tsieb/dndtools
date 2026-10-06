import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listContentTemplates, resolveContentTemplate } from '@dndtools/core';
import { Button, Card, Chip, Field, Input } from '../../ds';
import { T } from '../../app/screen-kit';
import { matchesShortcut } from '../../app/shortcuts/registry';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';
import { META } from './shared';
import { templateOptionLabel, useCreateFromTemplate } from './Templates';

/** The composer's "Start from" value for an empty note; every other value is a template id. */
const BLANK = '';

/**
 * The New note composer. RC-KNW-6.4 — a "Start from" chip row (Blank first, then the built-in and the
 * DM's own templates, from the same catalog the Templates panel reads) so a session recap is offered
 * at the moment of creation rather than discovered later. Blank asks for a title; a template asks for
 * its REQUIRED variables inline (optional ones take their declared defaults) and creates through the
 * same `content.create-from-template` path as the Templates panel, so the core still renders,
 * validates and refuses.
 */
export function Composer({
	onCreate,
	onCreated,
	onCancel,
	busy,
}: {
	onCreate: (title: string) => void;
	/** A template created a note; the id is the core's, read from its `content.item-changed` event. */
	onCreated: (itemId: string) => void;
	onCancel: () => void;
	busy: boolean;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [title, setTitle] = useState('');
	const [startFrom, setStartFrom] = useState(BLANK);
	const [values, setValues] = useState<Record<string, string>>({});
	const fromTemplate = useCreateFromTemplate();
	const userTemplates = runtime.state.content.userTemplates;
	const catalog = useMemo(() => listContentTemplates(userTemplates), [userTemplates]);
	const template = startFrom === BLANK ? null : resolveContentTemplate(userTemplates, startFrom);
	const required = (template?.variables ?? []).filter((variable) => variable.required);
	const working = busy || fromTemplate.busy;
	const ready = template
		? required.every((variable) => (values[variable.name] ?? '').trim() !== '')
		: title.trim() !== '';

	function submit() {
		// The Create button is gated on `working`; Enter was not, so holding it (or a fast double
		// press) fired overlapping creates and produced duplicate notes.
		if (working || !ready) return;
		if (!template) {
			onCreate(title.trim());
			return;
		}
		void fromTemplate.create(template.id, values).then((itemId) => {
			if (itemId) onCreated(itemId);
		});
	}

	return (
		<Card
			elevation="flat"
			padding="md"
			data-testid="knowledge-composer"
			style={{ marginBottom: T.space.four, display: 'grid', gap: T.space.three }}
		>
			<div
				role="group"
				aria-labelledby="knowledge-composer-start-from"
				style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: T.space.oneHalf }}
			>
				<span id="knowledge-composer-start-from" style={{ ...META, marginInlineEnd: T.space.one }}>
					{t('knowledge.composer.startFrom')}
				</span>
				{[{ id: BLANK, label: t('knowledge.composer.blank') }]
					.concat(catalog.map((row) => ({ id: row.id, label: templateOptionLabel(row, t) })))
					.map((option) => (
						<Chip
							key={option.id || 'blank'}
							tone={startFrom === option.id ? 'accent' : 'neutral'}
							selected={startFrom === option.id}
							data-testid={`composer-start-${option.id || 'blank'}`}
							onClick={() => {
								setStartFrom(option.id);
								setValues({});
							}}
						>
							{option.label}
						</Chip>
					))}
			</div>
			<div
				// Remounted per choice so the first field of the new choice takes focus.
				key={startFrom || 'blank'}
				style={{ display: 'flex', flexWrap: 'wrap', gap: T.space.three, alignItems: 'flex-end' }}
			>
				{template ? (
					required.map((variable, index) => (
						<Field
							key={variable.name}
							label={variable.label}
							required
							style={{ flex: '1 1 12rem', minWidth: 0 }}
						>
							<Input
								value={values[variable.name] ?? ''}
								autoFocus={index === 0}
								data-testid={`composer-field-${variable.name}`}
								onChange={(e: { target: { value: string } }) =>
									setValues((prev) => ({ ...prev, [variable.name]: e.target.value }))
								}
								onKeyDown={(e: { key: string }) => {
									if (e.key === 'Enter') submit();
								}}
							/>
						</Field>
					))
				) : (
					<Input
						value={title}
						autoFocus
						aria-label={t('knowledge.newNoteTitle')}
						onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
						placeholder={t('knowledge.newNoteTitlePlaceholder')}
						style={{ flex: '1 1 12rem', minWidth: 0 }}
						onKeyDown={(e: { key: string }) => {
							if (e.key === 'Enter') submit();
						}}
					/>
				)}
				<div style={{ display: 'flex', gap: T.space.three }}>
					<Button
						variant="primary"
						size="sm"
						icon="check"
						disabled={working || !ready}
						data-testid="composer-create"
						onClick={submit}
					>
						{t('common.action.create')}
					</Button>
					<Button variant="ghost" size="sm" disabled={working} onClick={onCancel}>
						{t('common.action.cancel')}
					</Button>
				</div>
			</div>
		</Card>
	);
}

/**
 * RC-KNW-6.4 — Ctrl/⌘+N on Notes opens the composer, through the `knowledge.newNote` declaration in
 * the shortcut registry (so the `?` overlay prints the key this fires on). It hands the same
 * `state.create` intent the palette's New note row does, so it also works from an open note. Off for
 * a reader who cannot author, while a field has focus, and under any modal, like the shell's keys.
 */
export function useNewNoteShortcut(enabled: boolean) {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	useEffect(() => {
		if (!enabled) return;
		function onKey(e: KeyboardEvent) {
			const el = e.target as HTMLElement | null;
			const typing =
				!!el &&
				(el.tagName === 'INPUT' ||
					el.tagName === 'TEXTAREA' ||
					el.tagName === 'SELECT' ||
					el.isContentEditable);
			if (!matchesShortcut('knowledge.newNote', e, { typing })) return;
			if (document.querySelector('[data-fullscreen-overlay], [aria-modal="true"]')) return;
			e.preventDefault();
			// Replace on the list itself: the intent is consumed on arrival, and a pushed copy of the
			// same list would leave Back a step that goes nowhere.
			navigate('/knowledge', { state: { create: true }, replace: pathname === '/knowledge' });
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [enabled, navigate, pathname]);
}
