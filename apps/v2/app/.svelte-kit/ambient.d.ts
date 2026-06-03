
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * _Unlike_ [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 * 
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * 
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 * 
 * You can override `.env` values from the command line like so:
 * 
 * ```sh
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module '$env/static/private' {
	export const SHELL: string;
	export const npm_command: string;
	export const COLORTERM: string;
	export const COREPACK_ENABLE_DOWNLOAD_PROMPT: string;
	export const HISTCONTROL: string;
	export const XDG_MENU_PREFIX: string;
	export const TERM_PROGRAM_VERSION: string;
	export const FNM_ARCH: string;
	export const QT_IM_MODULES: string;
	export const HOSTNAME: string;
	export const HISTSIZE: string;
	export const NODE: string;
	export const SSH_AUTH_SOCK: string;
	export const AWS_PROFILE: string;
	export const MEMORY_PRESSURE_WRITE: string;
	export const FNM_NODE_DIST_MIRROR: string;
	export const PLAYWRIGHT_TEST: string;
	export const XMODIFIERS: string;
	export const DESKTOP_SESSION: string;
	export const NO_AT_BRIDGE: string;
	export const GPG_TTY: string;
	export const EDITOR: string;
	export const PWD: string;
	export const XDG_SESSION_DESKTOP: string;
	export const LOGNAME: string;
	export const XDG_SESSION_TYPE: string;
	export const SYSTEMD_EXEC_PID: string;
	export const XAUTHORITY: string;
	export const SDL_VIDEO_MINIMIZE_ON_FOCUS_LOSS: string;
	export const VSCODE_GIT_ASKPASS_NODE: string;
	export const DEBUG_COLORS: string;
	export const GJS_DEBUG_TOPICS: string;
	export const GDM_LANG: string;
	export const HOME: string;
	export const USERNAME: string;
	export const COREPACK_ROOT: string;
	export const SSH_ASKPASS: string;
	export const LANG: string;
	export const FNM_COREPACK_ENABLED: string;
	export const LS_COLORS: string;
	export const XDG_CURRENT_DESKTOP: string;
	export const PLAYWRIGHT_TEST_BASE_URL: string;
	export const npm_package_version: string;
	export const MEMORY_PRESSURE_WATCH: string;
	export const WAYLAND_DISPLAY: string;
	export const FORCE_COLOR: string;
	export const GIT_ASKPASS: string;
	export const INVOCATION_ID: string;
	export const pnpm_config_verify_deps_before_run: string;
	export const MANAGERPID: string;
	export const INIT_CWD: string;
	export const CHROME_DESKTOP: string;
	export const STEAM_FRAME_FORCE_CLOSE: string;
	export const npm_lifecycle_script: string;
	export const GJS_DEBUG_OUTPUT: string;
	export const MOZ_GMP_PATH: string;
	export const VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
	export const GNOME_SETUP_DISPLAY: string;
	export const VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
	export const CLAUDE_CODE_SSE_PORT: string;
	export const XDG_SESSION_CLASS: string;
	export const ANDROID_HOME: string;
	export const TERM: string;
	export const npm_package_name: string;
	export const LESSOPEN: string;
	export const USER: string;
	export const VSCODE_GIT_IPC_HANDLE: string;
	export const CONDA_SHLVL: string;
	export const DISPLAY: string;
	export const npm_lifecycle_event: string;
	export const SHLVL: string;
	export const QT_IM_MODULE: string;
	export const FNM_VERSION_FILE_STRATEGY: string;
	export const MANAGERPIDFDID: string;
	export const npm_config_user_agent: string;
	export const PNPM_SCRIPT_SRC_DIR: string;
	export const npm_execpath: string;
	export const FC_FONTATIONS: string;
	export const XDG_RUNTIME_DIR: string;
	export const FNM_RESOLVE_ENGINES: string;
	export const NODE_PATH: string;
	export const DEBUGINFOD_URLS: string;
	export const npm_package_json: string;
	export const DEBUGINFOD_IMA_CERT_PATH: string;
	export const KDEDIRS: string;
	export const VSCODE_GIT_ASKPASS_MAIN: string;
	export const JOURNAL_STREAM: string;
	export const XDG_DATA_DIRS: string;
	export const GDK_BACKEND: string;
	export const BROWSER: string;
	export const PATH: string;
	export const npm_config_node_gyp: string;
	export const GDMSESSION: string;
	export const XDG_SESSION_EXTRA_DEVICE_ACCESS: string;
	export const DBUS_SESSION_BUS_ADDRESS: string;
	export const MAIL: string;
	export const FNM_DIR: string;
	export const FNM_MULTISHELL_PATH: string;
	export const GIO_LAUNCHED_DESKTOP_FILE_PID: string;
	export const npm_node_execpath: string;
	export const GIO_LAUNCHED_DESKTOP_FILE: string;
	export const FNM_LOGLEVEL: string;
	export const TERM_PROGRAM: string;
	export const NODE_ENV: string;
}

/**
 * Similar to [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Values are replaced statically at build time.
 * 
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * This module cannot be imported into client-side code.
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module '$env/dynamic/private' {
	export const env: {
		SHELL: string;
		npm_command: string;
		COLORTERM: string;
		COREPACK_ENABLE_DOWNLOAD_PROMPT: string;
		HISTCONTROL: string;
		XDG_MENU_PREFIX: string;
		TERM_PROGRAM_VERSION: string;
		FNM_ARCH: string;
		QT_IM_MODULES: string;
		HOSTNAME: string;
		HISTSIZE: string;
		NODE: string;
		SSH_AUTH_SOCK: string;
		AWS_PROFILE: string;
		MEMORY_PRESSURE_WRITE: string;
		FNM_NODE_DIST_MIRROR: string;
		PLAYWRIGHT_TEST: string;
		XMODIFIERS: string;
		DESKTOP_SESSION: string;
		NO_AT_BRIDGE: string;
		GPG_TTY: string;
		EDITOR: string;
		PWD: string;
		XDG_SESSION_DESKTOP: string;
		LOGNAME: string;
		XDG_SESSION_TYPE: string;
		SYSTEMD_EXEC_PID: string;
		XAUTHORITY: string;
		SDL_VIDEO_MINIMIZE_ON_FOCUS_LOSS: string;
		VSCODE_GIT_ASKPASS_NODE: string;
		DEBUG_COLORS: string;
		GJS_DEBUG_TOPICS: string;
		GDM_LANG: string;
		HOME: string;
		USERNAME: string;
		COREPACK_ROOT: string;
		SSH_ASKPASS: string;
		LANG: string;
		FNM_COREPACK_ENABLED: string;
		LS_COLORS: string;
		XDG_CURRENT_DESKTOP: string;
		PLAYWRIGHT_TEST_BASE_URL: string;
		npm_package_version: string;
		MEMORY_PRESSURE_WATCH: string;
		WAYLAND_DISPLAY: string;
		FORCE_COLOR: string;
		GIT_ASKPASS: string;
		INVOCATION_ID: string;
		pnpm_config_verify_deps_before_run: string;
		MANAGERPID: string;
		INIT_CWD: string;
		CHROME_DESKTOP: string;
		STEAM_FRAME_FORCE_CLOSE: string;
		npm_lifecycle_script: string;
		GJS_DEBUG_OUTPUT: string;
		MOZ_GMP_PATH: string;
		VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
		GNOME_SETUP_DISPLAY: string;
		VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
		CLAUDE_CODE_SSE_PORT: string;
		XDG_SESSION_CLASS: string;
		ANDROID_HOME: string;
		TERM: string;
		npm_package_name: string;
		LESSOPEN: string;
		USER: string;
		VSCODE_GIT_IPC_HANDLE: string;
		CONDA_SHLVL: string;
		DISPLAY: string;
		npm_lifecycle_event: string;
		SHLVL: string;
		QT_IM_MODULE: string;
		FNM_VERSION_FILE_STRATEGY: string;
		MANAGERPIDFDID: string;
		npm_config_user_agent: string;
		PNPM_SCRIPT_SRC_DIR: string;
		npm_execpath: string;
		FC_FONTATIONS: string;
		XDG_RUNTIME_DIR: string;
		FNM_RESOLVE_ENGINES: string;
		NODE_PATH: string;
		DEBUGINFOD_URLS: string;
		npm_package_json: string;
		DEBUGINFOD_IMA_CERT_PATH: string;
		KDEDIRS: string;
		VSCODE_GIT_ASKPASS_MAIN: string;
		JOURNAL_STREAM: string;
		XDG_DATA_DIRS: string;
		GDK_BACKEND: string;
		BROWSER: string;
		PATH: string;
		npm_config_node_gyp: string;
		GDMSESSION: string;
		XDG_SESSION_EXTRA_DEVICE_ACCESS: string;
		DBUS_SESSION_BUS_ADDRESS: string;
		MAIL: string;
		FNM_DIR: string;
		FNM_MULTISHELL_PATH: string;
		GIO_LAUNCHED_DESKTOP_FILE_PID: string;
		npm_node_execpath: string;
		GIO_LAUNCHED_DESKTOP_FILE: string;
		FNM_LOGLEVEL: string;
		TERM_PROGRAM: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * Similar to [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
