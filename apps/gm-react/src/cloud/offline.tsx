import { useEffect, useState, type CSSProperties } from 'react';
import { Callout } from '../ds';
import { isOnline, subscribeOnline } from '../platform/preferences';
import { useI18n, type MessageKey } from '../i18n';

/**
 * RC-PLT-2.4 — the honest network indicator every cloud-only control wears.
 *
 * The vault is local-first: notes, characters, maps, scenes and audio presets are all created,
 * edited and re-read with no network at all (`tests/e2e/pwa-offline.spec.ts` proves each one).
 * A minority of controls are NOT like that — publishing a module, minting an invite, opening the
 * billing portal, revoking a device, pushing to Google Docs. Those need a round trip, and offline
 * they can only fail. Before this module they looked exactly as live as the local ones, so the
 * only way to discover the difference was to press one and read the error.
 *
 * ## Why soft-disable rather than `disabled`
 *
 * A natively `disabled` button leaves the tab order, and with it goes its own `title` — so the
 * one sentence explaining WHY it cannot be pressed becomes unreachable by exactly the people who
 * most need it announced. Both `Button` and `IconButton` already implement the alternative: a
 * truthy `aria-disabled` renders the control as unavailable (0.5 opacity, `not-allowed` cursor)
 * and swallows activation, while keeping it focusable and readable. So `offlineProps` sets
 * `aria-disabled` plus the reason, never `disabled`.
 *
 * ## What this does NOT claim
 *
 * `navigator.onLine === false` is trustworthy: there is no network interface, so a cloud call
 * cannot succeed. The true case is much weaker — an interface exists, nothing more. A captive
 * portal, dead DNS, or an outage at the service all report "online". So this gate only ever
 * ADDS an offline indicator; it never suppresses, retries or reinterprets a failure that a
 * request actually returned. Server errors stay errors.
 */

/** Live connectivity as React state, re-rendering the caller on every flip. */
export function useOnlineStatus(): boolean {
	const [online, setOnline] = useState<boolean>(isOnline);
	useEffect(() => subscribeOnline(setOnline), []);
	return online;
}

/**
 * Props spread onto a control whose activation requires a cloud round trip. Empty while online,
 * so an online render is byte-for-byte what it was before the gate existed.
 *
 * `data-cloud-offline` is the machine-readable half: the e2e spec counts guarded controls with it,
 * which is how "EVERY cloud-only control" becomes a checkable claim rather than a promise.
 */
export type CloudOfflineProps =
	| Record<string, never>
	| { 'aria-disabled': true; 'data-cloud-offline': 'true'; title: string };

export interface CloudActions {
	/** True when the browser reports no network. */
	offline: boolean;
	/** Spread onto every cloud-only control in the subtree. */
	offlineProps: CloudOfflineProps;
	/**
	 * Guard for the handlers a spread cannot reach — an `onSubmit`, an Enter-key shortcut, an
	 * effect that would fire a fetch. `Button` already swallows its own click when soft-disabled,
	 * so this is only for the paths that bypass it.
	 */
	blocked: boolean;
	/**
	 * The look `Button` gives itself when soft-disabled, for the native `<button>`s that do not
	 * (the live-table dialogs in `net/`). Empty while online. Pair it with `offlineProps` and a
	 * `blocked` guard in the handler — a native button swallows nothing on its own.
	 */
	offlineStyle: CSSProperties;
}

const NO_PROPS: Record<string, never> = {};
const NO_STYLE: CSSProperties = {};
const SOFT_DISABLED: CSSProperties = { opacity: 0.5, cursor: 'not-allowed' };

function actionsFor(online: boolean, reason: string): CloudActions {
	return {
		offline: !online,
		blocked: !online,
		offlineProps: online
			? NO_PROPS
			: { 'aria-disabled': true, 'data-cloud-offline': 'true', title: reason },
		offlineStyle: online ? NO_STYLE : SOFT_DISABLED,
	};
}

/**
 * The gate. `reason` names what the control needs, so the tooltip can be specific ("Publishing
 * needs a connection") instead of a generic outage banner repeated 30 times.
 */
export function useCloudActions(reason: MessageKey = 'cloud.offline.action'): CloudActions {
	const { t } = useI18n();
	return actionsFor(useOnlineStatus(), t(reason));
}

/**
 * The same gate for a surface that authors its own copy instead of reading the catalog.
 *
 * `AuthModal.tsx` is written in literal English throughout and has never depended on
 * `I18nProvider`; routing its one tooltip through `useI18n` would add that dependency to a
 * component that does not otherwise need it — and would break it anywhere it is mounted outside
 * the provider. Same behaviour, same attributes, caller-supplied string.
 */
export function useCloudActionsFor(reason: string): CloudActions {
	return actionsFor(useOnlineStatus(), reason);
}

/**
 * The prose half, shown once per panel that holds cloud-only controls. The per-control tooltip
 * says a control is unavailable; this says the vault itself is fine, which is the part a DM
 * mid-session actually needs to know.
 *
 * `role="status"` (not `alert`): losing the network is worth announcing once, politely, without
 * interrupting whatever the DM is reading.
 */
export function CloudOfflineNotice({ body }: { body?: MessageKey } = {}) {
	const { t } = useI18n();
	return <OfflineNotice text={t(body ?? 'cloud.offline.notice')} />;
}

/** The catalog-free notice, for the same reason `useCloudActionsFor` exists. */
export function CloudOfflineNoticeFor({ text }: { text: string }) {
	return <OfflineNotice text={text} />;
}

function OfflineNotice({ text }: { text: string }) {
	const online = useOnlineStatus();
	if (online) return null;
	return (
		<Callout tone="warning" role="status" data-cloud-offline-notice="true">
			{text}
		</Callout>
	);
}
