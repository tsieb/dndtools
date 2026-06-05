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

// PERM-001 / PERM-011: base-role floor + observer ceiling. Pure Processing-Core permission
// policy (Contract 3, Base Roles). The base role floor is computed first and caps the participant;
// grants are additive only within the role ceiling and are dropped when they would exceed it, so
// no grant record can ever elevate an Observer above a read-only, no-character surface.
export type {
	BasePermissionFloor,
	BaseRoleResolution,
	BaseRoleResolutionReason,
	DroppedGrant,
	DroppedGrantReason,
	EffectivePermissions,
	PermissionAction,
	RoleAssignmentRecord,
} from './permissions/base-roles';
export {
	LEAST_PRIVILEGED_ROLE,
	computeBasePermissionFloor,
	computeEffectivePermissions,
	computeEffectivePermissionsForActor,
	isCharacterEntityType,
	isWriteCapableCapabilitySet,
	resolveBaseRole,
	roleRecordsForActor,
} from './permissions/base-roles';

// PERM-011 / PERM-007 (PERM-001 side): DM-facing permission consistency audit and the
// fail-closed character-data read guard. A dropped observer write/character grant is surfaced to
// the DM as a consistency error; an Observer requesting character data always receives nothing.
export type {
	CharacterReadDecision,
	PermissionConsistencyProblem,
	PermissionConsistencyProblemKind,
	PermissionConsistencyReport,
	PermissionConsistencySeverity,
} from './permissions/consistency';
export {
	auditActorGrantConsistency,
	auditPermissionConsistency,
	decideCharacterDataRead,
	readCharacterDataForActor,
} from './permissions/consistency';

// PERM-007: entity-scoped permission consistency audit (Contract 3 Consistency Requirements).
// Detects write grants on hidden content, unknown capability sets, grants on deleted entities,
// multiple character owners, observer write grants, and hidden widget bindings in player views.
// Pure and non-leaking: problems carry only entity references, grants, and generic remediation.
export type {
	ConsistencyEntityRecord,
	ConsistencyEntityVisibility,
	EntityConsistencyInput,
	EntityConsistencyProblem,
	EntityConsistencyProblemKind,
	EntityConsistencyReport,
	PlayerViewWidgetBinding,
} from './permissions/consistency';
export { auditEntityPermissionConsistency } from './permissions/consistency';

// PERM-007 / PERM-009: the system-defined capability-set schema per entity type (Contract 3
// Minimum Capability Sets) and its version. Unknown-capability detection and the cache-invalidating
// schema version both derive from here.
export {
	CAPABILITY_SCHEMA_VERSION,
	CAPABILITY_SET_SCHEMA,
	SINGULAR_OWNERSHIP_CAPABILITY,
	hasCapabilitySchemaForEntityType,
	isKnownCapabilitySet,
	singularOwnershipCapabilityFor,
} from './permissions/capability-schema';

// PERM-009: deterministic, synchronous participant capability cache + invalidation. The cache is
// keyed by a per-participant fingerprint of all inputs/versions that affect effective
// capabilities; a change to any trigger (grants, visibility, roles, ownership, schema version)
// invalidates exactly the affected participants. Fail-closed: schema-version changes invalidate
// everyone. No timers/background system — invalidation is synchronous on the triggering change.
export type {
	CapabilityCache,
	CapabilityCacheEntry,
	CapabilityCacheInputs,
	CapabilityCacheTrigger,
	InvalidationResult,
} from './permissions/capability-cache';
export {
	EMPTY_CAPABILITY_CACHE,
	buildCapabilityCache,
	computeCapabilityFingerprint,
	invalidateCapabilityCache,
	isCapabilityCacheEntryValid,
} from './permissions/capability-cache';

// PERM-010: denial audit for denied cross-trust-boundary access. The public denial and the audit
// record never leak hidden content; a hidden-existence denial is indistinguishable from not-found.
export type {
	AccessAuditResult,
	AccessDenialAuditRecord,
	AccessDenialPublicResult,
	AccessDenialReason,
	AccessKind,
	AccessRequest,
	AuditAccessOptions,
	PublicDenialReason,
} from './permissions/access-audit';
export { auditAccessAttempt } from './permissions/access-audit';

// PERM-014: actionable DM permission/visibility/role diagnostics with an actor-scoped projection.
// The DM sees actionable references + remediation; non-DM/unauthorized actors see only a generic
// reason. Leak-proof by construction — diagnostics carry no titles or field values.
export type {
	ActorPermissionDiagnosticsView,
	DmPermissionDiagnostic,
	DmPermissionDiagnosticsView,
	PermissionDiagnosticsInput,
	PermissionDiagnosticsResult,
} from './permissions/permission-diagnostics';
export {
	actorCanViewPermissionDiagnostics,
	getPermissionDiagnostics,
	getPermissionDiagnosticsForDm,
} from './permissions/permission-diagnostics';

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
	RouteAuditInput,
	RouteAuditProblem,
	RouteAuditProblemKind,
	SectionActorAvailability,
	SectionOwnerDomain,
	SectionReleaseStatus,
} from './queries/navigation-sections';
export {
	CANONICAL_NAVIGATION_SECTIONS,
	auditNavigationRoutes,
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
	RouteAccessibility,
	RouteAccessibilityOptions,
} from './queries/navigation-view';
export {
	DEFAULT_APP_NAME,
	listReachableDestinations,
	resolveNavigationView,
	resolveRouteAccessibility,
} from './queries/navigation-view';

