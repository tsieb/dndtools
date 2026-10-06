import { useRef, useState } from 'react';
import {
	CHARACTER_ENTITY_TYPE,
	CONTENT_ITEM_ENTITY_TYPE,
	findWidgetDefinition,
	getContentItemsForActor,
	listCharactersForActor,
	listMapsForActor,
	parseDiceExpression,
	type CoreStateSlice,
	type WidgetBindingDefinition,
	type WidgetConfigField,
} from '@dndtools/core';
import { Button, Callout, Dialog, Field, Input, Select, Textarea, Toaster } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { FieldControl } from '../../screens/sceneEditor/fields';
import type { BoardWidget } from '../board-helpers';

/**
 * RC-CAN-2.4 — the two tile-menu items that need more room than a menu row: Bind… (which entity the
 * tile shows) and, off the scene editor, Configure… (the definition's declared settings; the scene
 * editor opens its Inspector instead). Both write `scene.configure-widget`, the command the Map tile's
 * own picker and the Inspector already use, so the core stays the one judge of who may bind what.
 */

/** Tile-dialog copy — English-only for now, like the tile menu's. */
const TEXT = {
	bindTitle: (title: string) => `Bind ${title}`,
	bindHelp: (noun: string) => `Choose the ${noun} this tile shows.`,
	nothing: (noun: string) => `There is no ${noun} you can bind yet.`,
	bound: (title: string, name: string) => `Bound ${title} to ${name}`,
	unbound: (title: string) => `${title} is no longer bound`,
	none: 'Nothing',
	bind: 'Bind',
	cancel: 'Cancel',
	configureTitle: (title: string) => `Configure ${title}`,
	save: 'Save',
	saved: (title: string) => `Saved ${title} settings`,
	keepEditing: 'Keep editing',
	discard: 'Discard changes',
	unsavedTitle: 'You have unsaved changes',
	unsavedBody: (labels: string[]) =>
		`${labels.join(', ')} changed. Discard the changes, or keep editing to save them.`,
	diceExample: 'Separate formulas with commas, for example 1d20+5, 2d6. Empty rolls a d20.',
	notAFormula: (formula: string) =>
		`“${formula}” is not a dice formula. Write dice like 1d20+5 or 2d6.`,
	titleExample: (title: string) =>
		`A short name, for example “${title} (boss room)”. Empty shows “${title}”.`,
	headingExample: 'One line shown at the top of the tile.',
	bodyExample: 'Plain text. Ctrl+Enter saves.',
	textExample: 'One line of text.',
	numberExample: (range: string, def: unknown) =>
		def === undefined ? `A number ${range}.` : `A number ${range}, for example ${String(def)}.`,
	tooLong: (max: number, length: number) => `Keep it to ${max} characters (now ${length}).`,
	notANumber: 'Enter a number.',
	outOfRange: (range: string) => `Enter a number ${range}.`,
	wholeNumber: 'Enter a whole number.',
	offStep: (step: number) => `Use steps of ${step}.`,
};

export function sceneInstance(state: CoreStateSlice, widgetId: string) {
	for (const scene of Object.values(state.scenes.scenes)) {
		const instance = scene.widgets.find((candidate) => candidate.id === widgetId);
		if (instance) return { scene, instance };
	}
	return null;
}

/** The definition's binding slot. An instance holds one binding, so the first declared slot is it. */
export function bindingSlot(
	widgets: CoreStateSlice['widgets'],
	type: string,
): { slot: WidgetBindingDefinition; optional: boolean } | null {
	const definition = findWidgetDefinition(widgets, type);
	const required = definition?.requiredBindings[0];
	if (required) return { slot: required, optional: false };
	const optional = definition?.optionalBindings[0];
	return optional ? { slot: optional, optional: true } : null;
}

/** What a settings dialog lists: visibility has its own submenu, so it is never offered twice. */
export const settingsFields = (w: Pick<BoardWidget, 'configFields'>) =>
	w.configFields.filter((field) => field.key !== 'visibility');

type Named = { id: string; label: string };

/** Actor-filtered reads only, like the header's bound-name lookup: the picker never offers a record
 *  the viewer may not read. An entity type with no read here offers nothing. */
