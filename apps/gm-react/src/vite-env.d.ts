/// <reference types="vite/client" />

// The design-package DS components ship as ESM JSX (untyped). Allow importing them as modules;
// they are vendored design source consumed loosely (props validated at runtime), not app code.
declare module '*.jsx';

interface ImportMetaEnv {
	// Set to '1' by the demo build (`build:demo`) so the app boots straight into the seeded sample
	// campaign, skipping the first-run onboarding overlay. Unset (undefined) in the standard build.
	readonly VITE_DEMO_MODE?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
