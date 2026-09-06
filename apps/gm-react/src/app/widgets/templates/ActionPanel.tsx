import { Button } from '../../../ds';
import { useI18n } from '../../../i18n';
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
 * - A `manager` command is not rendered for a viewer without DM authority. Showing a control that
 *   the core will refuse is a dead control; omitting it is the same fail-closed answer the data
 *   queries give.
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
 */
export function ActionPanelTemplate({ widget, definition, data, onCommand }: WidgetTemplateProps) {
	const { t } = useI18n();
	const query = data.primary;
	// Only commands the definition declares AND the instance carries — the same test the builtin
	// operate affordances make before dispatching.
	const declared = (definition?.commands ?? []).filter(
		(command) => widget.commands.includes(command.type) || widget.commands.length === 0,
	);
	const actions = declared.filter(
		(command) => command.requiredCapability !== 'manager' || data.isDm,
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

	return (
		<TemplateShell testId="widget-template-action-panel">
			{query?.header ? <TemplateNote>{query.header}</TemplateNote> : null}
			<ComputedFields data={data} />
			{query && query.rows.length > 0 ? (
				<TemplateNote>
					{query.label}: {query.rows.length}
				</TemplateNote>
			) : (
				<TemplateEmpty query={query} />
			)}
			{actions.length === 0 ? (
				<TemplateNote>{t('widgetTemplate.noActions')}</TemplateNote>
			) : (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
					{actions.map((command) => (
						<Button
							key={command.type}
							size="sm"
							variant="secondary"
							aria-disabled={onCommand ? undefined : true}
							title={onCommand ? undefined : t('widgetTemplate.finishEditing')}
							onClick={onCommand ? () => onCommand(command.type, payloadFor(command)) : undefined}
						>
							{command.displayName}
						</Button>
					))}
				</div>
			)}
		</TemplateShell>
	);
}