const READERS: Record<string, (state: CoreStateSlice, actorId: string) => Named[]> = {
	map: (s, a) =>
		listMapsForActor(s.maps, s.permissions, a).map((map) => ({ id: map.id, label: map.name })),
	[CHARACTER_ENTITY_TYPE]: (s, a) =>
		listCharactersForActor(s.characters, s.permissions, a).map((c) => ({
			id: c.id,
			label: c.name,
		})),
	[CONTENT_ITEM_ENTITY_TYPE]: (s, a) =>
		getContentItemsForActor(s.content, s.permissions, a).map((i) => ({ id: i.id, label: i.title })),
};

const NONE = '';

export function TileBindDialog({ w, onClose }: { w: BoardWidget; onClose: () => void }) {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const found = bindingSlot(runtime.state.widgets, w.type);
	const types = found?.slot.entityTypes ?? [];
	const candidates = types.flatMap((entityType) =>
		(READERS[entityType]?.(runtime.state, actorId) ?? []).map((entry) => ({
			...entry,
			entityType,
		})),
	);
	const ref = w.bindingRef;
	const current = ref
		? candidates.findIndex((c) => c.entityType === ref.entityType && c.id === ref.entityId)
		: -1;
	const [choice, setChoice] = useState(
		current >= 0 ? String(current) : found?.optional || !candidates.length ? NONE : '0',
	);
	const [busy, setBusy] = useState(false);
	if (!found) return null;
	const { slot, optional } = found;
	const noun = slot.label.toLowerCase();
	const picked = choice === NONE ? null : (candidates[Number(choice)] ?? null);

	async function bind() {
		const place = sceneInstance(runtime.state, w.id);
		if (!place) return;
		setBusy(true);
		const result = await runtime.dispatch({
			type: 'scene.configure-widget',
			actorId,
			payload: {
				sceneId: place.scene.id,
				widgetInstanceId: w.id,
				binding: picked
					? {
							source: { entityType: picked.entityType, entityId: picked.id },
							mode: slot.mode,
							requiredCapability: slot.requiredCapability,
						}
					: null,
			},
		});
		setBusy(false);
		if (result.status !== 'accepted') {
			Toaster.error(result.rejection.message);
			return;
		}
		Toaster.success(picked ? TEXT.bound(w.title, picked.label) : TEXT.unbound(w.title));
		onClose();
	}

	const options = [
		...(optional ? [{ value: NONE, label: TEXT.none }] : []),
		...candidates.map((c, i) => ({
			value: String(i),
			label: types.length > 1 ? `${c.label} · ${c.entityType}` : c.label,
		})),
	];
	return (
		<Dialog
			open
			onClose={onClose}
			title={TEXT.bindTitle(w.title)}
			description={TEXT.bindHelp(noun)}
			size="sm"
			data-testid="tile-bind-dialog"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose}>
						{TEXT.cancel}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="link"
						disabled={busy || (!picked && !optional)}
						onClick={() => void bind()}
					>
						{TEXT.bind}
					</Button>
				</>
			}
		>
			{options.length === 0 ? (
				<div style={{ color: 'var(--color-text-secondary)' }}>{TEXT.nothing(noun)}</div>
			) : (
				<Field label={slot.label}>
					<Select
						value={choice}
						options={options}
						onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setChoice(e.target.value)}
					/>
				</Field>
			)}
		</Dialog>
	);
}

/** RC-CAN-8.8 — what an entry field offers to help: a placeholder, an example and a check. */
export interface FieldGuide {
	placeholder?: string;
	example?: string;
	validate?: (raw: string) => string | null;
}

const TITLE_MAX = 60;
const TEXT_MAX = 120;
const BODY_MAX = 10_000;
export const DICE_EXAMPLE = '1d20+5, 2d6';

/** Dice's quick-roll field: comma-separated formulas the core dice parser accepts. Empty pieces are
 *  skipped, as the tile skips them, and an empty field is fine: the tile then rolls a d20. */
export function validateDiceFormulas(raw: string): string | null {
	for (const formula of raw.split(',').map((piece) => piece.trim())) {
		if (!formula) continue;
		const parsed = parseDiceExpression(formula);
		if (parsed.ok) continue;
		return parsed.error.code === 'syntax' || parsed.error.code === 'empty'
			? TEXT.notAFormula(formula)
			: `“${formula}”: ${parsed.error.message}`;
	}
	return null;
}

