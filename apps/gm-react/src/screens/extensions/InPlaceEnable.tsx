import { useState } from 'react';
import { evaluateWidgetPackageAuthorTrust, type WidgetLibraryEntry } from '@dndtools/core';
import { Button, Toaster } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';

/**
 * RC-WID-6.2 — the gallery's in-place "Enable": its own list row under a library row that is dimmed
 * because its package is off. Offered to the DM only for a package already trusted, or one the
 * author-trust rule clears (what this builder would have installed enabled). A package with code or
 * a permission is never switched on from here; it still goes through review.
 */
export function InPlaceEnable({
	entry,
	onEnabled,
}: {
	entry: WidgetLibraryEntry;
	onEnabled: (entry: WidgetLibraryEntry) => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [busy, setBusy] = useState(false);
	const dmId = runtime.defaultActorId;
	const record = runtime.state.widgets.packages[entry.packageId];
	const offer =
		runtime.state.permissions.actors[dmId]?.role === 'dm' &&
		!runtime.preview &&
		!entry.availability.available &&
		!!record &&
		!record.enabled &&
		!record.removedAt &&
		(record.trust.state === 'trusted' ||
			(record.trust.state === 'unreviewed' &&
				evaluateWidgetPackageAuthorTrust(record.package).eligible));
	if (!offer) return null;
	const enable = () => {
		if (busy) return;
		setBusy(true);
		void runtime
			.dispatch({
				type: 'widget.package.enable',
				actorId: dmId,
				payload: { packageId: entry.packageId },
			})
			.then((result) =>
				result.status === 'accepted' ? onEnabled(entry) : Toaster.error(result.rejection.message),
			)
			.catch((error: unknown) =>
				Toaster.error(error instanceof Error ? error.message : String(error)),
			)
			.finally(() => setBusy(false));
	};
	return (
		<li style={{ paddingLeft: 'var(--space-4)' }}>
			<Button size="sm" variant="secondary" icon="check" disabled={busy} onClick={enable}>
				{t('boardCanvas.add.enable', { name: entry.displayName })}
			</Button>
		</li>
	);
}
