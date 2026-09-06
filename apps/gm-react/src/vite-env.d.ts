/// <reference types="vite/client" />

// The design-package DS components ship as ESM JSX (untyped). Allow importing them as modules;
// they are vendored design source consumed loosely (props validated at runtime), not app code.
declare module '*.jsx';

// RC-UX-3.4 — the Help menu's "What's new" section reads the repo's own CHANGELOG.md as a raw
// string (Vite's `?raw` import suffix) rather than a duplicated/generated copy.
declare module '*.md?raw' {
	const content: string;
	export default content;
}

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
	readonly VITE_APP_API_URL?: string;
	/** Public HTTPS SPA entry used for join/wiki links in packaged Electron builds. */
	readonly VITE_PUBLIC_APP_URL?: string;
	/** Space-separated HTTPS origins mirrored in CSP; hosted AI calls are denied when this is empty. */
	readonly VITE_AI_ALLOWED_ORIGINS?: string;

	// Google Docs vault-source OAuth client id (WS-7). Absent ⇒ the Google Docs source option
	// is hidden entirely (fail-closed); see docs/runbooks/google-oauth-setup.md.
	readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
