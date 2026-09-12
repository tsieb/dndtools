import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';

/**
 * LegalLinks — the "Privacy policy · Terms of service" link pair. Used by Settings › About and by
 * the Plans & cloud footer (Stripe Checkout shows buyers the same two URLs, so the app should link
 * to them from where money is discussed).
 */
export function LegalLinks({
	align = 'start',
	style,
}: {
	align?: 'start' | 'center';
	style?: CSSProperties;
}) {
	const { t } = useI18n();
	const link: CSSProperties = { color: T.sub, textDecoration: 'underline' };
	return (
		<nav
			aria-label={t('legal.docNav')}
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				justifyContent: align,
				gap: T.space.oneHalf,
				font: `12px ${T.sans}`,
				color: T.ter,
				...style,
			}}
		>
			<Link to="/legal/privacy" style={link}>
				{t('legal.privacy.title')}
			</Link>
			<span aria-hidden="true">·</span>
			<Link to="/legal/terms" style={link}>
				{t('legal.terms.title')}
			</Link>
		</nav>
	);
}
