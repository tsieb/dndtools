import { useState } from 'react';
import { useI18n } from '../../i18n';
import { Panel, Seg, SetRow, T } from '../../app/screen-kit';
import { PREV_THEME_KEY, setDocAttr, writeLocal } from './shared';
import { ExperienceComplexity } from './Experience';
/* ---- Appearance (PERSISTED DISPLAY PREFS — theme/density/motion `data-*` attrs) ----------------- */
export function SettingsAppearance() {
	const { t } = useI18n();
	const [theme, setTheme] = useState<string>(
		document.documentElement.getAttribute('data-theme') || 'tavern',
	);
	const [density, setDensity] = useState<string>(
		document.documentElement.getAttribute('data-density') || 'standard',
	);
	const [motion, setMotion] = useState<string>(
		document.documentElement.getAttribute('data-motion') || 'full',
	);
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title={t('settings.appearance.title')} style={{ gap: 0 }}>
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
					{t('settings.appearance.intro')}
				</div>
				<SetRow
					label={t('settings.appearance.theme')}
					help={t('settings.appearance.themeHelp')}
					control={
						<Seg
							value={theme}
							ariaLabel={t('settings.appearance.theme')}
							onChange={(v) => {
								// Remember where we came from, exactly as the Accessibility switch does.
								// Without this, reaching high contrast through THIS control left no
								// restore point, so the switch below later dropped a Parchment reader on
								// Tavern — the same silent preference loss, through the other door.
								if (v === 'high-contrast' && theme !== 'high-contrast')
									writeLocal(PREV_THEME_KEY, theme);
								setTheme(v);
								setDocAttr('data-theme', 'dndtools:react:theme', v);
							}}
							options={[
								{ value: 'tavern', label: t('settings.appearance.themeTavern') },
								{ value: 'parchment', label: t('settings.appearance.themeParchment') },
								{ value: 'high-contrast', label: t('settings.appearance.themeHighContrast') },
							]}
						/>
					}
				/>
				<SetRow
					label={t('settings.appearance.density')}
					help={t('settings.appearance.densityHelp')}
					control={
						<Seg
							value={density}
							ariaLabel={t('settings.appearance.densityLabel')}
							onChange={(v) => {
								setDensity(v);
								setDocAttr('data-density', 'dndtools:react:density', v);
							}}
							options={[
								{ value: 'standard', label: t('settings.appearance.densityStandard') },
								{ value: 'comfortable', label: t('settings.appearance.densityComfortable') },
								{ value: 'compact', label: t('settings.appearance.densityCompact') },
							]}
						/>
					}
				/>
				<SetRow
					label={t('settings.appearance.motion')}
					help={t('settings.appearance.motionHelp')}
					control={
						<Seg
							value={motion}
							ariaLabel={t('settings.appearance.motion')}
							onChange={(v) => {
								setMotion(v);
								setDocAttr('data-motion', 'dndtools:react:motion', v);
							}}
							options={[
								{ value: 'full', label: t('settings.appearance.motionFull') },
								{ value: 'reduced', label: t('settings.appearance.motionReduced') },
							]}
						/>
					}
				/>
			</Panel>

			<ExperienceComplexity />
		</div>
	);
}
