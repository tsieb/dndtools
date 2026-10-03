import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	WIDGET_COUNTER_EXECUTORS,
	classifyWidgetCommand,
	effectiveWidgetCommandExecutor,
	readWidgetCounter,
	readWidgetLastRoll,
	readWidgetShownMessage,
	resolveWidgetIntent,
	widgetCommandAvailability,
	type WidgetCommandDescriptor,
	type WidgetCommandUnavailableReason,
	type WidgetDefinition,
	type WidgetIntentDescriptor,
} from '@dndtools/core';
import { Button, Toaster } from '../../../ds';
import { useI18n, type MessageKey } from '../../../i18n';
import { useRuntime } from '../../../runtime/RuntimeContext';
import type { BoardWidget } from '../../board-helpers';
import { decideIntent } from '../hostBridge';
import {
	ComputedFields,
	TemplateEmpty,
	TemplateNote,
	TemplateShell,
	cfg,
	type WidgetTemplateProps,
} from './shared';

/**
 * `action-panel` — the template that DOES something (RC-WID-1.2). Every button is one command the
 * definition DECLARES; pressing it dispatches through `widget.dispatch-command`, so the core still
 * runs the operator-authority check, the payload schema and the op log. Nothing here writes state.
 *
 * Two rules keep the panel honest:
 *
 * - A CONFIGURE command is not rendered for a viewer without DM authority. The test is
 *   `classifyWidgetCommand`, the same policy `widget.dispatch-command` runs, not the descriptor's
 *   declared capability: a configure VERB (`rename`, `set-config`, `bind`…) is a configure action
 *   even when the package declares it `operator`, so testing the declaration alone would render a
 *   button for a player that the core then refuses. Showing a control the core will refuse is a
 *   dead control; omitting it is the same fail-closed answer the data queries give (RC-WID-2.3).
 * - With no `onCommand` (the DM is editing the layout, so bodies are inert) the buttons render
 *   disabled with the reason, rather than silently doing nothing when pressed.
 *
 * Buttons are real `<button>`s, so pointer and keyboard dispatch the identical command (WCAG 2.2 AA).
 *
 * A command's PAYLOAD comes from the widget's configuration, by the same rule `form-panel` already
 * uses: the keys the descriptor's `payloadSchema` names are read off the instance (falling back to
 * the declared field default), and nothing else is sent — the schemas the core validates against are
 * strict, so an unnamed key would be rejected. Without this a declared command whose schema requires
 * anything at all (`dice.roll` needs an expression) would be a button that can only ever fail.
 *
 * RC-WID-5.1 — after the commands come the definition's INTENTS: open a screen, an entity, a page,
 * a Settings tab, or start a creation flow. They write nothing, so they are not commands; the core's
 * `resolveWidgetIntent` decides each one against the VIEWER's read gate. On the live board an intent
 * the viewer could not follow is not rendered at all (a player's panel has no button for a DM-only
 * character), and a press resolves again in case the campaign changed in between — a refusal is
 * dropped, audited by the host bridge, and said out loud rather than doing nothing.
 *
 * RC-WID-6.1 — every command a template declares names the executor the core runs it with, and a
 * button whose executor reports UNAVAILABLE (no dice formula set, no note bound) is disabled with the
 * reason as its tooltip — the same `widgetCommandAvailability` check the core runs before it
 * executes, so the panel never offers a press the core will refuse for want of a setting. What the
 * presses leave on the placed widget (the counter, the last roll, the message shown to players) is
 * part of the readout.
 */
