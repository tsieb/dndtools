export type {
	Actor,
	ActorRole,
	CapabilitySet,
	PermissionGrant,
	PermissionState,
	SceneCapabilitySet,
	WidgetCapabilitySet,
} from './state/permission-state';
export {
	EMPTY_PERMISSION_STATE,
	PERMISSION_STATE_SCHEMA_VERSION,
	getActor,
} from './state/permission-state';

export type {
	PlayerViewAssignment,
	Scene,
	SceneBackground,
	SceneOwnership,
	SceneState,
	SceneTemplateMeta,
	SceneVisibility,
	SceneVisualSettings,
	SectionLayoutRegion,
	WidgetBinding,
	WidgetDock,
	WidgetInstance,
	WidgetLayout,
} from './state/scene-state';
export {
	EMPTY_SCENE_STATE,
	SCENE_SCHEMA_VERSION,
	SCENE_STATE_SCHEMA_VERSION,
	isWidgetInGroup,
} from './state/scene-state';

export type {
	ActorId,
	Clock,
	GrantId,
	GroupId,
	IdGenerator,
	OperationId,
	SceneId,
	SectionId,
	WidgetInstanceId,
} from './state/ids';

export type { OperationLog, SyncOperation } from './sync/operation-log';
export {
	EMPTY_OPERATION_LOG,
	SYNC_OPERATION_SCHEMA_VERSION,
	appendOperation,
} from './sync/operation-log';

export type {
	CommandRejection,
	CommandResult,
	CoreCommand,
	CoreEnvironment,
	CoreEvent,
	CoreStateSlice,
	RejectionCode,
} from './commands/types';
export { dispatchCommand } from './commands/dispatch';

export {
	addWidgetInputSchema,
	createSceneInputSchema,
	destroyWidgetInputSchema,
	dockWidgetInputSchema,
	groupWidgetsInputSchema,
	instantiateSceneTemplateInputSchema,
	layerWidgetInputSchema,
	moveGroupInputSchema,
	moveWidgetInputSchema,
	pinWidgetInputSchema,
	resizeWidgetInputSchema,
	saveSceneTemplateInputSchema,
	setSceneSectionsInputSchema,
	updateSceneMetadataInputSchema,
} from './schemas/commands';

export {
	sceneSchema,
	sceneStateSchema,
} from './schemas/scene';

export {
	actorCanAuthorScene,
	actorCanCoEditScene,
	hasGrantedCapability,
} from './permissions/grants';
export {
	canActorSeeScene,
	evaluateSceneVisibility,
} from './permissions/visibility';
export type { SceneVisibilityResult } from './permissions/visibility';

export type {
	BindingResolver,
	SceneListEntry,
	SceneSummary,
	WidgetBindingPayload,
} from './queries/scene';
export {
	PERMISSIVE_RESOLVER,
	getSceneForActor,
	listScenesForActor,
} from './queries/scene';
