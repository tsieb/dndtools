/**
 * Human copy for the widget-command rejections a DM can actually provoke from a spatial surface
 * (`/board`, `/scene/:id`).
 *
 * The core writes rejection messages for the developer reading a log, and both screens piped
 * `rejection.message` straight into their `role="alert"` region. The one a DM hits constantly is the
 * live-session gate (`widget-command.ts`: any command whose descriptor `writesTo: 'session'` is
 * refused unless `session.workflow === 'active'`), because the GM Screen ships seeded Dice and Timer
 * widgets and a fresh install is `idle`. Pressing Roll on the app's home dashboard printed, verbatim:
 *
 *   "Session widget commands require an active workflow; current workflow is idle."
 *
 * — which names an internal state machine and tells the DM nothing about what to do.
 */
export function widgetRejectionMessage(rejection: {
	code?: string;
	message?: string;
}): string {
	if (rejection.code === 'invalid-state') {
		return 'Go live in Session first — dice, timers and handouts only reach the table during live play.';
	}
	if (rejection.code === 'package-disabled' || rejection.code === 'package-not-found') {
		return 'That widget’s extension isn’t available — re-enable it in Extensions and try again.';
	}
	if (rejection.code === 'revision-conflict') {
		return 'This scene changed while you were working — reload to pick up the latest layout.';
	}
	return rejection.message ?? 'That change couldn’t be applied — try again.';
}
