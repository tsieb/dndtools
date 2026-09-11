import { useI18n } from '../../i18n';
import { LegalPage } from './LegalPage';
import { TERMS_OF_SERVICE } from './legalContent';

/** `#/legal/terms` — the public Terms of Service (no account, no onboarding, no shell). */
export function Terms() {
	const { t } = useI18n();
	return <LegalPage doc={TERMS_OF_SERVICE} title={t('legal.terms.title')} />;
}