export type {
	AliasRouteDescriptor,
	RouteAliasAuditInput,
	RouteAliasRedirect,
	RouteAliasRequest,
	RouteAliasSearchParam,
	RouteAliasStubProblem,
	RouteAliasTableEntry,
} from './queries/route-aliases';
export {
	auditRouteAliasStubs,
	buildRouteAliasTable,
	listAliasRoutes,
	resolveRouteAlias,
} from './queries/route-aliases';

export type {
	HeadingAnchorFocusTarget,
	RouteFocusInput,
	RouteFocusTarget,
	RouteLandmarkFocusTarget,
} from './queries/route-focus';
export { resolveRouteFocus } from './queries/route-focus';

export type {
	DeepLinkEntityType,
	DeepLinkResolution,
	DeepLinkRestore,
	DeepLinkStateView,
	DeepLinkTarget,
	DeepLinkUnavailable,
	DeepLinkUnavailableReason,
} from './queries/deep-links';
export { DEEP_LINK_UNAVAILABLE_MESSAGE, resolveDeepLink } from './queries/deep-links';

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

export type {
	BeginMigrationInput,
	DocumentIntegrityRecord,
	DocumentMigrationPlan,
	DocumentMigrationStatus,
	DurableStateDocumentId,
	IntegrityProblem,
	IntegrityProblemKind,
	IntegrityReport,
	MigrationBlockingIssue,
	MigrationBlockingReason,
	MigrationDryRunResult,
	MigrationJournalEntry,
	MigrationPhase,
	PersistedDocumentVersion,
	RecoveryAction,
	RecoveryDecision,
	SafetySnapshot,
} from './migration';
export {
	DURABLE_STATE_DOCUMENT_IDS,
	MIGRATION_JOURNAL_SCHEMA_VERSION,
	TARGET_SCHEMA_VERSIONS,
	beginMigration,
	markCommitted,
	markCommitting,
	markRolledBack,
	planMigration,
	recoverFromJournal,
	targetSchemaVersion,
	verifyIntegrity,
} from './migration';

export type {
	CapabilityAvailability,
	CapabilityStatusView,
	DiagnosticsContextInput,
	DiagnosticsDenialReason,
	DmDiagnosticsResult,
	DmDiagnosticsView,
	ParticipantCapabilityStatus,
	ParticipantConnectionState,
	ParticipantDeliveryState,
	ParticipantSafeStatusSummary,
	ParticipantStatusInput,
	ParticipantStatusResult,
	ParticipantStatusView,
	ParticipantSyncState,
	PlatformCapabilityInput,
	SchemaHealthInput,
	SchemaHealthView,
	SupportBundle,
	SupportBundleOptions,
	SupportBundleResult,
	SyncSourceState,
	SyncSourceStatusInput,
	SyncSourceStatusView,
	SystemHealthLevel,
} from './diagnostics';
export {
	DIAGNOSTICS_ENTITY_ID,
	DIAGNOSTICS_ENTITY_TYPE,
	DIAGNOSTIC_GRANT_CAPABILITY,
	REDACTED_PATH,
	REDACTED_SECRET,
	actorCanViewDmDiagnostics,
	containsSensitiveData,
	deriveHealthLevel,
	exportSupportBundle,
	getDmDiagnostics,
	getParticipantStatus,
	redactPaths,
	redactSecretsInText,
	redactValue,
	toParticipantSafeSummary,
	toSyncSourceStatusView,
} from './diagnostics';

// PLAT-007: platform-service boundary (named methods, runtime schemas, size limits,
// enum allowlist, structured errors).
export type {
	PlatformBoundaryError,
	PlatformBoundaryErrorCode,
	PlatformBoundaryResult,
	PlatformServiceMethod,
	PlatformServiceMethodDefinition,
	PlatformServiceRegistry,
} from './platform/service-boundary';
export {
	DEFAULT_MAX_PAYLOAD_BYTES,
	PLATFORM_SERVICE_METHODS,
	createPlatformServiceRegistry,
	isPlatformServiceMethod,
	validatePlatformRequest,
} from './platform/service-boundary';
export {
	createStoragePlatformServiceRegistry,
	loadCoreStateRequestSchema,
	persistFullStateRequestSchema,
	recoverPendingMigrationRequestSchema,
	resetCoreStorageRequestSchema,
} from './schemas/platform-service';

// PLAT-011: type-only cross-boundary contract (no runtime values may live here).
export type {
	PlatformBoundaryErrorShape,
	PlatformBoundaryOutcome,
	PlatformServiceMethodName,
	StoragePort,
} from './contracts/platform-boundary.contract';

