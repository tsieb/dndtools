/* eslint-disable i18n/no-literal-jsx-text -- DEV-only developer documentation, excluded from production; fixtures intentionally show literal component copy. */
import { useEffect, useId, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import * as DS from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { galleryRegistry } from '../../../../scripts/check-prod-bundle.mjs';

type Props = Record<string, unknown>;
type GalleryEntry = {
	name: string;
	source: string;
	description: string;
	props: Props;
	axes: Record<string, unknown[]>;
	examples: Record<string, Props>;
};

// The documentation command and React gallery share the same synthetic registry.
export { galleryRegistry } from '../../../../scripts/check-prod-bundle.mjs';

const stack: CSSProperties = { display: 'grid', gap: 'var(--space-4)', minWidth: 'var(--space-0)' };
const row: CSSProperties = {
	display: 'flex',
	flexWrap: 'wrap',
	gap: 'var(--space-3)',
	alignItems: 'center',
};
const control: CSSProperties = {
	maxWidth: '100%',
	minHeight: 'var(--density-button-height)',
	padding: 'var(--space-2)',
	border: '1px solid var(--color-border-strong)',
	borderRadius: 'var(--radius-sm)',
	background: 'var(--color-surface-raised)',
	color: 'var(--color-text-primary)',
};
const components = DS as unknown as Record<string, ComponentType<Props>>;

/** Only the selected specimen mounts: modal focus traps and live regions never compete. */
function Specimen({ entry, initial }: { entry: GalleryEntry; initial: Props }) {
	const [props, setProps] = useState(initial);
	const [open, setOpen] = useState(false);
	const [message, setMessage] = useState('No example actions yet.');
	const [removed, setRemoved] = useState(false);
	const toastIds = useRef<number[]>([]);
	useEffect(() => {
		const ids = toastIds.current;
		return () => ids.forEach((id) => DS.Toaster.dismiss(id));
	}, []);
	const id = useId();
	const update = (key: string, value: unknown) => setProps((p) => ({ ...p, [key]: value }));
	const action = () => setMessage('Example action received.');
	const close = () => setOpen(false);
	const remove = () => {
		setRemoved(true);
		setMessage('Example removed. Use Reset example to restore it.');
	};
	const Component = components[entry.name];
	const scrollable = ['InitiativeRow', 'ImportWizard', 'Toast'].includes(entry.name);
	const common = { ...props, onClick: action };
	let specimen;
	switch (entry.name) {
		case 'Dialog':
		case 'Sheet':
		case 'Popover':
		case 'CommandPalette':
		case 'POIPopover': {
			const commands = (props.commands as Props[] | undefined)?.map((command) => ({
				...command,
				run: () => {
					action();
					close();
				},
			}));
			specimen = (
				<>
					<DS.Button onClick={() => setOpen(true)}>Open example</DS.Button>
					{open && (
						<Component
							{...props}
							open
							onClose={close}
							{...(entry.name === 'CommandPalette'
								? { commands }
								: entry.name === 'POIPopover'
									? {
											onFocus: action,
											onEdit: action,
											onDeepLink: action,
											onDelete: close,
											onOpenNote: action,
											onVisibilityChange: (visibility: string) =>
												update('poi', { ...(props.poi as Props), visibility }),
										}
									: { footer: <DS.Button onClick={close}>Close example</DS.Button> })}
						/>
					)}
				</>
			);
			break;
		}
		case 'Checkbox':
		case 'Switch':
			specimen = (
				<Component {...props} onChange={(checked: boolean) => update('checked', checked)} />
			);
			break;
		case 'RadioCard':
			specimen = <Component {...props} onChange={() => update('checked', !props.checked)} />;
			break;
		case 'Slider':
		case 'SegmentedControl':
		case 'TagInput':
			specimen = <Component {...props} onChange={(value: unknown) => update('value', value)} />;
			break;
		case 'Tabs':
			specimen = (
				<>
					<DS.Tabs {...props} idBase={id} onChange={(value: string) => update('value', value)} />
					{(props.tabs as Props[]).length > 0 && (
						<div {...DS.tabPanelProps(id, String(props.value))}>
							Selected panel: {String(props.value)}
						</div>
					)}
				</>
			);
			break;
		case 'Field':
			specimen = (
				<DS.Field {...props} htmlFor={id}>
					<DS.Input id={id} invalid={!!props.error} required={props.required} />
				</DS.Field>
			);
			break;
		case 'ListItem':
			specimen = (
				<ul style={{ padding: 'var(--space-0)', margin: 'var(--space-0)', listStyle: 'none' }}>
					<DS.ListItem {...props} onSelect={() => update('selected', !props.selected)} />
				</ul>
			);
			break;
		case 'Menu':
			specimen = (
				<DS.Menu {...props}>
					<DS.Button role="menuitem" onClick={action}>
						Edit example
					</DS.Button>
					<DS.Button role="menuitem" disabled>
						Unavailable
					</DS.Button>
				</DS.Menu>
			);
			break;
		case 'Toolbar':
			specimen = (
				<DS.Toolbar {...props}>
					<DS.Button onClick={action}>Save example</DS.Button>
					<DS.IconButton icon="edit" label="Edit example" onClick={action} />
				</DS.Toolbar>
			);
			break;
		case 'Tooltip':
			specimen = (
				<DS.Tooltip {...props}>
					<button type="button">Hover or focus for help</button>
				</DS.Tooltip>
			);
			break;
		case 'SystemProvider':
			specimen = (
				<DS.SystemProvider {...props}>
					<DS.ConditionTracker entries={[{ key: 'inspired' }]} />
				</DS.SystemProvider>
			);
			break;
		case 'Chip':
		case 'ConditionBadge':
			specimen = removed ? (
				<p>Example removed.</p>
			) : (
				<Component
					{...props}
					onRemove={props.onRemove === null ? undefined : remove}
					onClick={
						entry.name === 'Chip' && props.onClick !== null
							? () => update('selected', !props.selected)
							: undefined
					}
				/>
			);
			break;
		case 'ConditionTracker':
			specimen = (
				<Component
					{...props}
					onRemove={(_condition: string, index: number) =>
						update(
							'entries',
							(props.entries as Props[]).filter((_, i) => i !== index),
						)
					}
					onAdd={() => update('entries', [...(props.entries as Props[]), { key: 'prone' }])}
				/>
			);
			break;
		case 'Toast':
			specimen = removed ? (
				<p>Example dismissed.</p>
			) : (
				<DS.Toast {...props} onAction={action} onDismiss={remove} />
			);
			break;
		case 'ToastViewport':
			specimen = (
				<>
					<DS.Button
						onClick={() =>
							toastIds.current.push(
								DS.Toaster.show({ message: 'Gallery example toast', duration: 5000 }),
							)
						}
					>
						Show example toast
					</DS.Button>
					<DS.ToastViewport {...props} />
				</>
			);
			break;
		case 'EmptyState':
			specimen = (
				<DS.EmptyState {...props} action={<DS.Button onClick={action}>Create example</DS.Button>} />
			);
			break;
		case 'FeatureSpotlight':
			specimen = <Component {...props} onAction={action} />;
			break;
		case 'CardHeader':
			specimen = (
				<Component
					{...props}
					actions={<DS.IconButton icon="edit" label="Edit example" onClick={action} />}
				/>
			);
			break;
		case 'Avatar':
			specimen = (
				<div style={row}>
					<Component {...props} />
					<span>{String(props.name || 'Unnamed participant')}</span>
				</div>
			);
			break;
		case 'NavRail':
		case 'NavSidebar':
		case 'BottomTabBar':
			specimen = <Component {...props} onSelect={(active: string) => update('active', active)} />;
			break;
		case 'Breadcrumb':
			specimen = <Component {...props} onNavigate={action} />;
			break;
		case 'DataTable':
			specimen = (
				<Component
					{...props}
					onSort={(key: string) => {
						const sort = props.sort as Props | null;
						const dir = sort?.dir === 'asc' ? 'desc' : 'asc';
						setProps((p) => ({
							...p,
							sort: { key, dir },
							rows: [...(p.rows as Props[])].sort(
								(a, b) => String(a[key]).localeCompare(String(b[key])) * (dir === 'asc' ? 1 : -1),
							),
						}));
					}}
				/>
			);
			break;
		case 'QuestCard':
			specimen = (
				<Component
					{...props}
					onToggleObjective={(index: number) =>
						update(
							'objectives',
							(props.objectives as Props[]).map((o, i) =>
								i === index ? { ...o, done: !o.done } : o,
							),
						)
					}
				/>
			);
			break;
		case 'SpellSlots':
			specimen = (
				<Component
					{...props}
					onToggle={(level: number, index: number) =>
						update(
							'levels',
							(props.levels as Props[]).map((l) =>
								l.level === level
									? {
											...l,
											used:
												Number(l.total) -
												index -
												(index < Number(l.total) - Number(l.used) ? 0 : 1),
										}
									: l,
							),
						)
					}
				/>
			);
			break;
		case 'InitiativeRow':
			specimen = (
				<Component
					{...props}
					onHpUp={() => update('current', Math.min(Number(props.max), Number(props.current) + 1))}
					onHpDown={() => update('current', Math.max(0, Number(props.current) - 1))}
				/>
			);
			break;
		case 'LayerRow': {
			const layer = props.layer as Props;
			const setLayer = (key: string, value: unknown) => update('layer', { ...layer, [key]: value });
			specimen = (
				<Component
					{...props}
					onToggleDisplay={() => setLayer('dmDisplay', layer.dmDisplay === false)}
					onToggleLock={() => setLayer('locked', !layer.locked)}
					onCycleVisibility={(visibility: string) => setLayer('visibility', visibility)}
					onOpacityChange={(opacity: number) => setLayer('opacity', opacity)}
					onRename={(name: string) => setLayer('name', name)}
					onAction={action}
					onMove={action}
				/>
			);
			break;
		}
		case 'LayerPanel':
			specimen = <Component {...props} onChange={action} onAddLayer={action} />;
			break;
		case 'FogControls':
			specimen = (
				<Component
					{...props}
					onModeChange={(v: string) => update('mode', v)}
					onShapeChange={(v: string) => update('shape', v)}
					onBrushSize={(v: number) => update('brushSize', v)}
					onFeather={(v: boolean) => update('feather', v)}
					onRevealAll={action}
					onResetFog={action}
				/>
			);
			break;
		case 'GenerationPanel':
			specimen = (
				<Component {...props} onAccept={action} onDiscard={action} onRandomizeSeed={action} />
			);
			break;
		case 'ImportWizard':
			specimen = <Component {...props} onCommit={action} onCancel={action} onOpenMap={action} />;
			break;
		case 'MapCreationForm':
			specimen = <Component {...props} onCreate={action} onCancel={action} />;
			break;
		case 'Minimap':
			specimen = <Component {...props} onJump={action} />;
			break;
		case 'ToolPalette':
			specimen = (
				<Component
					{...props}
					onSelect={(active: string) => update('active', active)}
					onUndo={action}
					onRedo={action}
				/>
			);
			break;
		case 'SystemPackageCard':
			specimen = <Component {...props} onSelect={() => update('active', !props.active)} />;
			break;
		default:
			specimen = <Component {...common} />;
	}
	return (
		<div style={stack}>
			<div
				data-ds-specimen={entry.name}
				role={scrollable ? 'group' : undefined}
				aria-label={scrollable ? `${entry.name} example, scroll for more` : undefined}
				tabIndex={scrollable ? 0 : undefined}
				style={{
					...stack,
					position: 'relative',
					minHeight: props.anchor ? 'calc(var(--space-16) * 6)' : undefined,
					overflowX: scrollable ? 'auto' : undefined,
					padding: 'var(--space-6)',
					border: '1px solid var(--color-border)',
					borderRadius: 'var(--radius-md)',
					background: 'var(--color-surface)',
				}}
			>
				{specimen}
			</div>
			<p role="status">{message}</p>
		</div>
	);
}

export function DsGallery() {
	// Report live host readiness while keeping component fixtures usable during load failures.
	const runtime = useRuntime();
	const [name, setName] = useState('Button');
	const [example, setExample] = useState('Default');
	const [overrides, setOverrides] = useState<Props>({});
	const [revision, setRevision] = useState(0);
	const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'tavern');
	const [density, setDensity] = useState(document.documentElement.dataset.density || 'comfortable');
	const entry = galleryRegistry.find((item) => item.name === name)!;
	const axes =
		entry.name === 'Icon'
			? { ...entry.axes, name: Object.keys(DS.ICON_REGISTRY) }
			: entry.name === 'ConditionBadge'
				? { ...entry.axes, condition: Object.keys(DS.DEFAULT_CONDITIONS) }
				: entry.axes;
	const props = {
		...Object.fromEntries(Object.entries(axes).map(([key, values]) => [key, values[0]])),
		...entry.props,
		...entry.examples[example],
		...overrides,
	};
	// Apply to html so fixed overlays inherit the same tokens; do not persist gallery preferences.
	useEffect(() => {
		const root = document.documentElement;
		const previousTheme = root.getAttribute('data-theme');
		const previousDensity = root.getAttribute('data-density');
		return () => {
			for (const [attribute, value] of [
				['data-theme', previousTheme],
				['data-density', previousDensity],
			]) {
				if (value === null) root.removeAttribute(attribute!);
				else root.setAttribute(attribute!, value!);
			}
		};
	}, []);
	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		document.documentElement.dataset.density = density;
	}, [theme, density]);
	return (
		<main
			data-ds-gallery="lamplight-ds-gallery"
			style={{
				...stack,
				padding: 'var(--space-6)',
				color: 'var(--color-text-primary)',
				background: 'var(--color-bg)',
				fontFamily: 'var(--font-sans)',
				minHeight: '100vh',
			}}
		>
			<h1>Component gallery</h1>
			<div role="status" aria-live="polite" data-ds-runtime-status>
				<DS.StatusDot
					status={runtime.hasLoadError ? 'error' : runtime.loaded ? 'live' : 'idle'}
					label={
						runtime.hasLoadError
							? 'Vault runtime unavailable'
							: runtime.loaded
								? 'Vault runtime ready'
								: 'Vault runtime loading'
					}
				/>
			</div>
			<p>
				{galleryRegistry.length} components. Choose an example and combine its variant and state
				controls. Hover, press and Tab through the specimen to inspect native interaction states.
			</p>
			<a href="#/">Return to Lamplight</a>
			<div style={row}>
				<label style={{ maxWidth: '100%', minWidth: 'var(--space-0)' }}>
					Theme{' '}
					<select
						aria-label="Theme"
						style={control}
						value={theme}
						onChange={(event) => setTheme(event.target.value)}
					>
						{['tavern', 'parchment', 'high-contrast'].map((value) => (
							<option key={value}>{value}</option>
						))}
					</select>
				</label>
				<label style={{ maxWidth: '100%', minWidth: 'var(--space-0)' }}>
					Density{' '}
					<select
						aria-label="Density"
						style={control}
						value={density}
						onChange={(event) => setDensity(event.target.value)}
					>
						{['comfortable', 'compact'].map((value) => (
							<option key={value}>{value}</option>
						))}
					</select>
				</label>
				<label style={{ maxWidth: '100%', minWidth: 'var(--space-0)' }}>
					Component{' '}
					<select
						aria-label="Component"
						style={control}
						value={name}
						onChange={(event) => {
							setName(event.target.value);
							setExample('Default');
							setOverrides({});
						}}
					>
						{galleryRegistry.map((item) => (
							<option key={item.name}>{item.name}</option>
						))}
					</select>
				</label>
			</div>
			<section style={stack} aria-labelledby="ds-component-title">
				<h2 id="ds-component-title">{entry.name}</h2>
				<p>{entry.description}</p>
				<code style={{ overflowWrap: 'anywhere' }}>{entry.source}</code>
				<div style={row}>
					<label style={{ maxWidth: '100%', minWidth: 'var(--space-0)' }}>
						Example{' '}
						<select
							aria-label="Example"
							style={control}
							value={example}
							onChange={(event) => {
								setExample(event.target.value);
								setOverrides({});
							}}
						>
							{Object.keys(entry.examples).map((value) => (
								<option key={value}>{value}</option>
							))}
						</select>
					</label>
					{Object.entries(axes).map(([key, values]) => (
						<label key={key} style={{ maxWidth: '100%', minWidth: 'var(--space-0)' }}>
							{key}{' '}
							<select
								style={control}
								aria-label={`Prop ${key}`}
								value={JSON.stringify(props[key])}
								onChange={(event) =>
									setOverrides((current) => ({ ...current, [key]: JSON.parse(event.target.value) }))
								}
							>
								{values.map((value) => (
									<option key={JSON.stringify(value)} value={JSON.stringify(value)}>
										{typeof value === 'string' ? value : JSON.stringify(value)}
									</option>
								))}
							</select>
						</label>
					))}
					<DS.Button onClick={() => setRevision((current) => current + 1)}>Reset example</DS.Button>
				</div>
				<Specimen
					key={`${name}:${example}:${JSON.stringify(overrides)}:${revision}`}
					entry={entry}
					initial={props}
				/>
				<details>
					<summary>Example props</summary>
					<pre style={{ overflowX: 'auto' }}>{JSON.stringify(props, null, 2)}</pre>
				</details>
			</section>
		</main>
	);
}
