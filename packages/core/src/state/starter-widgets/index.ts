/**
 * The starter widget library (RC-WID-1.6).
 *
 * Seven packages that ship with the app and cover the shapes a table actually needs: one per
 * template family plus one sandboxed custom-code card. They replace the three placeholder shells the
 * widget manager used to install, which all scaffolded the same empty draft under different names —
 * three ways to install a widget that did nothing.
 *
 * A starter is an ORDINARY package. It is built by the same scaffolder a DM's own package goes
 * through, installed by the same `widget.package.install` command, validated by the same schema,
 * summarised by the same review, and enabled, reviewed, placed and removed exactly like anything
 * else. Nothing is fetched from anywhere and nothing here is privileged.
 */
export type { StarterWidgetEntry } from './shared';
export { STARTER_PLACEMENT, buildStarterWidgetPackage } from './shared';

import type { StarterWidgetEntry } from './shared';
import { COUNTDOWN_CLOCK_STARTER } from './countdown-clock';
import { LOOT_LEDGER_STARTER } from './loot-ledger';
import { NPC_QUICK_CARD_STARTER } from './npc-quick-card';
import { RUMOR_BOARD_STARTER } from './rumor-board';
import { TABLE_ROLLER_STARTER } from './table-roller';
import { TORCHLIGHT_STARTER } from './torchlight';
import { WEATHER_TRACKER_STARTER } from './weather-tracker';

export { COUNTDOWN_CLOCK_STARTER } from './countdown-clock';
export { LOOT_LEDGER_STARTER } from './loot-ledger';
export { NPC_QUICK_CARD_STARTER } from './npc-quick-card';
export { RUMOR_BOARD_STARTER } from './rumor-board';
export { TABLE_ROLLER_STARTER } from './table-roller';
export { TORCHLIGHT_STARTER } from './torchlight';
export { WEATHER_TRACKER_STARTER } from './weather-tracker';

/** The library, in the order the widget manager lists it: the ones a new table reaches for first. */
export const STARTER_WIDGET_LIBRARY: readonly StarterWidgetEntry[] = Object.freeze([
	TABLE_ROLLER_STARTER,
	COUNTDOWN_CLOCK_STARTER,
	WEATHER_TRACKER_STARTER,
	RUMOR_BOARD_STARTER,
	NPC_QUICK_CARD_STARTER,
	LOOT_LEDGER_STARTER,
	TORCHLIGHT_STARTER,
]);

/** One entry by package id, or `null` — an unknown id is not a starter, and is not guessed at. */
export function findStarterWidget(packageId: string): StarterWidgetEntry | null {
	return STARTER_WIDGET_LIBRARY.find((entry) => entry.packageId === packageId) ?? null;
}