const maxLength = (max: number) => (raw: string) =>
	raw.length > max ? TEXT.tooLong(max, raw.length) : null;

/** A number field's check against its declared bounds and step. */
export function validateNumberField(
	field: Pick<WidgetConfigField, 'min' | 'max' | 'step'>,
	raw: string,
): string | null {
	const n = raw.trim() === '' ? Number.NaN : Number(raw);
	const { min, max, step } = field;
	if (!Number.isFinite(n)) return TEXT.notANumber;
	if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
		return TEXT.outOfRange(rangeText(field));
	}
	if (step) {
		const steps = (n - (min ?? 0)) / step;
		if (Math.abs(steps - Math.round(steps)) > 1e-9) {
			return step === 1 ? TEXT.wholeNumber : TEXT.offStep(step);
		}
	}
	return null;
}

function rangeText({ min, max }: Pick<WidgetConfigField, 'min' | 'max'>): string {
	if (min !== undefined && max !== undefined) return `from ${min} to ${max}`;
	if (min !== undefined) return `${min} or more`;
	if (max !== undefined) return `up to ${max}`;
	return 'any number';
}

/** Copy for the system widgets' known fields; anything else falls back on its control type. */
const KNOWN: Record<string, (defaultTitle: string) => FieldGuide> = {
	'dice.formulas': () => ({
		placeholder: DICE_EXAMPLE,
		example: TEXT.diceExample,
		validate: validateDiceFormulas,
	}),
	'*.title': (defaultTitle) => ({
		placeholder: defaultTitle,
		example: TEXT.titleExample(defaultTitle),
		validate: maxLength(TITLE_MAX),
	}),
	'*.heading': () => ({
		placeholder: 'Tonight at the inn',
		example: TEXT.headingExample,
		validate: maxLength(TEXT_MAX),
	}),
	'*.body': () => ({
		placeholder: 'What the table should read',
		example: TEXT.bodyExample,
		validate: maxLength(BODY_MAX),
	}),
};

export function fieldGuide(
	type: string,
	field: WidgetConfigField,
	defaultTitle: string,
): FieldGuide {
	const known = KNOWN[`${type}.${field.key}`] ?? KNOWN[`*.${field.key}`];
	if (known) return known(defaultTitle);
	if (field.control === 'number') {
		return {
			placeholder: field.default === undefined ? undefined : String(field.default),
			example: TEXT.numberExample(rangeText(field), field.default),
			validate: (raw) => validateNumberField(field, raw),
		};
	}
	if (field.control === 'text' || field.control === 'textarea') {
		return {
			placeholder: field.placeholder ?? field.label,
			example: field.help ?? (field.control === 'textarea' ? TEXT.bodyExample : TEXT.textExample),
			validate: maxLength(field.control === 'textarea' ? BODY_MAX : TEXT_MAX),
		};
	}
	return {};
}

const isEntry = (field: WidgetConfigField) =>
	field.control === 'text' || field.control === 'textarea' || field.control === 'number';

/** The board has no Inspector, so its Configure… opens the definition's declared settings here.
 *  RC-CAN-8.8 — the controls edit a draft: Save (or Enter in a field) checks every entry and writes
 *  them in one `scene.configure-widget`; Cancel or Escape asks first when something changed. */
