import { useI18n } from '../../i18n';
import { PLAN_CARDS, type PlanCard } from '../../cloud/entitlements';

const COPY = {
	'Local-first, forever free': 'upgrade.planCopy.localFirst',
	'On-device campaign vault': 'upgrade.planCopy.vault',
	'All table tools, maps & fog': 'upgrade.planCopy.tableTools',
	'Manual and nearby-device play': 'upgrade.planCopy.nearbyPlay',
	'Bring-your-own AI assistant': 'upgrade.planCopy.ownAssistant',
	'Browse community modules': 'upgrade.planCopy.community',
	'Encrypted off-device backup': 'upgrade.planCopy.backup',
	'Everything in Hearth': 'upgrade.planCopy.includesHearth',
	'Manual restore with the same vault key': 'upgrade.planCopy.restore',
	'Internet remote play': 'upgrade.planCopy.remotePlay',
	'1 co-DM seat': 'upgrade.planCopy.oneCoDm',
	'Publishing and larger tables': 'upgrade.planCopy.publishing',
	'Everything in Lantern': 'upgrade.planCopy.includesLantern',
	'3 co-DM seats': 'upgrade.planCopy.threeCoDms',
	'Publish public campaign wikis': 'upgrade.planCopy.publicWikis',
	'Campaign publishing controls': 'upgrade.planCopy.publishControls',
} as const;

/** Translate presentation copy without changing plan ids, prices or server entitlements. */
export function usePlanCards(): PlanCard[] {
	const { t } = useI18n();
	const copy = (value: string) => {
		const key = COPY[value as keyof typeof COPY];
		return key ? t(key) : value;
	};
	return PLAN_CARDS.map((plan) => ({
		...plan,
		tagline: copy(plan.tagline),
		features: plan.features.map(copy),
	}));
}
