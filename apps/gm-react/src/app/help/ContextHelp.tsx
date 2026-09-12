import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { HelpTip, IconButton, Popover } from '../../ds';
import { useI18n } from '../../i18n';
import { HELP_TOPICS, type HelpTopicId } from './helpTopics';

/** The note sits inside the popover's own surface, so it drops its boxed chrome and reads as body
 * text rather than a card inside a card. */
const TIP_STYLE: CSSProperties = {
	display: 'flex',
	alignItems: 'flex-start',
	background: 'transparent',
	border: 'none',
	fontSize: 'var(--text-sm)',
	lineHeight: 1.5,
};

/**
 * RC-UX-3.1 — a HelpTip beside a control whose consequence the label alone cannot carry (vault
 * privacy mode, the recovery key, a widget trust review…).
 *
 * A toggletip, not a hover tooltip: the DS `Tooltip` is for terse names and never holds essential
 * text, and this copy IS the explanation. So it opens on press, stays until dismissed — Escape, an
 * outside press, Close, or the trigger again — and works the same for keyboard, mouse and touch.
 * The body is the DS `HelpTip` note inside the DS `Popover`, which already owns focus-in,
 * focus-return, the Escape layer stack and Android Back.
 */
export function ContextHelp({ topic }: { topic: HelpTopicId }) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	// Wraps the trigger AND the panel: the Popover ignores presses inside `triggerRef`, which hands
	// the second press on the trigger to its own toggle instead of closing and instantly reopening.
	const wrapRef = useRef<HTMLSpanElement>(null);
	const panelId = useId();
	const copy = HELP_TOPICS[topic];

	return (
		<span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto' }}>
			<IconButton
				icon="info"
				label={t(copy.label)}
				variant="ghost"
				size="sm"
				// `sm` alone is a fixed 28px whatever the density; the token makes it 44px under the
				// touch (comfortable) lock the design package asks for, 32px standard, 28px compact.
				style={{ width: 'var(--density-touch-target)', height: 'var(--density-touch-target)' }}
				aria-expanded={open}
				aria-controls={open ? panelId : undefined}
				data-help-topic={topic}
				onClick={() => setOpen((value) => !value)}
			/>
			<Popover
				id={panelId}
				open={open}
				onClose={() => setOpen(false)}
				title={t(copy.title)}
				// Anchored to the trigger's own box (not page coordinates) so the Popover's viewport
				// clamp still applies: a tip beside a right-edge badge stays whole on a 390px phone.
				anchor={{ x: '50%', y: '100%' }}
				placement="bottom"
				width={300}
				triggerRef={wrapRef}
			>
				<HelpTip style={TIP_STYLE}>{t(copy.body)}</HelpTip>
			</Popover>
		</span>
	);
}

/** A control (usually a status badge) with its ContextHelp directly after it, kept on one line. */
export function HelpBeside({ topic, children }: { topic: HelpTopicId; children: ReactNode }) {
	return (
		<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
			{children}
			<ContextHelp topic={topic} />
		</span>
	);
}
