import { useRef, useState } from 'react';
import { Button, Dialog, Icon, IconButton, Popover, Select, Slider, Switch } from '../../ds';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n';
import { T } from '../screen-kit';
import { useCombatTemplates } from './canvas/useCombatTemplates';
import { TERRAIN_STYLES } from './mapVocab';
import type { MapEditorApi } from './useMapEditor';

/**
 * MAP-021 — the context-sensitive tool-options bar. THE DECISION RULE: this bar carries parameters of
 * the VERB (what the next stroke/click will do), never of a selected object (that is the Inspector's
 * job). It changes per active tool and its state persists per tool via `editor.options`. When a tool
 * has more than ~4 controls the overflow lives behind a ⚙ Popover — never a modal, because these are
 * tuned while watching the canvas.
 */

/** Slider always PAIRED with a number input + steppers — a lone slider is a WCAG 2.5.7 failure. */
export function NumberControl({
	label,
	value,
	min,
	max,
	step,
	unit,
	onChange,
	width = 150,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	unit?: string;
	onChange: (v: number) => void;
	width?: number;
}) {
	const clamp = (v: number) => Math.min(max, Math.max(min, v));
	// Clamping on every keystroke made multi-digit values impossible to type: with min=5, typing
	// "20" clamped the intermediate "2" to 5 and left you at 50. Hold the raw text while the field
	// has focus and only commit (clamped) on blur or Enter. The slider/steppers still clamp live.
	const [draft, setDraft] = useState<string | null>(null);
	const commitDraft = () => {
		if (draft === null) return;
		const parsed = Number(draft);
		setDraft(null);
		if (draft.trim() !== '' && Number.isFinite(parsed)) onChange(clamp(parsed));
	};
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
			<span style={{ font: `12px ${T.sans}`, color: T.sub, whiteSpace: 'nowrap' }}>{label}</span>
			<Slider
				min={min}
				max={max}
				step={step}
				value={value}
				aria-label={label}
				valueLabel={`${value}${unit ? ` ${unit}` : ''}`}
				onChange={(v: number) => onChange(clamp(v))}
				style={{ width }}
			/>
			<button
				type="button"
				aria-label={`Decrease ${label}`}
				onClick={() => onChange(clamp(value - step))}
				style={stepBtn}
			>
				<Icon name="remove" size={13} />
			</button>
			<input
				type="number"
				aria-label={`${label} value`}
				value={draft ?? value}
				min={min}
				max={max}
				step={step}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commitDraft}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						commitDraft();
					}
				}}
				style={{
					width: 54,
					textAlign: 'right',
					font: `12px ${T.mono}`,
					color: T.ink,
					background: T.sunken,
					border: `1px solid ${T.bdS}`,
					borderRadius: 'var(--radius-sm)',
					padding: 'var(--space-1) var(--space-1-5)',
				}}
			/>
			<button
				type="button"
				aria-label={`Increase ${label}`}
				onClick={() => onChange(clamp(value + step))}
				style={stepBtn}
			>
				<Icon name="add" size={13} />
			</button>
		</div>
	);
}

export const stepBtn = {
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	width: 26,
	height: 26,
	flex: '0 0 auto',
	borderRadius: 'var(--radius-sm)',
	border: `1px solid ${T.bdS}`,
	background: T.raised,
	color: T.sub,
	cursor: 'pointer',
	padding: 'var(--space-0)',
} as const;

export function SnapMenu({ editor }: { editor: MapEditorApi }) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	return (
		<div style={{ position: 'relative' }}>
			<button
				type="button"
				ref={triggerRef}
				aria-label={t('toolOptions.snapping')}
				aria-expanded={open}
				title={t('toolOptions.snappingHint')}
				onClick={() => setOpen((v) => !v)}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 'var(--space-1-5)',
					padding: 'var(--space-1-5) var(--space-2)',
					borderRadius: 'var(--radius-md)',
					border: `1px solid ${T.bd}`,
					background: T.raised,
					color: T.sub,
					cursor: 'pointer',
					font: `12px ${T.sans}`,
				}}
			>
				<Icon name="tool-magnet" size={14} />
				{t('toolOptions.snap')}
			</button>
			{open && (
				<Popover
					open
					onClose={() => setOpen(false)}
					triggerRef={triggerRef}
					title={t('toolOptions.snapTitle')}
					width={220}
					placement="bottom"
					// ds/Popover only sets a z-index in its `anchor` branch, and this options bar is a
					// static ancestor — so without an explicit z-index the flyout was painted UNDER the
					// positioned canvas wrapper and its switches were unclickable. Matches the header
					// export menu (MapEditor.tsx) and the layer row menu (LayersPanel.tsx).
					style={{
						position: 'absolute',
						left: 0,
						top: 'calc(100% + 6px)',
						transform: 'none',
						zIndex: 30,
					}}
				>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
						{(
							[
								['snapGrid', 'toolOptions.snapGrid'],
								['snapAngle', 'toolOptions.snapAngle'],
								['snapObject', 'toolOptions.snapObject'],
							] as const satisfies readonly (readonly [string, MessageKey])[]
						).map(([key, label]) => (
							<label
								key={key}
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									gap: 'var(--space-2)',
								}}
							>
								<span style={{ font: `12.5px ${T.sans}`, color: T.ink }}>{t(label)}</span>
								<Switch
									checked={editor.options[key]}
									aria-label={t(label)}
									onChange={(v: boolean) => editor.setOption(key, v)}
								/>
							</label>
						))}
						<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
							{t('toolOptions.snapCtrlHint')}
						</div>
					</div>
				</Popover>
			)}
		</div>
	);
}

