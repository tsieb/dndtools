import { hasDmAuthority } from '../state/permission-state';
import type { Actor, PermissionState } from '../state/permission-state';
import type { WidgetCommandDescriptor } from '../state/widget-package-state';
import { hasGrantedCapability } from './grants';

/**
 * SES-005 — the OPERATE-vs-CONFIGURE authority policy for timer / tool widgets (Architecture Contract 3,
 * "Timer / Tool Widget" + "Widget" capability sets).
 *
 * A participant holding the widget `operator` grant may OPERATE the tool — start, pause, resume, reset,
 * advance, roll, draw, mark complete, or otherwise drive its runtime action surface — WITHOUT being able
 * to CONFIGURE or DEFINE it (change duration/labels/bindings/definition). The `manager` set may both
 * operate AND configure (it inherits `operator`); `viewer` may do neither. The DM bypasses all of this
 * inherently (DM Authority).
 *
 * This module is the single source of truth for which widget COMMAND a descriptor represents an OPERATE
 * action vs a CONFIGURE/DEFINE action, and the fail-closed authority decision. Pure Processing-Core
 * policy: a function of (descriptor, actor, grants) only. No GUI, no storage. The widget-command reducer
 * composes {@link decideWidgetCommandAuthority}; the GUI renders command availability from it but is
 * never the authority (Contract 1).
 */

/** Whether a widget command DRIVES the runtime (operate) or CHANGES configuration/definition (configure). */
export type WidgetCommandKind = 'operate' | 'configure';

/**
 * The runtime OPERATE action verbs a timer/tool widget exposes (Contract 3 Timer/Tool `operator`):
 * start, pause, resume, reset, advance, roll, draw, plus the generic "mark complete"/"adjust permitted
 * value" surface from the Widget `operator` row. A command whose declared `requiredCapability` is
 * `operator` is always treated as an operate action; this list additionally classifies commands by VERB
 * so a misconfigured descriptor (e.g. a configure command that mislabels itself `operator`) is caught.
 */
export const OPERATE_ACTION_VERBS: readonly string[] = Object.freeze([
	'start',
	'pause',
	'resume',
	'reset',
	'advance',
	'roll',
	'draw',
	'mark-complete',
	'tick',
	'stop',
]);

/**
 * The verbs that CONFIGURE or DEFINE a widget (change its settings/duration/bindings/definition). A
 * command using one of these verbs is a configure action even if it (wrongly) declares `operator`, so an
 * operator can never reach it. Fail closed: see {@link classifyWidgetCommand}.
 */
export const CONFIGURE_ACTION_VERBS: readonly string[] = Object.freeze([
	'configure',
	'define',
	'set-duration',
	'rename',
	'bind',
	'unbind',
	'rebind',
	'set-config',
]);

/** Extract the trailing VERB of a dotted widget command type (`timer.set-duration` → `set-duration`). */
function commandVerb(commandType: string): string {
	const lastDot = commandType.lastIndexOf('.');
	return lastDot >= 0 ? commandType.slice(lastDot + 1) : commandType;
}

/**
 * Classify a widget command descriptor as an OPERATE or CONFIGURE action, FAIL CLOSED toward the
 * stricter (configure) classification when ambiguous.
 *
 * Rules, in order:
 *   1. A command whose declared `requiredCapability` is `manager` is a CONFIGURE action (managing the
 *      widget). This is authoritative — the descriptor explicitly demands manage rights.
 *   2. A command whose VERB is a known CONFIGURE verb is a CONFIGURE action, regardless of its declared
 *      capability — so a descriptor that mislabels a configure command as `operator` cannot be reached
 *      by a mere operator (fail closed against misconfiguration).
 *   3. A command whose VERB is a known OPERATE verb (or whose declared capability is `operator`/`viewer`)
 *      is an OPERATE action.
 *   4. Anything else (an unknown verb that is not declared `operator`) is treated as CONFIGURE (fail
 *      closed): an operator only gets verbs the policy recognizes as runtime actions.
 */
export function classifyWidgetCommand(descriptor: WidgetCommandDescriptor): WidgetCommandKind {
	const verb = commandVerb(descriptor.type);
	if (descriptor.requiredCapability === 'manager') return 'configure';
	if (CONFIGURE_ACTION_VERBS.includes(verb)) return 'configure';
	if (OPERATE_ACTION_VERBS.includes(verb)) return 'operate';
	if (descriptor.requiredCapability === 'operator' || descriptor.requiredCapability === 'viewer') {
		return 'operate';
	}
	return 'configure';
}

/** The minimum widget capability set required to dispatch a command of the given kind. */
export function requiredCapabilityForWidgetCommand(
	descriptor: WidgetCommandDescriptor,
): 'operator' | 'manager' {
	return classifyWidgetCommand(descriptor) === 'configure' ? 'manager' : 'operator';
}

/** Why a widget command was authorized or denied (drives the reducer's rejection + the GUI affordance). */
export type WidgetCommandAuthorityDecision =
	| { authorized: true; kind: WidgetCommandKind; via: 'dm' | 'grant' }
	| {
			authorized: false;
			kind: WidgetCommandKind;
			reason: 'observer' | 'not-operator' | 'operator-cannot-configure' | 'unauthorized';
	  };

/**
 * SES-005 — decide whether `actor` may dispatch `descriptor` on a specific widget instance, FAIL CLOSED.
 *
 *   - The DM is always authorized (DM Authority).
 *   - An Observer is never authorized (the observer ceiling — they hold no write/operate grants).
 *   - For an OPERATE command: authorized iff the actor holds `operator` (directly or via `manager`
 *     inheritance) on the widget. A non-operator is denied (`not-operator`).
 *   - For a CONFIGURE command: authorized iff the actor holds `manager`. An actor who holds ONLY
 *     `operator` is denied with `operator-cannot-configure` — proving the operate-allowed /
 *     configure-denied boundary (SES-005 AC2). An actor with no grant is `unauthorized`.
 *
 * The capability check delegates to {@link hasGrantedCapability}, which applies the widget inheritance
 * graph (`manager` ⇒ `operator` ⇒ `viewer`) and drops expired grants.
 */
export function decideWidgetCommandAuthority(
	permission: PermissionState,
	actor: Actor,
	widgetInstanceId: string,
	descriptor: WidgetCommandDescriptor,
	now?: string,
): WidgetCommandAuthorityDecision {
	const kind = classifyWidgetCommand(descriptor);
	if (hasDmAuthority(actor.role)) return { authorized: true, kind, via: 'dm' };
	if (actor.role === 'observer') return { authorized: false, kind, reason: 'observer' };

	const isOperator = hasGrantedCapability(
		permission,
		actor,
		'widget',
		widgetInstanceId,
		'operator',
		now,
	);

	if (kind === 'operate') {
		return isOperator
			? { authorized: true, kind, via: 'grant' }
			: { authorized: false, kind, reason: 'not-operator' };
	}

	// CONFIGURE: requires `manager`. An operator-only actor is explicitly blocked from configuring.
	const isManager = hasGrantedCapability(
		permission,
		actor,
		'widget',
		widgetInstanceId,
		'manager',
		now,
	);
	if (isManager) return { authorized: true, kind, via: 'grant' };
	return {
		authorized: false,
		kind,
		reason: isOperator ? 'operator-cannot-configure' : 'unauthorized',
	};
}
