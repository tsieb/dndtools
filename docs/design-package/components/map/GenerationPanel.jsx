import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Field } from '../forms/Field.jsx';
import { Input } from '../forms/Input.jsx';
import { Select } from '../forms/Select.jsx';
import { Slider } from '../forms/Slider.jsx';
import { SegmentedControl } from '../forms/SegmentedControl.jsx';
import { Button } from '../core/Button.jsx';

/**
 * GenerationPanel — procedural generation UI (UX-MAP-008 / MAP-004). Follows Azgaar's progressive
 * disclosure: ≤8 primary parameters visible, the rest behind "Advanced settings". A seed field
 * with a one-tap dice randomize makes deterministic reproducibility learnable without docs. A
 * live preview and a determinate, phase-labelled progress bar (never an indeterminate spinner)
 * stand in for generation. Nothing is written until Accept (MAP-004 — no partial commit).
 *
 * Parameters are context-sensitive: water/elevation show for Terrain, hazard for Dungeon.
 */
const STYLES = {
	terrain: ['Temperate forest', 'Arid desert', 'Frozen tundra', 'Volcanic', 'Coastal'],
	settlement: ['Hamlet', 'Village', 'Town', 'City', 'Fortress'],
	dungeon: ['Crypt', 'Cavern', 'Ruined keep', 'Sewer', 'Mine'],
};

export function GenerationPanel({ progress = null, phase, onAccept, onDiscard, onRandomizeSeed, style, ...rest }) {
	const [type, setType] = React.useState('terrain');
	const [seed, setSeed] = React.useState('crypt-1');
	const [size, setSize] = React.useState(1);
	const [density, setDensity] = React.useState(50);
	const [styleSel, setStyleSel] = React.useState('Temperate forest');
	const [water, setWater] = React.useState(35);
	const [elevation, setElevation] = React.useState('rolling');
	const [hazard, setHazard] = React.useState(40);
	const [advanced, setAdvanced] = React.useState(false);

	const running = progress != null && progress < 1;
	const setType2 = (t) => { setType(t); setStyleSel(STYLES[t][0]); };
	const randomize = () => { const s = Math.random().toString(36).slice(2, 8); setSeed(s); onRandomizeSeed && onRandomizeSeed(s); };

	const styleLabel = type === 'terrain' ? 'Terrain style' : type === 'settlement' ? 'Settlement type' : 'Dungeon style';
	const densityLabel = type === 'dungeon' ? 'Room density' : 'Feature density';

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', width: 320, boxSizing: 'border-box', ...style }} {...rest}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<Icon name="generate" size={18} color="var(--color-accent)" />
				<h3 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>Generate map layers</h3>
			</div>

			<SegmentedControl fullWidth ariaLabel="Generation type" value={type} onChange={setType2}
				options={[{ value: 'terrain', label: 'Terrain' }, { value: 'settlement', label: 'Settlement' }, { value: 'dungeon', label: 'Dungeon' }]} />

			<Field label="Seed">
				<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
					<Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="e.g. crypt-1" style={{ flex: 1 }} />
					<button type="button" aria-label="Randomize seed" title="Randomize seed" onClick={randomize} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, flex: '0 0 auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-strong)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', cursor: 'pointer' }}>
						<Icon name="dice" size={18} />
					</button>
				</div>
			</Field>

			<Slider stops={['Small', 'Medium', 'Large', 'Huge']} value={size} onChange={setSize} label="Size" />
			<Slider min={0} max={100} step={5} value={density} onChange={setDensity} label={densityLabel} valueLabel={`${density}%`} />
			<Field label={styleLabel}>
				<Select value={styleSel} onChange={(e) => setStyleSel(e.target.value)} options={STYLES[type]} />
			</Field>

			{type === 'terrain' && <Slider min={0} max={100} step={5} value={water} onChange={setWater} label="Water coverage" valueLabel={`${water}%`} />}
			{type === 'terrain' && (
				<Field label="Elevation profile">
					<SegmentedControl fullWidth size="sm" ariaLabel="Elevation profile" value={elevation} onChange={setElevation}
						options={[{ value: 'flat', label: 'Flat' }, { value: 'rolling', label: 'Rolling' }, { value: 'mountainous', label: 'Mountainous' }]} />
				</Field>
			)}
			{type === 'dungeon' && <Slider min={0} max={100} step={5} value={hazard} onChange={setHazard} label="Trap & hazard density" valueLabel={`${hazard}%`} />}

			<button type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', background: 'transparent', border: 'none', padding: '2px 0', color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)' }}>
				<Icon name={advanced ? 'chevron-down' : 'chevron-right'} size={16} /> Advanced settings
			</button>
			{advanced && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2-5, 10px)', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
					<Slider min={0} max={100} step={5} value={60} onChange={() => {}} label="River density" valueLabel="60%" />
					<Slider min={0} max={100} step={5} value={30} onChange={() => {}} label="Road density" valueLabel="30%" />
					<Slider min={1} max={12} step={1} value={5} onChange={() => {}} label="Biome count" valueLabel="5" />
				</div>
			)}

			<div style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', overflow: 'hidden', backgroundColor: 'var(--map-canvas-bg)', backgroundImage: 'repeating-linear-gradient(45deg, rgba(224,176,111,.05) 0 10px, transparent 10px 20px), radial-gradient(120px 80px at 60% 40%, color-mix(in oklab, var(--layer-height) 30%, transparent), transparent 70%), radial-gradient(90px 70px at 30% 70%, color-mix(in oklab, var(--layer-water) 30%, transparent), transparent 70%)' }}>
				<span style={{ position: 'absolute', left: 8, bottom: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-text-tertiary)' }}>preview · {seed}</span>
				{running && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-backdrop)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)' }}>Generating…</div>}
			</div>

			{progress != null && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
					<div role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Generation progress" style={{ height: 6, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-sunken)', overflow: 'hidden' }}>
						<div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: 'var(--color-accent)', transition: 'width var(--duration-standard) var(--easing-standard)' }} />
					</div>
					{phase && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', color: 'var(--color-text-tertiary)' }}>{phase}</span>}
				</div>
			)}

			<div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
				<Button variant="primary" icon="check" style={{ flex: 1 }} disabled={running} onClick={() => onAccept && onAccept({ type, seed, size, density, style: styleSel, water, elevation, hazard })}>Accept &amp; add</Button>
				<Button variant="ghost" onClick={onDiscard}>Discard</Button>
			</div>
		</div>
	);
}