/**
 * RC-MAP-3.9 — a fog session can run to dozens of hand-drawn reveal/conceal ops with no way back
 * short of undoing every one in order. This is the honest reset: a confirm (fog affects what
 * players see, so an accidental click must not be silent) then one `map.remove-fog` per existing
 * op, oldest first — the exact shape `deleteSelection` (`keyboard.ts`) already uses for a bulk
 * removal, because `editor.run` is single-flight and cannot take a second op before the first
 * resolves.
 */
export function ClearFogButton({
	editor,
	announce,
}: {
	editor: MapEditorApi;
	announce?: (message: string) => void;
}) {
	const { t } = useI18n();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [clearing, setClearing] = useState(false);
	const fogCount = editor.map?.fog.length ?? 0;
	return (
		<>
			{/* Icon-only (not a labelled button): the fog case already runs mode + shape + a conditional
			    size control + feather, and a labelled button here was the one control wide enough to
			    push the bar onto a second row — which the sub-tool flyout above it is not laid out to
			    make room for. */}
			<IconButton
				icon="delete"
				label={t('toolOptions.clearFog')}
				variant="outline"
				size="sm"
				disabled={fogCount === 0}
				onClick={() => setConfirmOpen(true)}
			/>
			{confirmOpen && (
				<Dialog
					open
					onClose={() => setConfirmOpen(false)}
					title={t('toolOptions.clearFogConfirmTitle')}
					description={t('toolOptions.clearFogConfirmBody')}
					tone="danger"
					icon="delete"
					size="sm"
					footer={
						<>
							<Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
								{t('common.action.cancel')}
							</Button>
							<Button
								variant="danger"
								size="sm"
								icon="delete"
								disabled={clearing}
								onClick={() => {
									setClearing(true);
									void clearAllFogOps(editor).then(() => {
										setClearing(false);
										setConfirmOpen(false);
										announce?.(t('toolOptions.fogCleared'));
									});
								}}
							>
								{t('toolOptions.clearFog')}
							</Button>
						</>
					}
				/>
			)}
		</>
	);
}

/**
 * RC-MAP-2.2 — take every area of effect back off this map. Icon-only for the same reason the fog
 * one is: the area tools already run a size and a rotation control, and a labelled button pushes the
 * bar onto a second row the sub-tool flyout is not laid out to make room for.
 *
 * No confirmation dialog, unlike clearing fog: a template is scaffolding for the fight in progress
 * and re-placing one is two clicks, where cleared fog is authored map state that took real work.
 */
export function ClearAreasButton({
	editor,
	announce,
}: {
	editor: MapEditorApi;
	announce?: (message: string) => void;
}) {
	const { t } = useI18n();
	const [clearing, setClearing] = useState(false);
	const { templates } = useCombatTemplates(editor.mapId, editor.actorId);
	return (
		<IconButton
			icon="delete"
			label={t('toolOptions.clearAreas')}
			variant="outline"
			size="sm"
			disabled={clearing || templates.length === 0}
			onClick={() => {
				setClearing(true);
				const ids = templates.map((entry) => entry.template.id);
				void (async () => {
					for (const templateId of ids) {
						await editor.run(
							{
								type: 'combat.remove-template',
								actorId: editor.actorId,
								payload: { templateId },
							} as never,
							{ undoable: false },
						);
					}
					setClearing(false);
					announce?.(t('toolOptions.areasCleared', { count: ids.length }));
				})();
			}}
		/>
	);
}

export async function clearAllFogOps(editor: MapEditorApi) {
	const ids = (editor.map?.fog ?? []).map((op) => op.id);
	for (const fogId of ids) {
		await editor.run({
			type: 'map.remove-fog',
			actorId: editor.actorId,
			payload: { mapId: editor.mapId, fogId },
		} as never);
	}
}

export function TerrainSelect({ editor }: { editor: MapEditorApi }) {
	const { t } = useI18n();
	return (
		<label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
			<span style={{ font: `12px ${T.sans}`, color: T.sub }}>{t('toolOptions.terrain')}</span>
			<Select
				value={editor.options.terrainStyle}
				aria-label={t('toolOptions.terrainStyle')}
				options={TERRAIN_STYLES.map((style) => ({ value: style.id, label: t(style.label) }))}
				onChange={(e: { target: { value: string } }) =>
					editor.setOption('terrainStyle', e.target.value)
				}
				style={{ minWidth: 150 }}
			/>
		</label>
	);
}
