import { useMemo, useState } from 'react';
import { Badge, HPBar, Icon, SegmentedControl, VisibilityChip } from '../../ds';
import { Panel, T, eb, mono } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useI18n, type MessageKey } from '../../i18n';

/* ---- Theme studio (REAL — persisted preset choice + the LIVE token values of the active preset) --- */
// Mirrors Settings → Appearance: the same localStorage key index.html restores pre-paint, and the
// same dark-theme set so the native color-scheme (scrollbars, form controls) stays in sync.
const THEME_STORE_KEY = 'dndtools:react:theme';
const DARK_PRESETS = new Set(['tavern', 'high-contrast']);
// The preset names are the same ones Settings → Appearance shows, so they reuse those keys rather
// than spelling the three theme names a second time per locale.
const THEME_PRESETS: { id: string; label: MessageKey; desc: MessageKey }[] = [
	{
		id: 'tavern',
		label: 'settings.appearance.themeTavern',
		desc: 'extensions.theme.tavernDesc',
	},
	{
		id: 'parchment',
		label: 'settings.appearance.themeParchment',
		desc: 'extensions.theme.parchmentDesc',
	},
	{
		id: 'high-contrast',
		label: 'settings.appearance.themeHighContrast',
		desc: 'extensions.theme.highContrastDesc',
	},
];
// The semantic tokens the design system actually drives — read LIVE off the document, never authored.
const TOKEN_GROUPS: { label: MessageKey; tokens: string[] }[] = [
	{
		label: 'extensions.theme.groupSurfaces',
		tokens: [
			'--color-bg',
			'--color-surface',
			'--color-surface-raised',
			'--color-surface-sunken',
			'--color-border',
		],
	},
	{
		label: 'extensions.theme.groupText',
		tokens: ['--color-text-primary', '--color-text-secondary', '--color-text-tertiary'],
	},
	{
		label: 'extensions.theme.groupAccent',
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
	const { t } = useI18n();
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
			<Panel
				title={t('extensions.theme.presetTitle')}
				action={<Badge status="neutral">{t('extensions.theme.active', { theme })}</Badge>}
			>
				<div style={{ marginBottom: 14 }}>
					<SegmentedControl
						ariaLabel={t('extensions.theme.presetTitle')}
						value={theme}
						onChange={applyTheme}
						options={THEME_PRESETS.map((p) => ({ value: p.id, label: t(p.label) }))}
					/>
					<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 6 }}>
						{t(THEME_PRESETS.find((p) => p.id === theme)?.desc ?? 'extensions.theme.tavernDesc')}
					</div>
				</div>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 12 }}>
					{t('extensions.theme.presetHelp')}
				</div>
				{TOKEN_GROUPS.map((g) => (
					<div key={g.label} style={{ marginBottom: 14 }}>
						<div style={{ ...eb, marginBottom: 8 }}>{t(g.label)}</div>
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
			<Panel title={t('extensions.theme.previewTitle')}>
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
						<span style={{ font: `700 15px ${T.disp}` }}>
							{t('extensions.theme.sampleSurface')}
						</span>
					</div>
					<HPBar current={27} max={38} label={t('extensions.theme.sampleName')} />
					<div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
						<Badge status="success" icon="check">
							{t('extensions.theme.sampleSaved')}
						</Badge>
						<Badge status="warning" icon="warning">
							{t('extensions.theme.sampleStale')}
						</Badge>
						<Badge status="error" icon="close">
							{t('extensions.theme.sampleConflict')}
						</Badge>
						<VisibilityChip level="dm-only" compact />
					</div>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
						{t('extensions.theme.sampleBodyBefore')} <span style={mono}>1d20+7</span>{' '}
						{t('extensions.theme.sampleBodyAfter')}
					</div>
				</div>
			</Panel>
		</div>
	);
}
