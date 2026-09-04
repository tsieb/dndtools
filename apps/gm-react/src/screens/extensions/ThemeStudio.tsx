import { useMemo, useState } from 'react';
import { Badge, HPBar, Icon, SegmentedControl, VisibilityChip } from '../../ds';
import { Panel, T, eb, mono } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';

/* ---- Theme studio (REAL — persisted preset choice + the LIVE token values of the active preset) --- */
// Mirrors Settings → Appearance: the same localStorage key index.html restores pre-paint, and the
// same dark-theme set so the native color-scheme (scrollbars, form controls) stays in sync.
const THEME_STORE_KEY = 'dndtools:react:theme';
const DARK_PRESETS = new Set(['tavern', 'high-contrast']);
const THEME_PRESETS = [
	{ id: 'tavern', label: 'Tavern', desc: 'Candle-lit dark (default)' },
	{ id: 'parchment', label: 'Parchment', desc: 'Warm vellum light' },
	{ id: 'high-contrast', label: 'High contrast', desc: 'The accessibility floor' },
];
// The semantic tokens the design system actually drives — read LIVE off the document, never authored.
const TOKEN_GROUPS: { label: string; tokens: string[] }[] = [
	{
		label: 'Surfaces',
		tokens: [
			'--color-bg',
			'--color-surface',
			'--color-surface-raised',
			'--color-surface-sunken',
			'--color-border',
		],
	},
	{
		label: 'Text',
		tokens: ['--color-text-primary', '--color-text-secondary', '--color-text-tertiary'],
	},
	{
		label: 'Accent & status',
		tokens: [
			'--color-accent',
			'--color-accent-subtle',
			'--color-status-success',
			'--color-status-warning',
			'--color-status-error',
		],
	},
];

export function ExtTheme() {
	const isPhone = useViewport() === 'phone';
	const [theme, setTheme] = useState<string>(
		document.documentElement.getAttribute('data-theme') || 'tavern',
	);
	// REAL + PERSISTED: the same data-theme attr + localStorage key Settings → Appearance writes, so
	// the choice survives reload (index.html restores it pre-paint) and both surfaces always agree.
	const applyTheme = (v: string) => {
		setTheme(v);
		document.documentElement.setAttribute('data-theme', v);
		document.documentElement.style.colorScheme = DARK_PRESETS.has(v) ? 'dark' : 'light';
		try {
			window.localStorage.setItem(THEME_STORE_KEY, v);
		} catch {
			/* ignore */
		}
	};
	// The LIVE computed value of each token under the active preset (recomputed on theme change —
	// the `theme` read below is the dependency that forces the re-read after the attr flips).
	const tokenValues = useMemo(() => {
		const attr = document.documentElement.getAttribute('data-theme') ?? theme;
		void attr;
		const styles = getComputedStyle(document.documentElement);
		const out: Record<string, string> = {};
		for (const g of TOKEN_GROUPS)
			for (const name of g.tokens) out[name] = styles.getPropertyValue(name).trim() || '—';
		return out;
	}, [theme]);
	const tokenValue = (name: string) => tokenValues[name] ?? '—';
	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? 'minmax(0, 1fr)' : '1.1fr 1fr',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<Panel title="Theme preset" action={<Badge status="neutral">active: {theme}</Badge>}>
				<div style={{ marginBottom: 14 }}>
					<SegmentedControl
						ariaLabel="Theme preset"
						value={theme}
						onChange={applyTheme}
						options={THEME_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
					/>
					<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 6 }}>
						{THEME_PRESETS.find((p) => p.id === theme)?.desc}
					</div>
				</div>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 12 }}>
					The preset choice is real and persists (the same setting as Settings → Appearance).
					Presets are the theming architecture — per-token overrides aren't supported, so the rows
					below are the live, read-only token values of the active preset.
				</div>
				{TOKEN_GROUPS.map((g) => (
					<div key={g.label} style={{ marginBottom: 14 }}>
						<div style={{ ...eb, marginBottom: 8 }}>{g.label}</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
							{g.tokens.map((name) => (
								<div key={name} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
									<span
										style={{
											width: 26,
											height: 26,
											borderRadius: 7,
											flex: '0 0 auto',
											background: `var(${name})`,
											border: `1px solid ${T.bd}`,
										}}
									/>
									<span
										style={{
											flex: 1,
											font: `11.5px ${T.mono}`,
											color: T.sub,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
										}}
									>
										{name}
									</span>
									<span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{tokenValue(name)}</span>
								</div>
							))}
						</div>
					</div>
				))}
			</Panel>
			<Panel title="Live preview">
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 12,
						padding: 16,
						borderRadius: 12,
						background: T.bg,
						border: `1px solid ${T.bd}`,
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
						<span
							style={{
								width: 30,
								height: 30,
								borderRadius: 7,
								background: T.acc,
								color: T.accFg,
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							<Icon name="dice" size="sm" />
						</span>
						<span style={{ font: `700 15px ${T.disp}` }}>Sample surface</span>
					</div>
					<HPBar current={27} max={38} label="Mara Quill" />
					<div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
						<Badge status="success" icon="check">
							Saved
						</Badge>
						<Badge status="warning" icon="warning">
							Stale
						</Badge>
						<Badge status="error" icon="close">
							Conflict
						</Badge>
						<VisibilityChip level="dm-only" compact />
					</div>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
						Body copy renders in the secondary text token. Numbers like{' '}
						<span style={mono}>1d20+7</span> use the mono face.
					</div>
				</div>
			</Panel>
		</div>
	);
}