// PLAT-001: platform profile capability descriptors + runtime profile selection. The shell
// resolves a profile from an environment descriptor; feature components branch on the resolved
// capabilities, never on raw viewport width.
export type {
	PlatformEnvironmentDescriptor,
	PlatformInputModality,
	PlatformProfile,
	PlatformServiceAvailability,
	PlatformServiceCapabilities,
	PlatformStorageKind,
	PlatformViewportClass,
} from './platform/platform-profile';
export {
	PLATFORM_PROFILES,
	hasService,
	isCompactPresentation,
	platformProfile,
	selectPlatformProfile,
	serviceAvailability,
} from './platform/platform-profile';

// PLAT-016: published web/PWA cached read/write support matrix (data artifact + fail-closed
// capability resolution for unsupported features).
export type {
	AuthRequirement,
	PlatformSupportMatrix,
	SupportDomainEntry,
	SupportDomainId,
	SupportLevel,
	UnsupportedFeatureEntry,
	UnsupportedFeatureId,
} from './platform/support-matrix';
export {
	SUPPORT_MATRIX_VERSION,
	WEB_SUPPORT_MATRIX,
	capabilityForFeature,
	domainSupportLevel,
	matrixServiceInconsistencies,
	supportDomain,
} from './platform/support-matrix';

// PLAT-002: type-only desktop (Electron) shell platform-service contract (no native wiring in
// the first slice; declared so feature components degrade against the capability descriptor).
export type {
	DesktopDialogService,
	DesktopFileWatchService,
	DesktopFilesystemService,
	DesktopIpcRequest,
	DesktopMcpSidecarService,
	DesktopPlatformServices,
	DesktopProtocolService,
	DesktopUpdateService,
	TitlebarControl,
	TitlebarWindowState,
} from './contracts/desktop-shell.contract';
export type {
	TitlebarAuditFailure,
	TitlebarAuditFailureReason,
	TitlebarAuditOptions,
	TitlebarAuditResult,
	TitlebarTargetMeasurement,
} from './platform/titlebar';
export {
	DEFAULT_TITLEBAR_HEIGHT_PX,
	TITLEBAR_CHROME_BASELINE_PX,
	auditTitlebarTargets,
	titlebarControlsForState,
} from './platform/titlebar';

// PLAT-005: type-only Android (Capacitor) shell platform-service contract (no native bridge in
// the first slice; feature logic receives platform-service results, never raw native access).
export type {
	AndroidFileImportResult,
	AndroidFilesystemService,
	AndroidKeyboardInsets,
	AndroidKeyboardService,
	AndroidPlatformServices,
	AndroidShareImportService,
} from './contracts/android-shell.contract';

// PLAT-014: declared cross-profile platform support-status artifact (parity / degradation /
// unsupported per profile) + the release gate that blocks unsupported Must-have commands.
export type {
	CommandPriority,
	CommandProfileStatus,
	CommandSupportStatus,
	PlatformSupportStatusArtifact,
	ProfileSupport,
	ProfileSupportSummary,
	SupportStatusProblem,
	SupportStatusProblemKind,
} from './platform/support-status';
export {
	PLATFORM_SUPPORT_STATUS,
	SUPPORT_STATUS_VERSION,
	summarizeProfileSupport,
	supportStatusServiceInconsistencies,
	validateSupportStatus,
} from './platform/support-status';

// PLAT-010: the tiered, owned, time-bounded quality-gate registry + validators. The structured
// source of truth the enforcing script (`scripts/quality-gates.ts`) fails closed against.
export type {
	DefectClass,
	GateProblem,
	GateProblemKind,
	PathGlob,
	QualityGate,
	QualityGateTier,
	QualityGateTierBudget,
} from './platform/quality-gates';
export {
	QUALITY_GATE_BUDGETS,
	QUALITY_GATE_REGISTRY_VERSION,
	QUALITY_GATES,
	REVIEW_WINDOW_DAYS,
	SMOKE_TARGET_MS,
	checkBudgets,
	pathMatchesGlob,
	selectGatesForPaths,
	tierBudget,
	validateGateRegistry,
} from './platform/quality-gates';

// PLAT-013: fresh-vault onboarding, feature-tier visibility, maturity gates, help surfaces, and
// first-run Command Center setup — modeled in the core so the GUI renders from query results.
export type {
	FeatureGate,
	FeatureTier,
	FirstRunStep,
	HelpSurface,
	OnboardingStatus,
	OnboardingView,
} from './state/onboarding';
export {
	DEFAULT_FEATURE_TIER,
	FEATURE_GATES,
	FEATURE_TIERS,
	HELP_SURFACES,
	isFeatureVisible,
	isFreshVault,
	resolveOnboarding,
	tierMeets,
	visibleFeatures,
} from './state/onboarding';

// PLAT-018: durable command lifecycle states.
export type {
	CommandLifecycleState,
	CommandLifecycleStatus,
	CommandRecoveryAction,
} from './lifecycle/command-lifecycle';
export {
	UNDOABLE_COMMAND_TYPES,
	canCancel,
	canRetry,
	canUndo,
	createCommandLifecycle,
	inverseCommandType,
	isUndoableCommandType,
	markCancelled,
	markFailure,
	markPending,
	markSuccess,
	markUndone,
	recoveryAction,
} from './lifecycle/command-lifecycle';
