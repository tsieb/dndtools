import { Button, Skeleton } from '../../ds';
import { Illustration } from '../../ds/illustrations';
import { T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import type { EntitlementsValue } from '../../cloud/entitlements';

/** Keep cached/offline prices readable while making their freshness explicit. */
export function PlanStatus({ ent }: { ent: EntitlementsValue }) {
	const { t } = useI18n();
	if (ent.loading)
		return (
			<div role="status" aria-live="polite">
				<p>{t('upgrade.loading')}</p>
				<Skeleton variant="list" rows={3} />
			</div>
		);
	if (!ent.serverBacked || ent.source === 'server') return null;
	return (
		<div
			role="status"
			style={{
				display: 'flex',
				alignItems: 'center',
				flexWrap: 'wrap',
				gap: T.space.three,
				padding: T.space.four,
				background: T.surf,
				borderRadius: T.radius.md,
			}}
		>
			<Illustration name="connection-lost" size={80} />
			<span style={{ flex: 1 }}>{t('upgrade.offlineRetry')}</span>
			<Button variant="secondary" onClick={() => void ent.refresh()}>
				{t('upgrade.retry')}
			</Button>
		</div>
	);
}