export function TileConfigureDialog({ w, onClose }: { w: BoardWidget; onClose: () => void }) {
	const runtime = useRuntime();
	const fields = settingsFields(w);
	const defaultTitle = findWidgetDefinition(runtime.state.widgets, w.type)?.displayName ?? w.title;
	// Entry fields hold their text as typed so a half-written number can be checked and shown back.
	const initialOf = (field: WidgetConfigField) => {
		const value = w.configuration[field.key] ?? field.default;
		return isEntry(field) ? (value == null ? '' : String(value)) : value;
	};
	const [initial] = useState(() => Object.fromEntries(fields.map((f) => [f.key, initialOf(f)])));
	const [draft, setDraft] = useState(initial);
	const [touched, setTouched] = useState<Record<string, boolean>>({});
	const [submitted, setSubmitted] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);
	const bodyRef = useRef<HTMLDivElement>(null);

	const guides = Object.fromEntries(
		fields.map((f) => [f.key, fieldGuide(w.type, f, defaultTitle)]),
	);
	const errors = Object.fromEntries(
		fields.map((f) => [
			f.key,
			isEntry(f) ? (guides[f.key]?.validate?.(String(draft[f.key] ?? '')) ?? null) : null,
		]),
	);
	const changed = fields.filter((f) => draft[f.key] !== initial[f.key]);
	const set = (key: string, value: unknown) => setDraft((prev) => ({ ...prev, [key]: value }));

	async function save() {
		if (busy) return;
		setSubmitted(true);
		if (fields.some((f) => errors[f.key])) {
			requestAnimationFrame(() =>
				bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
			);
			return;
		}
		const place = sceneInstance(runtime.state, w.id);
		if (!changed.length || !place) return onClose();
		const configuration = { ...place.instance.configuration };
		for (const field of changed) {
			const value = draft[field.key];
			configuration[field.key] = field.control === 'number' ? Number(value) : value;
		}
		setBusy(true);
		const result = await runtime.dispatch({
			type: 'scene.configure-widget',
			actorId: runtime.defaultActorId,
			payload: { sceneId: place.scene.id, widgetInstanceId: w.id, configuration },
		});
		setBusy(false);
		if (result.status !== 'accepted') {
			Toaster.error(result.rejection.message);
			return;
		}
		Toaster.success(TEXT.saved(w.title));
		onClose();
	}

	// Escape, the close button and Cancel all land here. With the guard up, they mean "keep editing".
	function cancel() {
		if (confirming) setConfirming(false);
		else if (changed.length) setConfirming(true);
		else onClose();
	}

	return (
		<Dialog
			open
			onClose={cancel}
			title={TEXT.configureTitle(w.title)}
			size="sm"
			data-testid="tile-configure-dialog"
			footer={
				confirming ? (
					<>
						<Button variant="secondary" size="sm" autoFocus onClick={() => setConfirming(false)}>
							{TEXT.keepEditing}
						</Button>
						<Button variant="danger" size="sm" onClick={onClose}>
							{TEXT.discard}
						</Button>
					</>
				) : (
					<>
						<Button variant="secondary" size="sm" onClick={cancel}>
							{TEXT.cancel}
						</Button>
						<Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
							{TEXT.save}
						</Button>
					</>
				)
			}
		>
			<div
				ref={bodyRef}
				style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
				onKeyDown={(e) => {
					if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
					const target = e.target as HTMLElement;
					const single = target instanceof HTMLInputElement && target.type !== 'color';
					const multi = target instanceof HTMLTextAreaElement && (e.ctrlKey || e.metaKey);
					if (!single && !multi) return;
					e.preventDefault();
					void save();
				}}
			>
				{confirming && (
					<Callout
						tone="warning"
						role="alert"
						title={TEXT.unsavedTitle}
						data-testid="tile-configure-unsaved"
					>
						{TEXT.unsavedBody(changed.map((f) => f.label))}
					</Callout>
				)}
				{fields.map((field) =>
					isEntry(field) ? (
						<GuidedField
							key={field.key}
							field={field}
							guide={guides[field.key] ?? {}}
							value={String(draft[field.key] ?? '')}
							error={touched[field.key] || submitted ? errors[field.key] : null}
							onChange={(value) => set(field.key, value)}
							onBlur={() => setTouched((prev) => ({ ...prev, [field.key]: true }))}
						/>
					) : (
						<FieldControl
							key={field.key}
							field={field}
							value={draft[field.key]}
							onCommit={(value) => set(field.key, value)}
						/>
					),
				)}
			</div>
		</Dialog>
	);
}

function GuidedField({
	field,
	guide,
	value,
	error,
	onChange,
	onBlur,
}: {
	field: WidgetConfigField;
	guide: FieldGuide;
	value: string;
	error: string | null | undefined;
	onChange: (value: string) => void;
	onBlur: () => void;
}) {
	const common = {
		value,
		placeholder: guide.placeholder,
		invalid: !!error,
		onChange: (e: { target: { value: string } }) => onChange(e.target.value),
		onBlur,
	};
	return (
		<Field label={field.label} help={guide.example} error={error || undefined}>
			{field.control === 'textarea' ? (
				<Textarea rows={3} {...common} />
			) : field.control === 'number' ? (
				<Input
					type="number"
					inputMode="decimal"
					min={field.min}
					max={field.max}
					step={field.step}
					{...common}
				/>
			) : (
				<Input {...common} />
			)}
		</Field>
	);
}
