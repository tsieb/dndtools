import { useEffect, useState } from 'react';
import { Select } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { catalogCoverage, loadCatalog, SUPPORTED_LOCALES, useI18n } from '../../i18n';
/* ---- Language & region (REAL — the app-wide i18n locale, applied immediately) -------------------- */
/** A language named in itself reads as a menu entry: "Español", not "español", and "English" once
 * rather than "English (English)". */
function displayName(code: string, nativeLabel: string): string {
	try {
		return nativeLabel.charAt(0).toLocaleUpperCase(code) + nativeLabel.slice(1);
	} catch {
		return nativeLabel;
	}
}

export function SettingsLanguage() {
	const { locale, setLocale, t } = useI18n();
	// The active locale's catalog loads through I18nProvider; the OTHER locales' coverage badges
	// below need their catalogs loaded too, or an unselected locale would read a false 0%.
	const [loaded, setLoaded] = useState(0);
	useEffect(() => {
		let cancelled = false;
		void Promise.all(SUPPORTED_LOCALES.map((option) => loadCatalog(option.code))).then(() => {
			if (!cancelled) setLoaded((count) => count + 1);
		});
		return () => {
			cancelled = true;
		};
	}, []);
	return (
		<Panel title={t('settings.language.title')}>
			<div style={{ display: 'grid', gap: T.space.three, maxWidth: 520 }}>
				<div style={{ font: `var(--text-sm)/1.55 ${T.sans}`, color: T.sub }}>
					{t('settings.language.help')}
				</div>
				<Select
					aria-label={t('settings.language.label')}
					value={locale}
					onChange={(event: { target: { value: string } }) =>
						setLocale(event.target.value as typeof locale)
					}
					options={SUPPORTED_LOCALES.map((option) => ({
						value: option.code,
						label:
							option.nativeLabel === option.label
								? displayName(option.code, option.nativeLabel)
								: `${displayName(option.code, option.nativeLabel)} (${option.label})`,
					}))}
				/>
				{/* RC-UX-1.4 — a community-maintained locale can be partial; showing coverage up front
				    means a DM discovers the gaps here, not one English fallback string at a time. */}
				<ul
					key={loaded}
					style={{
						display: 'grid',
						gap: T.space.one,
						margin: T.space.zero,
						padding: T.space.zero,
						listStyle: 'none',
						font: `var(--text-xs)/1.5 ${T.sans}`,
						color: T.sub,
					}}
				>
					{SUPPORTED_LOCALES.map((option) => {
						const coverage = Math.round(catalogCoverage(option.code) * 100);
						return (
							<li key={option.code} data-testid={`locale-coverage-${option.code}`}>
								{displayName(option.code, option.nativeLabel)} ·{' '}
								<span style={{ fontFamily: T.mono }}>
									{t('settings.language.coverage', { percent: coverage })}
								</span>
							</li>
						);
					})}
				</ul>
				<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
					{t('settings.language.appliesImmediately')}
				</div>
			</div>
		</Panel>
	);
}
