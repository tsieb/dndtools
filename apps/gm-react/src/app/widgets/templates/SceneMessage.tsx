import { Icon } from '../../../ds';
import {
	ComputedFields,
	TemplateEmpty,
	TemplateShell,
	cfgText,
	type WidgetTemplateProps,
} from './shared';

/**
 * `scene-message` — a card that says one thing (RC-WID-1.2): a read-aloud passage, a rumour, a
 * standing note pinned to the board. The message is the widget's own CONFIGURATION, so this is the
 * one template that renders with no data source at all.
 *
 * When the package also declares a query, the ACTIVE row (the scene in play, the combatant whose
 * turn it is) becomes the message's subtitle — that is what makes it a *scene* message rather than a
 * sticky note.
 */
export function SceneMessageTemplate({ widget, data }: WidgetTemplateProps) {
	const message = cfgText(widget, 'message', 'body', 'text', 'content');
	const query = data.primary;
	const rows = query?.rows ?? [];
	const context = rows.find((row) => row.active) ?? rows[0] ?? null;

	return (
		<TemplateShell testId="widget-template-scene-message">
			{context ? (
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'var(--space-1)',
						font: '600 var(--text-2xs) var(--font-sans)',
						letterSpacing: 'var(--tracking-wider)',
						textTransform: 'uppercase',
						color: 'var(--color-text-tertiary)',
						flex: '0 0 auto',
					}}
				>
					<Icon name="scene" size={12} />
					{context.primary}
				</span>
			) : null}
			{message ? (
				<p
					style={{
						margin: 0,
						font: 'var(--text-sm)/1.5 var(--font-sans)',
						color: 'var(--color-text-primary)',
						whiteSpace: 'pre-wrap',
					}}
				>
					{message}
				</p>
			) : query ? (
				<TemplateEmpty query={query} />
			) : (
				<span
					style={{
						font: 'var(--text-xs)/1.4 var(--font-sans)',
						color: 'var(--color-text-tertiary)',
					}}
				>
					Add a message in this widget&rsquo;s settings.
				</span>
			)}
			<ComputedFields data={data} />
		</TemplateShell>
	);
}
