import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listScenesForActor, listCharactersForActor } from '@dndtools/core';
import { CommandPalette as DSCommandPalette } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { RUN, LIBRARY, PLATFORM } from './nav';

interface PaletteCommand {
	id: string;
	label: string;
	icon?: string;
	group?: string;
	keywords?: string;
	description?: string;
	run: () => void;
}

/**
 * CommandPalette — the working ⌘K surface (was a no-op affordance in the visual port). It composes a
 * real, navigable command set from the live Processing Core: every section destination, every scene
 * the actor can see (opens the real `/scene/:id` editor), and the quick-create launchers. Filtering
 * and keyboard nav are handled by the design-system `CommandPalette`.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
	const navigate = useNavigate();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;

	const commands = useMemo<PaletteCommand[]>(() => {
		const goTo = (path: string) => () => {
			navigate(path);
			onClose();
		};
		const sections = [...RUN, ...LIBRARY, ...PLATFORM].map((s) => ({
			id: `nav:${s.id}`,
			label: s.label,
			icon: s.icon,
			group: 'Go to',
			keywords: s.sub ?? '',
			run: goTo(s.path),
		}));
		const scenes = listScenesForActor(runtime.state.scenes, runtime.state.permissions, actorId)
			.filter((s) => !s.isTemplate)
			.map((s) => ({
				id: `scene:${s.id}`,
				label: s.name,
				icon: 'scene',
				group: 'Scenes',
				keywords: s.tags.join(' '),
				description: s.visibility === 'dm-only' ? 'DM-only' : 'Shared',
				run: goTo(`/scene/${s.id}`),
			}));
		const characters = listCharactersForActor(runtime.state.characters, runtime.state.permissions, actorId)
			.slice(0, 12)
			.map((c) => ({
				id: `char:${c.id}`,
				label: c.name,
				icon: 'characters-person',
				group: 'Characters',
				keywords: c.kind,
				run: goTo('/characters'),
			}));
		const creates: PaletteCommand[] = [
			{ id: 'new:scene', label: 'New scene', icon: 'add', group: 'Create', run: goTo('/scenes') },
			{ id: 'new:character', label: 'New character', icon: 'new-character', group: 'Create', run: goTo('/characters') },
			{ id: 'new:note', label: 'New note', icon: 'note-edit', group: 'Create', run: goTo('/knowledge') },
			{ id: 'new:map', label: 'New map', icon: 'new-map', group: 'Create', run: goTo('/atlas') },
		];
		return [...creates, ...sections, ...scenes, ...characters];
	}, [runtime.state, actorId, navigate, onClose]);

	return (
		<DSCommandPalette
			open={open}
			onClose={onClose}
			commands={commands}
			groupOrder={['Create', 'Go to', 'Scenes', 'Characters']}
			placeholder="Search scenes, characters, and destinations…"
		/>
	);
}
