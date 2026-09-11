import { useI18n } from '../../i18n';
import { LegalPage } from './LegalPage';
import { PRIVACY_POLICY } from './legalContent';

/** `#/legal/privacy` — the public Privacy Policy (no account, no onboarding, no shell). */
export function Privacy() {
	const { t } = useI18n();
	return <LegalPage doc={PRIVACY_POLICY} title={t('legal.privacy.title')} />;
}
