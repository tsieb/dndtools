import type { BoardWidget } from '../../board-helpers';
import { Muted, type WidgetCommandHandler } from '../../widget-body-kit';
import { NoteBody } from './NoteBody';
import { DiceBody } from './DiceBody';
import { TimerBody } from './TimerBody';
import { AudioBody } from './AudioBody';
import { InitiativeBody } from './InitiativeBody';
import { CharacterBody } from './CharacterBody';
import { MapBody } from './MapBody';
import { ListBody } from './ListBody';

export type { WidgetCommandHandler } from '../../widget-body-kit';

/**
 * widget-bodies — the representative BODY each widget renders on the scene canvas, ported from the
 * prototype's `widgets.jsx`. Where the prototype read its mock `w.props`, these read the widget's
 * REAL `configuration` (falling back to the core widget definition's declared `configFields` default),
 * so the body always reflects what the tiered inspector wrote — edit a note's heading or a timer's
 * duration and the canvas updates immediately, and the change persists through `scene.configure-widget`.
 *
 * This component renders ONLY the inner content; the `WidgetFrame` (SceneBoardCanvas) supplies the
 * shared header (glyph · title · visibility chip · type label) so view- and edit-mode chrome stay
 * identical. Bodies are LIVE where the core has a live view: the initiative tracker reads
 * `getCombatTrackerForActor`, the character body its bound character (`getCharacterForActor`), the
 * timer the durable session timer (`getTimerCountdown`), and the dice body the session dice history.
 * In VIEW mode the declared operate affordances (Roll / Start / Pause / Reset) are REAL buttons that
 * dispatch through the parent's `onCommand` (→ `widget.dispatch-command`); each is rendered only when
 * the widget's own `WidgetDefinition.commands` declares that command type. Without `onCommand`
 * (edit mode) they stay the inert, de-emphasized chips of the original design.
 *
 * RC-WID-4.1 moved each body into its own file in this directory; this module keeps the ONE switch
 * that maps a widget type to its body, so "which types can the host draw by hand" stays a single
 * answer rather than a directory listing.
 */

/**
 * The widget types this module has a hand-written body for — the `builtin` branch of the render
 * resolver (RC-WID-1.1). `resolveWidgetRenderer` asks this before choosing `builtin`, and falls back
 * to it for a `template` widget whose declarative renderer has not landed yet, so the list is the
 * authoritative answer to "can the host draw this by hand" rather than a comment that drifts from
 * the switch below.
 */
export const BUILTIN_WIDGET_TYPES: readonly string[] = [
	'note',
	'handout',
	'dice',
	'timer',
	'audio',
	'initiative-tracker',
	'character',
	'map',
	'quick-reference',
	'prep',
];

const BUILTIN_WIDGET_TYPE_SET = new Set(BUILTIN_WIDGET_TYPES);

/** Whether `WidgetBody` renders a real body for this widget type (the resolver's `builtin` test). */
export function hasBuiltinBody(widgetType: string): boolean {
	return BUILTIN_WIDGET_TYPE_SET.has(widgetType);
}

export function WidgetBody({
	widget,
	onCommand,
}: {
	widget: BoardWidget;
	/** VIEW-mode operate dispatch (`widget.dispatch-command`); omit in edit mode to keep bodies inert. */
	onCommand?: WidgetCommandHandler;
}) {
	switch (widget.type) {
		case 'note':
		case 'handout':
			return <NoteBody widget={widget} />;
		case 'dice':
			return <DiceBody widget={widget} onCommand={onCommand} />;
		case 'timer':
			return <TimerBody widget={widget} onCommand={onCommand} />;
		case 'audio':
			return <AudioBody />;
		case 'initiative-tracker':
			return <InitiativeBody widget={widget} />;
		case 'character':
			return <CharacterBody widget={widget} />;
		case 'map':
			return <MapBody widget={widget} />;
		case 'quick-reference':
			return <ListBody widget={widget} kind="object" unit="widgetBody.list.unitObjects" />;
		case 'prep':
			return <ListBody widget={widget} kind="note" unit="widgetBody.list.unitNotes" />;
		default:
			// Unreachable through `resolveWidgetRenderer` (it only picks `builtin` for a type in
			// BUILTIN_WIDGET_TYPES); kept so a direct caller degrades to the description rather than
			// throwing.
			return widget.description ? <Muted>{widget.description}</Muted> : null;
	}
}
