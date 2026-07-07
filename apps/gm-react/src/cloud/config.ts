// Cloud configuration, read from Vite env at build time (same mechanism as
// VITE_DEMO_MODE). Values are injected per environment from SSM
// (/dndtools/<stage>/...) via scripts/pull-cloud-env.mjs, which writes .env.local.
//
// The app is LOCAL-FIRST: when these are absent (a plain `vite build` with no
// cloud env), `isCloudConfigured` is false and every cloud entry point stays
// hidden/disabled. Nothing here throws at import time.

export interface CloudConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  /** wss:// URL of the signaling API (append ?token=<cognito-id-token>). */
  signalingWsUrl: string;
  /** https:// base URL of the sync-api (E2EE cloud sync/backup); Authorization: <cognito-id-token>. */
  syncApiUrl: string;
}

function read(key: keyof ImportMetaEnv): string {
  const v = import.meta.env[key];
  return typeof v === 'string' ? v.trim() : '';
}

export const cloudConfig: CloudConfig = {
  region: read('VITE_CLOUD_REGION'),
  userPoolId: read('VITE_COGNITO_USER_POOL_ID'),
  userPoolClientId: read('VITE_COGNITO_CLIENT_ID'),
  signalingWsUrl: read('VITE_SIGNALING_WS_URL'),
  syncApiUrl: read('VITE_SYNC_API_URL'),
};

/** True only when every value needed to reach the cloud is present. */
export const isCloudConfigured: boolean = Boolean(
  cloudConfig.region &&
    cloudConfig.userPoolId &&
    cloudConfig.userPoolClientId &&
    cloudConfig.signalingWsUrl,
);

/** True when identity is configured (sign-in possible even if signaling isn't). */
export const isAuthConfigured: boolean = Boolean(
  cloudConfig.region && cloudConfig.userPoolId && cloudConfig.userPoolClientId,
);

/** True when the E2EE cloud-sync backend is reachable (identity + sync API present). */
export const isSyncConfigured: boolean = Boolean(isAuthConfigured && cloudConfig.syncApiUrl);
