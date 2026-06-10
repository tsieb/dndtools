import type { TitlebarControl, TitlebarWindowState } from '../contracts/desktop-shell.contract';

/**
 * PLAT-002 (AC2 + AC3): runtime helpers for the desktop titlebar controls.
 *
 * Two pure functions:
 *  - {@link titlebarControlsForState} resolves which window controls are visible for the current
 *    maximized/restored/etc. window state (AC2).
 *  - {@link auditTitlebarTargets} runs the target-size audit: every control's hitbox must meet the
 *    platform chrome baseline and stay inside the declared titlebar height (AC3).
 *
 * These live in the Processing Core as deterministic layout/availability semantics (Contract 1:
 * the core may own platform-profile-shaped control availability; the actual native window
 * operation crosses typed IPC in the shell). Keeping them pure means the desktop shell — when it
 * is built — and the tests share one source of truth, and no native API is touched here.
 */

/**
 * The platform chrome baseline for a titlebar control hitbox, in CSS pixels. 24px is the
 * conventional minimum interactive target for desktop window-chrome controls; WCAG 2.5.8's
 * 24px target-size minimum is the floor the audit enforces.
 */
export const TITLEBAR_CHROME_BASELINE_PX = 24 as const;

/** The declared desktop titlebar height controls must fit within, in CSS pixels. */
export const DEFAULT_TITLEBAR_HEIGHT_PX = 32 as const;

/**
 * Resolve the visible titlebar controls for a window state (PLAT-002 AC2). `maximize` shows when
 * the window is not maximized; `restore` shows only when maximized; `minimize` and `close` are
 * always present. A minimized/fullscreen window keeps the standard set so controls reflect — and
 * can change — the current shell state.
 */
export function titlebarControlsForState(state: TitlebarWindowState): TitlebarControl[] {
	const isMaximized = state === 'maximized' || state === 'fullscreen';
	return [
		{ id: 'minimize', label: 'Minimize', visible: true },
		{ id: 'maximize', label: 'Maximize', visible: !isMaximized },
		{ id: 'restore', label: 'Restore', visible: isMaximized },
		{ id: 'close', label: 'Close', visible: true },
	];
}

/** A measured hitbox for one titlebar control, supplied by the audit caller. */
export interface TitlebarTargetMeasurement {
	readonly id: TitlebarControl['id'];
	readonly width: number;
	readonly height: number;
}

export type TitlebarAuditFailureReason = 'below-baseline' | 'exceeds-titlebar-height';

export interface TitlebarAuditFailure {
	readonly id: TitlebarControl['id'];
	readonly reason: TitlebarAuditFailureReason;
	readonly width: number;
	readonly height: number;
}

export interface TitlebarAuditOptions {
	readonly baselinePx?: number;
	readonly titlebarHeightPx?: number;
}

export interface TitlebarAuditResult {
	readonly passed: boolean;
	readonly failures: readonly TitlebarAuditFailure[];
}

/**
 * Audit titlebar control hitboxes (PLAT-002 AC3). Each control must:
 *  1. meet the platform chrome baseline on both axes (>= baselinePx), and
 *  2. fit inside the declared titlebar height (<= titlebarHeightPx).
 *
 * Fail-closed: a control whose hitbox is too small OR too tall is a failure. Returns every
 * failure so a single audit run reports all offenders.
 */
export function auditTitlebarTargets(
	measurements: readonly TitlebarTargetMeasurement[],
	options: TitlebarAuditOptions = {},
): TitlebarAuditResult {
	const baseline = options.baselinePx ?? TITLEBAR_CHROME_BASELINE_PX;
	const titlebarHeight = options.titlebarHeightPx ?? DEFAULT_TITLEBAR_HEIGHT_PX;
	const failures: TitlebarAuditFailure[] = [];
	for (const m of measurements) {
		if (m.width < baseline || m.height < baseline) {
			failures.push({ id: m.id, reason: 'below-baseline', width: m.width, height: m.height });
			continue;
		}
		if (m.height > titlebarHeight) {
			failures.push({
				id: m.id,
				reason: 'exceeds-titlebar-height',
				width: m.width,
				height: m.height,
			});
		}
	}
	return { passed: failures.length === 0, failures };
}
