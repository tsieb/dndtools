import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getContentItemsForActor, type WidgetDataQuerySource } from '@dndtools/core';
import { Button, Callout, Field, Icon, Input, Select, Sheet, Switch } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useViewport } from '../useViewport';
import { useI18n } from '../../i18n';
import { FocusableBuilderPreview } from './BuilderPanes';
import { CATALOG } from './CommandsStep';
import { type BuilderStepId, type WidgetDraft } from './draft';
import {
	QUICK_RECIPES,
	quickAudience,
	quickCommands,
	quickDraft,
	quickQuery,
} from './quickRecipes';
import { QUERY_SOURCE_LABEL } from './vocabulary';

const stack = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } as const;

/** Three questions over the Full builder's exact draft, validation and install lifecycle. */
export function QuickBuilder({
	draft,
	onChange,
	onMore,
	onAdd,
	onClose,
	busy,
	blocked,
	error,
	children,
}: {
	draft: WidgetDraft;
	onChange: (next: Partial<WidgetDraft>) => void;
	onMore: (step: BuilderStepId) => void;
	onAdd: () => void;
	onClose: () => void;
	busy: boolean;
	blocked: boolean;
	error: string | null;
	children: ReactNode;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const viewport = useViewport();
	const [identity] = useState(() => runtime.newId());
	const [recipeId, setRecipeId] = useState<string | null>(null);
	const [panel, setPanel] = useState(0);
	const [noteId, setNoteId] = useState('');
	const headingRef = useRef<HTMLHeadingElement>(null);
	const recipe = QUICK_RECIPES.find((entry) => entry.id === recipeId);
	const notes = getContentItemsForActor(
		runtime.state.content,
		runtime.state.permissions,
		runtime.activeActorId,
	).filter((item) => item.kind === 'note');
	const shared =
		draft.dataQueries.some((query) => query.audience === 'shared') ||
		draft.configFields.some((field) => field.key === 'visibility' && field.default === 'shared');
	useEffect(() => {
		if (panel > 0) headingRef.current?.focus();
	}, [panel]);
	const numbers = Object.fromEntries(
		draft.configFields
			.filter((field) => field.control === 'number')
			.map((field) => [field.key, Number(field.default)]),
	);
	const incomplete =
		blocked ||
		(recipe?.picker === 'counter' &&
			(!Object.values(numbers).every(Number.isFinite) ||
				numbers.min! > numbers.max! ||
				numbers.count! < numbers.min! ||
				numbers.count! > numbers.max!)) ||
		(recipe?.picker === 'note' && !noteId) ||
		(recipe?.picker === 'commands' && draft.commands.length === 0);
	const title = [t('builder.quick.what'), t('builder.quick.show'), t('builder.quick.done')][panel];
	const changeSource = (source: WidgetDataQuerySource) =>
		onChange({
			dataQueries: [
				{
					...quickQuery(source),
					audience: shared ? 'shared' : 'dm',
					...(recipeId === 'stat' ? { options: { limit: 1 } } : {}),
				},
			],
		});
	const setNumber = (key: string, value: number) =>
		onChange({
			configFields: draft.configFields.map((field) =>
				field.key === key ? { ...field, default: value } : field,
			),
		});
	return (
		<Sheet
			open
			side={viewport === 'phone' ? 'bottom' : 'right'}
			size={viewport === 'phone' ? '94dvh' : 560}
			title={t('builder.quick.title')}
			onClose={onClose}
			dismissible={!busy}
			data-testid="quick-builder"
			footer={
				<>
					{panel > 0 && (
						<Button variant="ghost" onClick={() => setPanel(panel - 1)} disabled={busy}>
							{t('common.action.back')}
						</Button>
					)}
					<Button
						variant="ghost"
						disabled={busy}
						onClick={() =>
							onMore(
								panel === 0
									? 'layout'
									: panel === 2
										? 'identity'
										: recipe?.picker === 'commands'
											? 'commands'
											: recipe?.picker === 'counter' || recipe?.picker === 'note'
												? 'config'
												: 'data',
							)
						}
					>
						{t('builder.quick.more')}
					</Button>
					{panel === 1 && <Button onClick={() => setPanel(2)}>{t('common.action.next')}</Button>}
					{panel === 2 && (
						<Button
							variant="primary"
							aria-disabled={busy || incomplete}
							onClick={() => {
								if (!incomplete) onAdd();
							}}
						>
							{t('builder.quick.add')}
						</Button>
					)}
				</>
			}
		>
			<div style={stack}>
				<h2 ref={headingRef} tabIndex={-1}>
					{panel + 1}. {title}
				</h2>
				{panel === 0 && (
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
							gap: 'var(--space-2)',
						}}
					>
						{QUICK_RECIPES.map((entry) => (
							<Button
								key={entry.id}
								variant="secondary"
								onClick={() => {
									onChange(quickDraft(entry.id, identity));
									setRecipeId(entry.id);
									setNoteId('');
									setPanel(1);
								}}
								style={{ minHeight: 'var(--space-16)', whiteSpace: 'normal' }}
							>
								<Icon name={entry.icon} size="lg" />
								{t(entry.label)}
							</Button>
						))}
					</div>
				)}
				{panel === 1 && (
					<>
						{(recipe?.picker === 'characters' || recipe?.picker === 'source') && (
							<Field label={t('builder.quick.which')}>
								<Select
									value={draft.dataQueries[0]?.source ?? 'party'}
									onChange={(event) => changeSource(event.target.value as WidgetDataQuerySource)}
									options={(recipe.picker === 'characters'
										? (['party', 'visible-characters', 'current-combatants'] as const)
										: (['content-objects', 'notes', 'maps', 'screens', 'party'] as const)
									).map((source) => ({ value: source, label: t(QUERY_SOURCE_LABEL[source]) }))}
								/>
							</Field>
						)}
						{recipe?.picker === 'counter' && (
							<fieldset style={stack}>
								<legend>{t('builder.quick.number')}</legend>
								{draft.configFields
									.filter((field) => field.control === 'number')
									.map((field) => (
										<Field key={field.key} label={field.label}>
											<Input
												type="number"
												step={1}
												value={Number(field.default ?? 0)}
												onChange={(event) => setNumber(field.key, Number(event.target.value))}
											/>
										</Field>
									))}
							</fieldset>
						)}
						{recipe?.picker === 'note' && (
							<Field label={t('builder.quick.whichNote')} help={t('builder.quick.noteCopy')}>
								<Select
									value={noteId}
									options={[
										{ value: '', label: t('builder.quick.chooseNote') },
										...notes.map((note) => ({ value: note.id, label: note.title })),
									]}
									onChange={(event) => {
										const note = notes.find((item) => item.id === event.target.value);
										setNoteId(event.target.value);
										onChange({
											configFields: draft.configFields.map((field) =>
												field.key === 'message' ? { ...field, default: note?.body ?? '' } : field,
											),
										});
									}}
								/>
							</Field>
						)}
						{recipe?.picker === 'commands' && (
							<Field label={t('builder.quick.whichButtons')}>
								<Select
									multiple={recipeId !== 'form'}
									value={
										recipeId === 'form'
											? String(
													CATALOG.findIndex(
														(entry) =>
															entry.descriptor(draft.typeId).type === draft.commands[0]?.type,
													),
												)
											: CATALOG.flatMap((entry, index) =>
													draft.commands.some(
														(command) => command.type === entry.descriptor(draft.typeId).type,
													)
														? [String(index)]
														: [],
												)
									}
									options={CATALOG.map((entry, index) => ({ value: index, label: t(entry.label) }))}
									onChange={(event) =>
										onChange(
											quickCommands(
												draft.typeId,
												Array.from(event.target.selectedOptions, (option) => Number(option.value)),
											),
										)
									}
								/>
							</Field>
						)}
					</>
				)}
				{panel === 2 && (
					<>
						<Field label={t('builder.quick.name')}>
							<Input
								value={draft.name}
								onChange={(event) => onChange({ name: event.target.value })}
							/>
						</Field>
						<Switch
							label={t('builder.quick.players')}
							checked={shared}
							onChange={(value) => onChange(quickAudience(draft, value))}
						/>
					</>
				)}
				{panel > 0 && <FocusableBuilderPreview draft={draft} />}
				{panel === 2 && incomplete && (
					<Callout tone="warning">{t('builder.quick.invalid')}</Callout>
				)}
				{error && (
					<Callout tone="error" role="alert">
						{error}
					</Callout>
				)}
			</div>
			{children}
		</Sheet>
	);
}
