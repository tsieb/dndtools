import { useMemo, type ReactNode } from 'react';
import { getActiveSystemForActor } from '@dndtools/core';
import { SystemProvider } from '../ds';
import { VocabularyProvider, useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * RC-SYS-2.3 — the bridge that feeds the design system's `SystemProvider` from the ACTIVE system
 * package, once, at the app root.
 *
 * The design system must stay framework-pure, so it takes plain condition data and knows nothing
 * about the core; this component is the only place that reads the core and hands it over. The read
 * is ACTOR-SCOPED (`getActiveSystemForActor`) like every other read in the app: the rules content
 * itself reaches a player identically to the DM — a player whose sheet hid its own conditions would
 * be unplayable — while the DM-only catalog of other installed packages stays out of it.
 *
 * Before the vault has loaded the runtime already holds the hydrated default package, so there is
 * no window where conditions are missing.
 *
 * RC-SYS-2.6 adds the package's VOCABULARY on the same read. Chrome, screens and copy call
 * `t('…')` as before; the placeholders those messages carry (`{gm}`, `{spell}`, `{levelUp}`) are
 * filled here, so switching the campaign to Generic renames the Game Master everywhere at once
 * instead of screen by screen.
 */
export function AppSystemProvider({ children }: { children: ReactNode }) {
	const runtime = useRuntime();
	const state = runtime.state;
	const { locale } = useI18n();
	const activePackage = useMemo(
		() =>
			getActiveSystemForActor(state.systems, state.permissions, runtime.activeActorId)
				.activePackage,
		[state.systems, state.permissions, runtime.activeActorId],
	);
	return (
		<SystemProvider conditions={activePackage.conditions}>
			<VocabularyProvider vocabulary={activePackage.vocabulary} locale={locale}>
				{children}
			</VocabularyProvider>
		</SystemProvider>
	);
}
