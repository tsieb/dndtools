import { CHARACTER_STATE_SCHEMA_VERSION } from '../state/character-state';
import { COMMAND_CENTER_STATE_SCHEMA_VERSION } from '../state/command-center-state';
import { MAP_STATE_SCHEMA_VERSION } from '../state/map-state';
import { PERMISSION_STATE_SCHEMA_VERSION } from '../state/permission-state';
import { SCENE_STATE_SCHEMA_VERSION } from '../state/scene-state';
import { SESSION_STATE_SCHEMA_VERSION } from '../state/session-state';
import { WIDGET_PACKAGE_STATE_SCHEMA_VERSION } from '../state/widget-package-state';

/**
 * The durable state documents that participate in migration. Sync's operation log
 * carries its own per-operation schema version and is replayed rather than migrated,
 * so it is excluded here (PLAT-008 targets vault schema and durable state documents).
 */
export type DurableStateDocumentId =
	| 'scenes'
	| 'maps'
	| 'permissions'
	| 'session'
	| 'widgets'
	| 'commandCenter'
	| 'characters';

export const DURABLE_STATE_DOCUMENT_IDS: readonly DurableStateDocumentId[] = Object.freeze([
	'scenes',
	'maps',
	'permissions',
	'session',
	'widgets',
	'commandCenter',
	'characters',
]);

/**
 * The schema version the current build writes for each durable state document. A
 * persisted document at a lower version needs migration; a document at a higher version
 * was written by a newer build and must fail closed (Contract 2: unsupported future
 * versions fail closed with an upgrade-required diagnostic rather than partial parsing).
 */
export const TARGET_SCHEMA_VERSIONS: Readonly<Record<DurableStateDocumentId, number>> =
	Object.freeze({
		scenes: SCENE_STATE_SCHEMA_VERSION,
		maps: MAP_STATE_SCHEMA_VERSION,
		permissions: PERMISSION_STATE_SCHEMA_VERSION,
		session: SESSION_STATE_SCHEMA_VERSION,
		widgets: WIDGET_PACKAGE_STATE_SCHEMA_VERSION,
		commandCenter: COMMAND_CENTER_STATE_SCHEMA_VERSION,
		characters: CHARACTER_STATE_SCHEMA_VERSION,
	});

export function targetSchemaVersion(documentId: DurableStateDocumentId): number {
	return TARGET_SCHEMA_VERSIONS[documentId];
}
