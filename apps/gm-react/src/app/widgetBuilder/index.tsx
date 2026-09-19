import { createPortal } from 'react-dom';
import { WidgetBuilder } from '../../screens/extensions/WidgetBuilder';
import type { WidgetDraft } from './draft';

/** Keep the full-screen editor outside the inspector's scrolling and transformed ancestors. */
export function CanvasWidgetBuilder({
	draft,
	onClose,
}: {
	draft: WidgetDraft;
	onClose: () => void;
}) {
	return createPortal(
		<WidgetBuilder initialDraft={draft} initialStep="layout" onClose={onClose} />,
		document.body,
	);
}
