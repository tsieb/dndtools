import { Select } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { SUPPORTED_LOCALES, useI18n } from '../../i18n';
/* ---- Language & region (REAL — the app-wide i18n locale, applied immediately) -------------------- */
export function SettingsLanguage() {
	const { locale, setLocale, t } = useI18n();
	return (
		<Panel title={t('settings.language.title')}>
			<div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
				<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
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
						label: `${option.nativeLabel} (${option.label})`,
					}))}
				/>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
					{t('settings.language.appliesImmediately')}
				</div>
			</div>
		</Panel>
	);
}