export function ActionPanelTemplate({
	widget,
	definition,
	data,
	onCommand,
	onIntent,
}: WidgetTemplateProps & {
	/** Test seam: follow an intent without the runtime or a router. The live board omits it. */
	onIntent?: (intent: WidgetIntentDescriptor) => void;
}) {
	const { t } = useI18n();
	const query = data.primary;
	// Only commands the definition declares AND the instance carries — the same test the builtin
	// operate affordances make before dispatching.
	const declared = (definition?.commands ?? []).filter(
		(command) => widget.commands.includes(command.type) || widget.commands.length === 0,
	);
	const actions = declared.filter(
		(command) => classifyWidgetCommand(command) === 'operate' || data.isDm,
	);
	// The configured values for exactly the keys this command declares. An undefined key is omitted
	// rather than sent as `undefined`, so a required field that was never configured is refused by
	// the core with its own message instead of being papered over here.
	const payloadFor = (command: (typeof actions)[number]): Record<string, unknown> =>
		Object.fromEntries(
			Object.keys(command.payloadSchema.properties ?? {})
				.map((key) => [key, cfg(widget, key)] as const)
				.filter(([, value]) => value !== undefined),
		);

	const intents = definition?.intents ?? [];
	// Why a button cannot run right now, or null. While the layout is being edited every button is
	// inert for that reason first.
	const blockedReason = (command: WidgetCommandDescriptor): string | null => {
		if (!onCommand) return t('widgetTemplate.finishEditing');
		const availability = widgetCommandAvailability({
			descriptor: command,
			payload: payloadFor(command),
			binding: widget.bindingRef,
			configuration: widget.configuration,
		});
		return availability.available
			? null
			: t(
					unavailableCopy(
						availability.reason,
						effectiveWidgetCommandExecutor(command) === 'mark-complete',
					),
				);
	};
	const counted = declared.some((command) => {
		const executor = effectiveWidgetCommandExecutor(command);
		return executor !== null && WIDGET_COUNTER_EXECUTORS.includes(executor);
	});
	const lastRoll = readWidgetLastRoll(widget.configuration);
	const shown = readWidgetShownMessage(widget.configuration);

	const controls =
		actions.length === 0 && intents.length === 0 ? (
			<TemplateNote>{t('widgetTemplate.noActions')}</TemplateNote>
		) : (
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
				{actions.map((command) => {
					const blocked = blockedReason(command);
					return (
						<Button
							key={command.type}
							size="sm"
							variant="secondary"
							aria-disabled={blocked ? true : undefined}
							title={blocked ?? undefined}
							onClick={
								blocked || !onCommand
									? undefined
									: () => onCommand(command.type, payloadFor(command))
							}
						>
							{command.displayName}
						</Button>
					);
				})}
				{intents.length === 0 ? null : onIntent || !onCommand || !definition ? (
					intents.map((intent) => (
						<IntentButton
							key={intent.id}
							intent={intent}
							inertReason={onCommand ? null : t('widgetTemplate.finishEditing')}
							onPress={onIntent ? () => onIntent(intent) : undefined}
						/>
					))
				) : (
					<LiveIntents widget={widget} definition={definition} intents={intents} />
				)}
			</div>
		);

	return (
		<TemplateShell testId="widget-template-action-panel" controls={controls}>
			{query?.header ? <TemplateNote>{query.header}</TemplateNote> : null}
			{counted ? (
				<TemplateNote>
					<span data-widget-counter>
						{t('widgetTemplate.counter')}: {readWidgetCounter(widget.configuration)}
					</span>
				</TemplateNote>
			) : null}
			{lastRoll ? (
				<TemplateNote>
					<span data-widget-last-roll>
						{t('widgetTemplate.lastRoll', {
							expression: lastRoll.expression,
							total: lastRoll.total,
						})}
					</span>
				</TemplateNote>
			) : null}
			{shown ? (
				<TemplateNote>
					{t('widgetTemplate.shownToPlayers')}: {shown.text}
				</TemplateNote>
			) : null}
			<ComputedFields data={data} />
			{query && query.rows.length > 0 ? (
				<TemplateNote>
					{query.label}: {query.rows.length}
				</TemplateNote>
			) : (
				<TemplateEmpty query={query} />
			)}
		</TemplateShell>
	);
}

/** The tooltip copy for each reason a command is unavailable. A missing binding names what to bind. */
function unavailableCopy(reason: WidgetCommandUnavailableReason, wantsQuest: boolean): MessageKey {
	switch (reason) {
		case 'no-executor':
			return 'widgetTemplate.unavailable.noExecutor';
		case 'no-formula':
			return 'widgetTemplate.unavailable.noFormula';
		case 'bad-formula':
			return 'widgetTemplate.unavailable.badFormula';
		case 'no-bound-entity':
			return wantsQuest
				? 'widgetTemplate.unavailable.noBoundQuest'
				: 'widgetTemplate.unavailable.noBoundNote';
		case 'bound-entity-missing':
			return 'widgetTemplate.unavailable.boundMissing';
		case 'bound-entity-not-note':
			return 'widgetTemplate.unavailable.noBoundNote';
		case 'bound-entity-not-quest':
			return 'widgetTemplate.unavailable.noBoundQuest';
		case 'no-text':
			return 'widgetTemplate.unavailable.noText';
		case 'no-line':
			return 'widgetTemplate.unavailable.noLine';
		case 'no-value':
			return 'widgetTemplate.unavailable.noValue';
		case 'no-duration':
			return 'widgetTemplate.unavailable.noDuration';
	}
}

function IntentButton({
	intent,
	inertReason,
	onPress,
}: {
	intent: WidgetIntentDescriptor;
	/** Why the button does nothing right now (the layout is being edited), or null when live. */
	inertReason: string | null;
	onPress?: () => void;
}) {
	return (
		<Button
			size="sm"
			variant="ghost"
			data-widget-intent={intent.id}
			aria-disabled={inertReason ? true : undefined}
			title={inertReason ?? undefined}
			onClick={inertReason ? undefined : onPress}
		>
			{intent.displayName}
		</Button>
	);
}

/**
 * The live half: reads the runtime and the router, which the pure template does not. Each intent is
 * resolved for the viewing actor (the "view as" actor while previewing) before it is drawn, and
 * again on press through `decideIntent`, which records a refusal in the host audit log.
 */
function LiveIntents({
	widget,
	definition,
	intents,
}: {
	widget: BoardWidget;
	definition: WidgetDefinition;
	intents: WidgetIntentDescriptor[];
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	const state = runtime.state;
	const actorId = runtime.activeActorId;
	const followable = useMemo(
		() =>
			intents.filter(
				(intent) =>
					resolveWidgetIntent({
						widgetInstanceId: widget.id,
						definition,
						request: { intentId: intent.id },
						approvedPermissions: [],
						state,
						actorId,
					}).decision === 'resolved',
			),
		[intents, widget.id, definition, state, actorId],
	);
	return (
		<>
			{followable.map((intent) => (
				<IntentButton
					key={intent.id}
					intent={intent}
					inertReason={null}
					onPress={() => {
						const decision = decideIntent(
							widget.id,
							definition,
							{ intentId: intent.id },
							[],
							runtime.state,
							runtime.activeActorId,
						);
						if (decision.destination) {
							navigate(decision.destination.path, { state: decision.destination.state });
						} else {
							Toaster.error(t('widgetTemplate.intentUnavailable'));
						}
					}}
				/>
			))}
		</>
	);
}
