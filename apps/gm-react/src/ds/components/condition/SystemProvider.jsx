import React, { createContext, useContext, useMemo } from 'react';
import { DEFAULT_CONDITIONS, conditionRegistry } from './conditions-catalog.js';

/**
 * RC-SYS-2.3 — the SYSTEM PROVIDER: the active rules package's condition catalog, put in context at
 * mount so every badge, tracker and picker draws the conditions the CAMPAIGN'S system declares
 * rather than a 5e table baked into the design system.
 *
 * The design system stays framework-pure — it knows nothing about the core, the runtime or storage.
 * The app hands it a plain array of `{ key, label, icon, severity }` entries (the shape
 * `SystemCondition` already has in `packages/core/src/state/system-package.ts`); with no provider
 * mounted, or with a package that declares no conditions, consumers fall back to
 * {@link DEFAULT_CONDITIONS} for RENDERING only, so a legacy key still draws a real badge instead of
 * a blank chip. Whether a control is OFFERED is a separate question — see `conditions` below, which
 * is empty for a package with no conditions and is what a picker must gate on.
 */

const SystemConditionsCtx = createContext(null);

/**
 * What consumers see with NO provider mounted (a design-system story, a unit test, a screen rendered
 * outside the app shell): the default table, offered in full. Only a package that ACTIVELY declares
 * no conditions empties the list — absence of a provider is not evidence of a condition-less system.
 */
const FALLBACK_CATALOG = Object.freeze({
	conditions: Object.freeze(
		Object.entries(DEFAULT_CONDITIONS).map(([key, def]) => ({ key, ...def })),
	),
	registry: DEFAULT_CONDITIONS,
});

/**
 * SystemProvider — publishes the active package's conditions to the design system. `conditions` is
 * the package's authored array; pass the package's own order, because that order is what a picker
 * lists and a DM authored it deliberately.
 */
export function SystemProvider({ conditions, children }) {
	const value = useMemo(() => {
		const list = Array.isArray(conditions) ? conditions.filter((c) => c && c.key) : [];
		return { conditions: list, registry: conditionRegistry(list) };
	}, [conditions]);
	return <SystemConditionsCtx.Provider value={value}>{children}</SystemConditionsCtx.Provider>;
}

/**
 * The condition catalog for the active package: `conditions` (authored order — EMPTY when the
 * package declares none, which is how a picker knows to hide itself) and `registry` (key → label /
 * icon / tone, used for rendering, which falls back to the built-in default so an unknown key still
 * draws something honest).
 */
export function useConditionCatalog() {
	const ctx = useContext(SystemConditionsCtx);
	return ctx ?? FALLBACK_CATALOG;
}

/** Look a key up in the active package first, then the built-in default. Never throws. */
export function useConditionDef(key) {
	const { registry } = useConditionCatalog();
	if (!key) return undefined;
	return registry[key] || DEFAULT_CONDITIONS[key];
}
