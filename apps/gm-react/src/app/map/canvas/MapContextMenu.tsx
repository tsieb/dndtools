import { Popover, Sheet } from '../../../ds';
import { HeaderMenuItem } from '../MapEditorChrome';
import { useI18n } from '../../../i18n';

/**
 * RC-MAP-2.5 — the map canvas's context menu: right-click (or the keyboard context-menu key, which
 * fires the same native `contextmenu` event) opens it anchored at the point; a touch long-press
 * opens the same actions as a bottom `Sheet` instead, since there is no right-click on touch. Both
 * surfaces list the same actions, so neither input mode is missing a capability the other has.
 *
 * Currently one action: "Mark party here" (RC-MAP-1.4's `session.mark-party`). Structured as a
 * list so a later story can add more without another menu surface.
 */
export function MapContextMenu({
	open,
	touch,
	anchor,
	onClose,
	onMarkPartyHere,
}: {
	open: boolean;
	/** Render as a bottom Sheet (touch long-press) instead of an anchored Popover (right-click). */
	touch: boolean;
	/** Canvas-relative pixel position (Popover mode only — Sheet does not need an anchor). */
	anchor: { x: number; y: number };
	onClose: () => void;
	onMarkPartyHere: () => void;
}) {
	const { t } = useI18n();
	if (!open) return null;

	const items = (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
			<HeaderMenuItem
				icon="pin"
				label={t('mapEditor.markPartyHere')}
				onClick={() => {
					onMarkPartyHere();
					onClose();
				}}
			/>
		</div>
	);

	if (touch) {
		return (
			<Sheet open onClose={onClose} side="bottom" title={t('mapEditor.mapActions')} size={160}>
				{items}
			</Sheet>
		);
	}

	return (
		<Popover
			open
			onClose={onClose}
			aria-label={t('mapEditor.mapActions')}
			anchor={anchor}
			placement="bottom"
			width={220}
		>
			{items}
		</Popover>
	);
}
