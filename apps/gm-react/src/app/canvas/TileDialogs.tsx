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
import { useI18n } from '../../i18n';
import { englishCopy, type Translate } from './canvasCopy';

/**
 * RC-CAN-2.4 — the two tile-menu items that need more room than a menu row: Bind… (which entity the
 * tile shows) and, off the scene editor, Configure… (the definition's declared settings; the scene
 * editor opens its Inspector instead). Both write `scene.configure-widget`, the command the Map tile's
 * own picker and the Inspector already use, so the core stays the one judge of who may bind what.
 */

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
	const { t } = useI18n();
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
		Toaster.success(
			picked
				? t('boardCanvas.dialog.bound', { title: w.title, name: picked.label })
				: t('boardCanvas.dialog.unbound', { title: w.title }),
		);
		onClose();
	}

	const options = [
		...(optional ? [{ value: NONE, label: t('boardCanvas.dialog.none') }] : []),
		...candidates.map((c, i) => ({
			value: String(i),
			label: types.length > 1 ? `${c.label} · ${c.entityType}` : c.label,
		})),
	];
	return (
		<Dialog
			open
			onClose={onClose}
			title={t('boardCanvas.dialog.bindTitle', { title: w.title })}
			description={t('boardCanvas.dialog.bindHelp', { noun })}
			size="sm"
			data-testid="tile-bind-dialog"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="link"
						disabled={busy || (!picked && !optional)}
						onClick={() => void bind()}
					>
						{t('boardCanvas.dialog.bind')}
					</Button>
				</>
			}
		>
			{options.length === 0 ? (
				<div style={{ color: 'var(--color-text-secondary)' }}>
					{t('boardCanvas.dialog.nothing', { noun })}
				</div>
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
export function validateDiceFormulas(raw: string, t: Translate = englishCopy): string | null {
	for (const formula of raw.split(',').map((piece) => piece.trim())) {
		if (!formula) continue;
		const parsed = parseDiceExpression(formula);
		if (parsed.ok) continue;
		return parsed.error.code === 'syntax' || parsed.error.code === 'empty'
			? t('boardCanvas.dialog.notAFormula', { formula })
			: `“${formula}”: ${parsed.error.message}`;
	}
	return null;
}

const maxLength = (max: number, t: Translate) => (raw: string) =>
	raw.length > max ? t('boardCanvas.dialog.tooLong', { max, length: raw.length }) : null;

/** A number field's check against its declared bounds and step. */
export function validateNumberField(
	field: Pick<WidgetConfigField, 'min' | 'max' | 'step'>,
	raw: string,
	t: Translate = englishCopy,
): string | null {
	const n = raw.trim() === '' ? Number.NaN : Number(raw);
	const { min, max, step } = field;
	if (!Number.isFinite(n)) return t('boardCanvas.dialog.notANumber');
	if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
		return t('boardCanvas.dialog.outOfRange', { range: rangeText(field, t) ?? '' });
	}
	if (step) {
		const steps = (n - (min ?? 0)) / step;
		if (Math.abs(steps - Math.round(steps)) > 1e-9) {
			return step === 1
				? t('boardCanvas.dialog.wholeNumber')
				: t('boardCanvas.dialog.offStep', { step });
		}
	}
	return null;
}

/** The declared bounds in words, or null when the field declares none. */
function rangeText({ min, max }: Pick<WidgetConfigField, 'min' | 'max'>, t: Translate) {
	if (min !== undefined && max !== undefined)
		return t('boardCanvas.dialog.rangeBoth', { min, max });
	if (min !== undefined) return t('boardCanvas.dialog.rangeMin', { min });
	if (max !== undefined) return t('boardCanvas.dialog.rangeMax', { max });
	return null;
}

/** "A number from 1 to 10, for example 4." — or "Any number." when the field declares no bounds
 *  (it read "A number any number." before RC-POL-1.2). */
function numberExample(field: WidgetConfigField, t: Translate) {
	const range = rangeText(field, t);
	const value = field.default === undefined ? undefined : String(field.default);
	if (range === null)
		return value === undefined
			? t('boardCanvas.dialog.anyNumber')
			: t('boardCanvas.dialog.anyNumberDefault', { value });
	return value === undefined
		? t('boardCanvas.dialog.numberExample', { range })
		: t('boardCanvas.dialog.numberExampleDefault', { range, value });
}

/** Copy for the system widgets' known fields; anything else falls back on its control type. */
const KNOWN: Record<string, (defaultTitle: string, t: Translate) => FieldGuide> = {
	'dice.formulas': (_, t) => ({
		placeholder: DICE_EXAMPLE,
		example: t('boardCanvas.dialog.diceExample'),
		validate: (raw) => validateDiceFormulas(raw, t),
	}),
	'*.title': (defaultTitle, t) => ({
		placeholder: defaultTitle,
		example: t('boardCanvas.dialog.titleExample', { title: defaultTitle }),
		validate: maxLength(TITLE_MAX, t),
	}),
	'*.heading': (_, t) => ({
		placeholder: t('boardCanvas.dialog.headingPlaceholder'),
		example: t('boardCanvas.dialog.headingExample'),
		validate: maxLength(TEXT_MAX, t),
	}),
	'*.body': (_, t) => ({
		placeholder: t('boardCanvas.dialog.bodyPlaceholder'),
		example: t('boardCanvas.dialog.bodyExample'),
		validate: maxLength(BODY_MAX, t),
	}),
};

export function fieldGuide(
	type: string,
	field: WidgetConfigField,
	defaultTitle: string,
	t: Translate = englishCopy,
): FieldGuide {
	const known = KNOWN[`${type}.${field.key}`] ?? KNOWN[`*.${field.key}`];
	if (known) return known(defaultTitle, t);
	if (field.control === 'number') {
		return {
			placeholder: field.default === undefined ? undefined : String(field.default),
			example: numberExample(field, t),
			validate: (raw) => validateNumberField(field, raw, t),
		};
	}
	if (field.control === 'text' || field.control === 'textarea') {
		return {
			placeholder: field.placeholder ?? field.label,
			example:
				field.help ??
				t(
					field.control === 'textarea'
						? 'boardCanvas.dialog.bodyExample'
						: 'boardCanvas.dialog.textExample',
				),
			validate: maxLength(field.control === 'textarea' ? BODY_MAX : TEXT_MAX, t),
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
	const { t } = useI18n();
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
		fields.map((f) => [f.key, fieldGuide(w.type, f, defaultTitle, t)]),
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
		Toaster.success(t('boardCanvas.dialog.saved', { title: w.title }));
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
			title={t('boardCanvas.dialog.configureTitle', { title: w.title })}
			size="sm"
			data-testid="tile-configure-dialog"
			footer={
				confirming ? (
					<>
						<Button variant="secondary" size="sm" autoFocus onClick={() => setConfirming(false)}>
							{t('boardCanvas.dialog.keepEditing')}
						</Button>
						<Button variant="danger" size="sm" onClick={onClose}>
							{t('boardCanvas.dialog.discard')}
						</Button>
					</>
				) : (
					<>
						<Button variant="secondary" size="sm" onClick={cancel}>
							{t('common.action.cancel')}
						</Button>
						<Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
							{t('common.action.save')}
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
						title={t('boardCanvas.dialog.unsavedTitle')}
						data-testid="tile-configure-unsaved"
					>
						{t('boardCanvas.dialog.unsavedBody', {
							fields: changed.map((f) => f.label).join(', '),
						})}
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
