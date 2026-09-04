import { useState } from 'react';
import { Panel, Seg, SetRow, T } from '../../app/screen-kit';
import { PREV_THEME_KEY, setDocAttr, writeLocal } from './shared';
import { ExperienceComplexity } from './Experience';
/* ---- Appearance (PERSISTED DISPLAY PREFS — theme/density/motion `data-*` attrs) ----------------- */
export function SettingsAppearance() {
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
			<Panel title="Appearance" style={{ gap: 0 }}>
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
					Changes apply immediately and stay with this device.
				</div>
				<SetRow
					label="Theme"
					help="Candle-lit dark, warm vellum, or the accessibility floor."
					control={
						<Seg
							value={theme}
							ariaLabel="Theme"
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
								{ value: 'tavern', label: 'Tavern' },
								{ value: 'parchment', label: 'Parchment' },
								{ value: 'high-contrast', label: 'High contrast' },
							]}
						/>
					}
				/>
				<SetRow
					label="Density"
					help="Comfortable enlarges controls for play at the table; Compact tightens them."
					control={
						<Seg
							value={density}
							ariaLabel="Interface density"
							onChange={(v) => {
								setDensity(v);
								setDocAttr('data-density', 'dndtools:react:density', v);
							}}
							options={[
								{ value: 'standard', label: 'Standard' },
								{ value: 'comfortable', label: 'Comfortable' },
								{ value: 'compact', label: 'Compact' },
							]}
						/>
					}
				/>
				<SetRow
					label="Motion"
					help="Reduce collapses transitions and stops looping animations."
					control={
						<Seg
							value={motion}
							ariaLabel="Motion"
							onChange={(v) => {
								setMotion(v);
								setDocAttr('data-motion', 'dndtools:react:motion', v);
							}}
							options={[
								{ value: 'full', label: 'Full' },
								{ value: 'reduced', label: 'Reduced' },
							]}
						/>
					}
				/>
			</Panel>

			<ExperienceComplexity />
		</div>
	);
}
