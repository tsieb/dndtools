import { Switch } from '../../ds';
import { useMarkGmOnly, setMarkGmOnly } from '../../platform/preferences';
import { useState } from 'react';
import { useI18n } from '../../i18n';
import { Panel, Seg, SetRow, T } from '../../app/screen-kit';
import { PREV_THEME_KEY, setDocAttr, writeLocal } from './shared';
import { ExperienceComplexity } from './Experience';
import { readThemePreference } from '../../platform/theme';
import {
	PREFERENCE_KEYS,
	readProseWidthPreference,
	isProseWidth,
	type ProseWidth,
} from '../../platform/preferences';
/* ---- Appearance (PERSISTED DISPLAY PREFS — theme/density/motion `data-*` attrs) ----------------- */
export function SettingsAppearance() {
	const { t } = useI18n();
	const markGmOnly = useMarkGmOnly();
	// The stored choice, not the painted preset: "System" paints parchment or tavern, and the picker
	// must still show that the user asked to follow the device.
	const [theme, setTheme] = useState<string>(readThemePreference);
	const [density, setDensity] = useState<string>(
		document.documentElement.getAttribute('data-density') || 'standard',
	);
	const [motion, setMotion] = useState<string>(
		document.documentElement.getAttribute('data-motion') || 'full',
	);
	const [proseWidth, setProseWidth] = useState<ProseWidth>(readProseWidthPreference);
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
								{ value: 'scholar', label: t('settings.appearance.themeScholar') },
								{ value: 'dungeon', label: t('settings.appearance.themeDungeon') },
								{ value: 'high-contrast', label: t('settings.appearance.themeHighContrast') },
								{ value: 'system', label: t('settings.appearance.themeSystem') },
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
					label={t('settings.appearance.proseWidth')}
					help={t('settings.appearance.proseWidthHelp')}
					control={
						<Seg
							value={proseWidth}
							ariaLabel={t('settings.appearance.proseWidth')}
							onChange={(v) => {
								if (!isProseWidth(v)) return;
								setProseWidth(v);
								setDocAttr('data-prose-width', PREFERENCE_KEYS.proseWidth, v);
							}}
							options={[
								{ value: 'comfortable', label: t('settings.appearance.proseWidthComfortable') },
								{ value: 'wide', label: t('settings.appearance.proseWidthWide') },
								{ value: 'full', label: t('settings.appearance.proseWidthFull') },
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
				<SetRow
					label={t('settings.appearance.markGmOnly')}
					help={t('settings.appearance.markGmOnlyHelp')}
					control={
						<Switch
							checked={markGmOnly}
							aria-label={t('settings.appearance.markGmOnly')}
							onChange={() => setMarkGmOnly(!markGmOnly)}
						/>
					}
				/>
			</Panel>

			<ExperienceComplexity />
		</div>
	);
}
