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
	WidgetDisabledState,
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

export type { SessionState, SessionTimer } from './state/session-state';
export { EMPTY_SESSION_STATE, SESSION_STATE_SCHEMA_VERSION } from './state/session-state';

export type {
	CommandCenterPreset,
	CommandCenterPresetSection,
	CommandCenterPresetWidget,
	CommandCenterState,
} from './state/command-center-state';
export {
	COMMAND_CENTER_STATE_SCHEMA_VERSION,
	DEFAULT_COMMAND_CENTER_NAME,
	DEFAULT_COMMAND_CENTER_TOOLS,
	EMPTY_COMMAND_CENTER_STATE,
	buildDefaultCommandCenterScene,
} from './state/command-center-state';

export type {
	PlatformProfileId,
	WidgetBindingDefinition,
	WidgetCommandDescriptor,
	WidgetDataSchema,
	WidgetDefinition,
	WidgetDiagnostic,
	WidgetEventDescriptor,
	WidgetHostPermission,
	WidgetHostPermissionDecision,
	WidgetMigration,
	WidgetPackageAsset,
	WidgetPackageDefinition,
	WidgetPackageMigrationStatus,
	WidgetPackageRecord,
	WidgetPackageState,
	WidgetPackageTrustReview,
	WidgetPackageTrustState,
} from './state/widget-package-state';
export {
	ALL_HOST_PERMISSIONS,
	EMPTY_WIDGET_PACKAGE_STATE,
	SYSTEM_WIDGET_PACKAGE_STATE,
	WIDGET_PACKAGE_STATE_SCHEMA_VERSION,
	createSystemWidgetPackages,
	findPackageRecordForWidgetType,
	findWidgetDefinition,
	mergeSystemWidgetPackages,
} from './state/widget-package-state';

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
	createOperationLog,
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
	applyCommandCenterPresetInputSchema,
	createSceneInputSchema,
	destroyWidgetInputSchema,
	disableWidgetPackageInputSchema,
	dockWidgetInputSchema,
	dispatchWidgetCommandInputSchema,
	enableWidgetPackageInputSchema,
	ensureCommandCenterHomeInputSchema,
	groupWidgetsInputSchema,
	installWidgetPackageInputSchema,
	instantiateSceneTemplateInputSchema,
	layerWidgetInputSchema,
	moveGroupInputSchema,
	moveWidgetInputSchema,
	pinWidgetInputSchema,
	removeWidgetPackageInputSchema,
	resizeWidgetInputSchema,
	saveCommandCenterPresetInputSchema,
	saveSceneTemplateInputSchema,
	setSceneSectionsInputSchema,
	updateSceneMetadataInputSchema,
	upgradeWidgetPackageInputSchema,
} from './schemas/commands';

export { sceneSchema, sceneStateSchema } from './schemas/scene';

export {
	actorCanAuthorScene,
	actorCanCoEditScene,
	hasGrantedCapability,
} from './permissions/grants';
export { canActorSeeScene, evaluateSceneVisibility } from './permissions/visibility';
export type { SceneVisibilityResult } from './permissions/visibility';

export type {
	BindingResolver,
	SceneListEntry,
	SceneSummary,
	WidgetBindingPayload,
} from './queries/scene';
export { PERMISSIVE_RESOLVER, getSceneForActor, listScenesForActor } from './queries/scene';

export type { WidgetPackageExport } from './commands/widget-package';
export { exportWidgetPackage } from './commands/widget-package';
