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

export type {
	ActiveMapDeliveryStatus,
	PlayerViewDeliveryStatus,
	PlayerViewProjectionKind,
	PlayerViewProjectionTarget,
	SessionActiveMapProjection,
	SessionActiveMapSelection,
	SessionArchiveSnapshot,
	SessionCombatState,
	SessionDiceRoll,
	SessionPlayerViewAssignment,
	SessionState,
	SessionTimer,
	SessionWorkflowState,
} from './state/session-state';
export {
	EMPTY_SESSION_COMBAT_STATE,
	EMPTY_SESSION_STATE,
	SESSION_STATE_SCHEMA_VERSION,
	SESSION_WORKFLOW_STATES,
} from './state/session-state';

export type { MapEntity, MapLayer, MapLayerCategory, MapRegion, MapState } from './state/map-state';
export { EMPTY_MAP_STATE, MAP_STATE_SCHEMA_VERSION, createDemoMapState } from './state/map-state';

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
	configureWidgetInputSchema,
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
	projectPlayerViewInputSchema,
	projectActiveMapInputSchema,
	removeWidgetPackageInputSchema,
	recordSessionDiceInputSchema,
	revokePlayerViewInputSchema,
	resizeWidgetInputSchema,
	saveCommandCenterPresetInputSchema,
	saveSceneTemplateInputSchema,
	setActiveMapInputSchema,
	setSceneSectionsInputSchema,
	setSessionWorkflowInputSchema,
	setWidgetFocusOrderInputSchema,
	updateSessionCombatInputSchema,
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
	SceneQueryOptions,
	SceneSummary,
	PlayerViewQueryResult,
	PlayerViewSummary,
	WidgetBindingPayload,
} from './queries/scene';
export {
	PERMISSIVE_RESOLVER,
	getPlayerViewForActor,
	getSceneForActor,
	listScenesForActor,
} from './queries/scene';

export type { FocusOrderInput, SceneFocusEntry, WidgetFocusTier } from './queries/focus-order';
export { computeSceneFocusOrder, computeWidgetFocusOrder } from './queries/focus-order';

export type {
	LayoutStep,
	ResolvedLayoutCommand,
	SceneLayoutCommand,
	SceneLayoutCommandGroup,
	SceneLayoutCommandId,
	SceneLayoutCommandType,
} from './queries/layout-commands';
export {
	DEFAULT_LAYOUT_STEP,
	MIN_WIDGET_EXTENT,
	listWidgetLayoutCommands,
	resolveLayoutCommandPayload,
} from './queries/layout-commands';

export type {
	CommandBindingBlock,
	EntityBindingRecord,
	EntityVisibility,
	HiddenBindingReason,
	ResolveBindingOptions,
	WidgetBindingResolution,
	WidgetBindingState,
	WidgetDataEnvironment,
} from './queries/binding';
export {
	EMPTY_WIDGET_DATA_ENVIRONMENT,
	WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION,
	commandBindingBlock,
	entityBindingKey,
	resolveWidgetBinding,
} from './queries/binding';

export type {
	ResolvedAddWidgetCommand,
	WidgetLibraryAvailability,
	WidgetLibraryBinding,
	WidgetLibraryEntry,
	WidgetLibraryQuery,
} from './queries/widget-library';
export {
	DEFAULT_LIBRARY_WIDGET_POSITION,
	listWidgetLibrary,
	resolveAddWidgetCommand,
} from './queries/widget-library';

export type {
	CommandAction,
	CommandActionAvailability,
	CommandActionContext,
	CommandActionGroup,
	CommandActionInput,
	CommandActionStateView,
	ResolvedCommandAction,
} from './queries/command-actions';
export {
	listCommandActions,
	resolveCommandAction,
	searchCommandActions,
} from './queries/command-actions';

export type {
	NavigationAudience,
	NavigationCategory,
	NavigationRegistryEntry,
	NavigationSection,
	NavigationSectionDef,
} from './queries/navigation';
export {
	NAVIGATION_SECTIONS,
	listNavigationRegistryForActor,
	listNavigationSections,
} from './queries/navigation';

export type {
	CanonicalNavigationSection,
	LocalNavigationContract,
	LocalNavigationContractKind,
	NavigationSectionProblem,
	SectionActorAvailability,
	SectionOwnerDomain,
	SectionReleaseStatus,
} from './queries/navigation-sections';
export {
	CANONICAL_NAVIGATION_SECTIONS,
	findSectionByRoute,
	getHomeSection,
	isSectionAvailableForRole,
	sectionRuntimeRoute,
	validateNavigationSections,
} from './queries/navigation-sections';

export type {
	ContextualLink,
	ContextualLinkKind,
	NavigationCrumb,
	NavigationDestination,
	NavigationEntityType,
	NavigationItem,
	NavigationLocation,
	NavigationStateView,
	NavigationView,
} from './queries/navigation-view';
export { listReachableDestinations, resolveNavigationView } from './queries/navigation-view';

export type {
	CommandCategory,
	PaletteCommand,
	PaletteCoreCommand,
	PaletteNavigationCommand,
	ResolvedPaletteCommand,
} from './queries/command-availability';
export {
	listPaletteCommands,
	resolvePaletteCommand,
	searchPaletteCommands,
} from './queries/command-availability';

export type {
	ActiveMapLayerView,
	ActiveMapQueryResult,
	ActiveMapView,
	SessionParticipantStatus,
	SessionWidgetMode,
} from './queries/session-control';
export {
	getActiveMapViewForActor,
	getSessionParticipantStatus,
	getSessionWidgetMode,
} from './queries/session-control';

export type {
	PlayerViewControllerAssignment,
	PlayerViewControllerParticipant,
	PlayerViewControllerQueryResult,
	PlayerViewControllerSceneOption,
} from './queries/player-view-control';
export { getPlayerViewController } from './queries/player-view-control';

export type { WidgetPackageExport } from './commands/widget-package';
export { exportWidgetPackage } from './commands/widget-package';
