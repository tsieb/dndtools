// CLOUD-SYNC ENABLEMENT (client side of SYNC-017). The CORE owns the security decision: it evaluates the
// release-approved CloudSyncSecurityModel and returns whether cloud sync MAY be enabled. This module never
// decides security — it (a) passes the release-approved model to the core gate, (b) layers a DEVICE
// capability check (durable client-held key custody must be available on this device), and (c) records the
// user's opt-in intent device-locally. The core clamps `enabled` to `canEnable`, so a stored/forced flag
// can never bypass the model.
//
// Cloud sync is OFF by default and opt-in per the plan; the actual sync engine (Stage 3) consumes this gate.

import {
	DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL,
	evaluateCloudSyncGate,
	type CloudSyncGateResult,
} from '@dndtools/core';
import { vaultKeyManager } from './vaultKey';

const ENABLE_FLAG = 'dndtools:react:cloud-sync-enabled';

/** The device-local opt-in intent (a non-secret boolean; the core still gates whether it takes effect). */
export function cloudSyncIntent(): boolean {
	try {
		return typeof window !== 'undefined' && window.localStorage.getItem(ENABLE_FLAG) === 'true';
	} catch {
		return false;
	}
}

function setCloudSyncIntent(enabled: boolean): void {
	try {
		if (typeof window === 'undefined') return;
		if (enabled) window.localStorage.setItem(ENABLE_FLAG, 'true');
		else window.localStorage.removeItem(ENABLE_FLAG);
	} catch {
		/* localStorage unavailable (private mode) — intent simply doesn't persist */
	}
}

export interface CloudSyncStatus {
	/** The core gate result under the release-approved security model (source of truth for canEnable/enabled). */
	gate: CloudSyncGateResult;
	/** Whether THIS device can durably hold the client-held key (OS credential store present). */
	custodyAvailable: boolean;
	/** canEnable AND the device can honor client-held key custody. Fail-closed on web (no keychain). */
	canEnableOnThisDevice: boolean;
}

/**
 * Compute the cloud-sync gate for this device. Cloud sync can be enabled only when the core model permits
 * it AND the device can durably hold the client key. `gate.enabled` additionally requires the user's opt-in.
 */
export async function getCloudSyncStatus(): Promise<CloudSyncStatus> {
	const custodyAvailable = await vaultKeyManager.custodyAvailable();
	const gate = evaluateCloudSyncGate({
		securityModel: DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL,
		// Only claim "currently enabled" when the user opted in AND this device can hold the key.
		currentlyEnabled: cloudSyncIntent() && custodyAvailable,
	});
	return {
		gate,
		custodyAvailable,
		canEnableOnThisDevice: gate.canEnable && custodyAvailable,
	};
}

/**
 * Record the user's cloud-sync opt-in. Refuses fail-closed when the device cannot honor client-held key
 * custody (e.g. the web build with no OS keychain) or the core model does not permit enablement. Returns the
 * resulting status so the caller can reflect the (core-decided) effective state.
 */
export async function setCloudSyncEnabled(enabled: boolean): Promise<CloudSyncStatus> {
	if (enabled) {
		const status = await getCloudSyncStatus();
		if (!status.canEnableOnThisDevice) {
			throw new Error(
				status.custodyAvailable
					? 'Cloud sync cannot be enabled: the release-approved security model prerequisites are not met.'
					: 'Cloud sync cannot be enabled on this device: durable client-held key custody is unavailable (no OS credential store).',
			);
		}
	}
	setCloudSyncIntent(enabled);
	return getCloudSyncStatus();
}
