/**
 * Hourly/daily backup scheduler for the Electron main process.
 *
 * Starts a setInterval-based timer when a vault opens and clears it when the
 * vault closes or the app quits.  Only 'hourly' and 'daily' cadences require a
 * timer; 'on-close' is handled in the before-quit handler in main.ts and
 * 'manual' requires no automation.
 */

import type { FileSystemAdapter } from '../mcp/storage.js';

type GetAdapter = () => FileSystemAdapter | null;

const MS_PER_HOUR = 60 * 60 * 1_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

let timerId: ReturnType<typeof setInterval> | null = null;

function intervalForCadence(cadence: string): number | null {
	if (cadence === 'hourly') return MS_PER_HOUR;
	if (cadence === 'daily') return MS_PER_DAY;
	return null;
}

function armTimer(ms: number, cadence: string, getAdapter: GetAdapter): void {
	timerId = setInterval(
		() =>
			void getAdapter()
				?.createSafetySnapshot(`auto-${cadence}`)
				.catch(() => undefined),
		ms,
	);
}

/**
 * Start the scheduler for the newly-opened vault.
 * Reads the current cadence setting and arms the timer if needed.
 * Any previously running timer is stopped first.
 */
export function start(
	_vaultDir: string,
	getAdapter: GetAdapter,
	getCadence: () => Promise<string | null>,
): void {
	stop();
	void getCadence()
		.catch(() => null)
		.then((cadence) => {
			const ms = cadence ? intervalForCadence(cadence) : null;
			if (ms !== null) armTimer(ms, cadence!, getAdapter);
		});
}

/**
 * Stop the scheduler, clearing any active timer.
 * Safe to call when no timer is running.
 */
export function stop(): void {
	if (timerId !== null) {
		clearInterval(timerId);
		timerId = null;
	}
}

/**
 * Update the scheduled interval when the user changes the backup cadence
 * setting.  Restarts the timer immediately with the new interval.
 */
export function updateCadence(cadence: string, getAdapter: GetAdapter): void {
	stop();
	const ms = intervalForCadence(cadence);
	if (ms !== null) armTimer(ms, cadence, getAdapter);
}
