import { settingsStorageState } from '$lib/state/settings-storage.svelte.js';
import { DEFAULT_WORLD_CALENDAR, normalizeWorldCalendar } from '$lib/domain/world-calendar.js';
import type { WorldCalendar } from '$lib/types/world-calendar.js';

class WorldCalendarState {
	calendar = $state<WorldCalendar>(normalizeWorldCalendar(DEFAULT_WORLD_CALENDAR));
	loading = $state(false);
	saving = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);

	async load(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			this.calendar = await settingsStorageState.getWorldCalendar();
			this.loaded = true;
		} catch (error) {
			this.error = String(error);
		} finally {
			this.loading = false;
		}
	}

	setCached(calendar: WorldCalendar): void {
		this.calendar = normalizeWorldCalendar(calendar);
		this.loaded = true;
	}

	async advance(days: number): Promise<void> {
		this.saving = true;
		this.error = null;
		try {
			this.calendar = await settingsStorageState.advanceWorldDate(days);
			this.loaded = true;
		} catch (error) {
			this.error = String(error);
		} finally {
			this.saving = false;
		}
	}

	async setCurrentDayOffset(dayOffset: number): Promise<void> {
		this.saving = true;
		this.error = null;
		try {
			this.calendar = await settingsStorageState.setCurrentWorldDate(dayOffset);
			this.loaded = true;
		} catch (error) {
			this.error = String(error);
		} finally {
			this.saving = false;
		}
	}
}

export const worldCalendarState = new WorldCalendarState();
