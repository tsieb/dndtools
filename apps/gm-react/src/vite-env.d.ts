/// <reference types="vite/client" />

// The design-package DS components ship as ESM JSX (untyped). Allow importing them as modules;
// they are vendored design source consumed loosely (props validated at runtime), not app code.
declare module '*.jsx';

interface ImportMetaEnv {
	// Set to '1' by the demo build (`build:demo`) so the app boots straight into the seeded sample
	// campaign, skipping the first-run onboarding overlay. Unset (undefined) in the standard build.
	readonly VITE_DEMO_MODE?: string;

	// Cloud coordinates, injected from .env.local (written by scripts/pull-cloud-env.mjs from SSM).
	// All optional: absent ⇒ the app runs local-first with every cloud entry point hidden.
	readonly VITE_CLOUD_REGION?: string;
	readonly VITE_COGNITO_USER_POOL_ID?: string;
	readonly VITE_COGNITO_CLIENT_ID?: string;
	readonly VITE_SIGNALING_WS_URL?: string;
	readonly VITE_SYNC_API_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
