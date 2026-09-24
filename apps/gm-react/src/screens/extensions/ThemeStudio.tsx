import { useMemo, useState } from 'react';
import { Badge, HPBar, Icon, SegmentedControl, VisibilityChip } from '../../ds';
import { Panel, T, eb, mono } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { applyThemePreference, type ThemePreset } from '../../platform/theme';
import { useI18n, type MessageKey } from '../../i18n';

/* ---- Theme studio (REAL — persisted preset choice + the LIVE token values of the active preset) --- */
// Mirrors Settings → Appearance: the same stored preference prepaint.js restores, applied through the
// same platform helper so the native color-scheme (scrollbars, form controls) stays in sync.
// The preset names are the same ones Settings → Appearance shows, so they reuse those keys rather
// than spelling the five theme names a second time per locale.
const THEME_PRESETS: { id: ThemePreset; label: MessageKey; desc: MessageKey }[] = [
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
		id: 'scholar',
		label: 'settings.appearance.themeScholar',
		desc: 'extensions.theme.scholarDesc',
	},
	{
		id: 'dungeon',
		label: 'settings.appearance.themeDungeon',
		desc: 'extensions.theme.dungeonDesc',
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
	const applyTheme = (v: string) => setTheme(applyThemePreference(v));
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
				gap: 'var(--space-4)',
				alignItems: 'start',
			}}
		>
			<Panel
				title={t('extensions.theme.presetTitle')}
				action={<Badge status="neutral">{t('extensions.theme.active', { theme })}</Badge>}
			>
				<div style={{ marginBottom: 'var(--space-3)' }}>
					<SegmentedControl
						ariaLabel={t('extensions.theme.presetTitle')}
						value={theme}
						onChange={applyTheme}
						options={THEME_PRESETS.map((p) => ({ value: p.id, label: t(p.label) }))}
					/>
					<div
						style={{
							font: `var(--text-xs) ${T.sans}`,
							color: T.sub,
							marginTop: 'var(--space-1-5)',
						}}
					>
						{t(THEME_PRESETS.find((p) => p.id === theme)?.desc ?? 'extensions.theme.tavernDesc')}
					</div>
				</div>
				<div
					style={{
						font: `var(--text-xs)/1.5 ${T.sans}`,
						color: T.sub,
						marginBottom: 'var(--space-3)',
					}}
				>
					{t('extensions.theme.presetHelp')}
				</div>
				{TOKEN_GROUPS.map((g) => (
					<div key={g.label} style={{ marginBottom: 'var(--space-3)' }}>
						<div style={{ ...eb, marginBottom: 'var(--space-2)' }}>{t(g.label)}</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
							{g.tokens.map((name) => (
								<div
									key={name}
									style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
								>
									<span
										style={{
											width: 26,
											height: 26,
											borderRadius: 'var(--radius-md)',
											flex: '0 0 auto',
											background: `var(${name})`,
											border: `1px solid ${T.bd}`,
										}}
									/>
									<span
										style={{
											flex: 1,
											font: `var(--text-xs) ${T.mono}`,
											color: T.sub,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
										}}
									>
										{name}
									</span>
									<span style={{ font: `var(--text-xs) ${T.mono}`, color: T.sub }}>
										{tokenValue(name)}
									</span>
								</div>
							))}
						</div>
					</div>
				))}
			</Panel>
			<Panel title={t('extensions.theme.previewTitle')}>
				<div
					data-testid="theme-preview-sample"
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-3)',
						padding: 'var(--space-4)',
						borderRadius: 'var(--radius-lg)',
						background: T.bg,
						border: `1px solid ${T.bd}`,
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
						<span
							style={{
								width: 30,
								height: 30,
								borderRadius: 'var(--radius-md)',
								background: T.acc,
								color: T.accFg,
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							<Icon name="dice" size="sm" />
						</span>
						<span style={{ font: `700 var(--text-base) ${T.sans}` }}>
							{t('extensions.theme.sampleSurface')}
						</span>
					</div>
					<HPBar current={27} max={38} label={t('extensions.theme.sampleName')} />
					<div style={{ display: 'flex', gap: 'var(--space-1-5)', flexWrap: 'wrap' }}>
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
					<div style={{ font: `var(--text-sm)/1.55 ${T.sans}`, color: T.sub }}>
						{t('extensions.theme.sampleBodyBefore')} <span style={mono}>1d20+7</span>{' '}
						{t('extensions.theme.sampleBodyAfter')}
					</div>
				</div>
			</Panel>
		</div>
	);
}
