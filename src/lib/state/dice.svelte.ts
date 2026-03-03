import { nanoid } from 'nanoid';
import { getStorage } from '$lib/platform/storage/index.js';
import {
	DiceExpressionError,
	normalizeDiceMacros,
	rollDiceExpression,
	type DiceRollDetail,
	type DiceRollResult,
} from '$lib/domain/dice.js';
import type { DiceMacro } from '$lib/types/settings.js';
import { nowISO } from '$lib/utils/date.js';

const MAX_HISTORY_ENTRIES = 200;

export type DiceRollSource = 'tray' | 'macro' | 'editor' | 'command_palette' | 'mcp';

export interface DiceRollHistoryEntry {
	id: string;
	at: string;
	source: DiceRollSource;
	expression: string;
	total: number;
	totalText: string;
	breakdown: string;
	markdownLine: string;
	rolls: DiceRollDetail[];
	macroId?: string;
	macroLabel?: string;
}

type DiceRollAttempt = { ok: true; entry: DiceRollHistoryEntry } | { ok: false; error: string };

type SaveMacroAttempt = { ok: true; macro: DiceMacro } | { ok: false; error: string };

class DiceState {
	history = $state<DiceRollHistoryEntry[]>([]);
	macros = $state<DiceMacro[]>([]);
	loadingMacros = $state(false);
	loadedMacros = $state(false);
	macroError = $state<string | null>(null);

	lastRoll = $derived.by(() => this.history[0] ?? null);
	quickMacros = $derived.by(() => this.macros.slice(0, 12));

	async ensureMacrosLoaded(): Promise<void> {
		if (this.loadedMacros || this.loadingMacros) return;
		await this.loadMacros();
	}

	async loadMacros(force = false): Promise<void> {
		if (this.loadingMacros) return;
		if (this.loadedMacros && !force) return;
		this.loadingMacros = true;
		this.macroError = null;
		try {
			const stored = await getStorage().getSetting('diceMacros');
			this.macros = normalizeDiceMacros(stored);
			this.loadedMacros = true;
		} catch (error) {
			this.macroError = String(error);
			this.macros = [];
			this.loadedMacros = true;
		} finally {
			this.loadingMacros = false;
		}
	}

	private async persistMacros(next: DiceMacro[]): Promise<void> {
		const normalized = normalizeDiceMacros(next);
		await getStorage().setSetting('diceMacros', normalized);
		this.macros = normalized;
	}

	async saveMacro(input: {
		id?: string;
		label: string;
		expression: string;
	}): Promise<SaveMacroAttempt> {
		await this.ensureMacrosLoaded();
		const id = input.id?.trim() ?? '';
		const label = input.label.trim();
		const expression = input.expression.trim();
		if (!label) {
			return { ok: false, error: 'Macro label is required.' };
		}
		if (!expression) {
			return { ok: false, error: 'Macro expression is required.' };
		}
		// Validate expression at save-time so invalid macros cannot be persisted.
		try {
			rollDiceExpression(expression);
		} catch (error) {
			const message =
				error instanceof DiceExpressionError
					? error.message
					: `Invalid expression: ${String(error)}`;
			return { ok: false, error: message };
		}

		const now = nowISO();
		const existingById = id ? this.macros.find((macro) => macro.id === id) : null;
		const existingByLabel = id
			? null
			: this.macros.find((macro) => macro.label.toLowerCase() === label.toLowerCase());
		const existing = existingById ?? existingByLabel ?? null;

		const nextMacro: DiceMacro = {
			id: existing?.id ?? nanoid(10),
			label,
			expression,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
		};

		const withoutExisting = this.macros.filter((macro) => macro.id !== nextMacro.id);
		await this.persistMacros([...withoutExisting, nextMacro]);
		return { ok: true, macro: nextMacro };
	}

	async deleteMacro(macroId: string): Promise<void> {
		await this.ensureMacrosLoaded();
		await this.persistMacros(this.macros.filter((macro) => macro.id !== macroId));
	}

	clearHistory(): void {
		this.history = [];
	}

	roll(
		expression: string,
		source: DiceRollSource = 'tray',
		meta?: { macroId?: string; macroLabel?: string },
	): DiceRollAttempt {
		try {
			const result: DiceRollResult = rollDiceExpression(expression);
			const entry: DiceRollHistoryEntry = {
				id: nanoid(12),
				at: nowISO(),
				source,
				expression: result.expression,
				total: result.total,
				totalText: result.totalText,
				breakdown: result.breakdown,
				markdownLine: result.markdownLine,
				rolls: result.rolls,
				macroId: meta?.macroId,
				macroLabel: meta?.macroLabel,
			};
			this.history = [entry, ...this.history].slice(0, MAX_HISTORY_ENTRIES);
			return { ok: true, entry };
		} catch (error) {
			const message =
				error instanceof DiceExpressionError
					? error.message
					: `Failed to roll expression: ${String(error)}`;
			return { ok: false, error: message };
		}
	}

	rollMacro(macro: DiceMacro, source: DiceRollSource = 'macro'): DiceRollAttempt {
		return this.roll(macro.expression, source, {
			macroId: macro.id,
			macroLabel: macro.label,
		});
	}
}

export const diceState = new DiceState();
