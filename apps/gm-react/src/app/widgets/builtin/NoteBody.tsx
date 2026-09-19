import { createContext, useContext } from 'react';
import type { BoardWidget } from '../../board-helpers';
import { NoteTile } from './Note';

/** Canvas frames own note chrome; standalone body hosts retain their existing edit-mode badge. */
export const NoteFrameContext = createContext(false);

/** Share the depth renderer and markdown windows with standalone note tiles. */
export function NoteBody({ widget, editing = false }: { widget: BoardWidget; editing?: boolean }) {
	const framed = useContext(NoteFrameContext);
	return <NoteTile widget={widget} editing={!framed && editing} />;
}
