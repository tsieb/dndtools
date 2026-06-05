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
	DiceRollSourceKind,
	DiceRollVisibility,
	HandoutDeliveryRecord,
	HandoutSection,
	HandoutSectionVisibility,
	PlayerViewDeliveryStatus,
	PlayerViewProjectionKind,
	PlayerViewProjectionTarget,
	QuickReferencePanel,
	QuickReferenceTargetKind,
	SessionActiveMapProjection,
	SessionActiveMapSelection,
	SessionArchiveSnapshot,
	SessionDiceRoll,
	SessionHandout,
	SessionPlayerViewAssignment,
	SessionState,
	SessionTimer,
	SessionWorkflowState,
} from './state/session-state';
export {
	DICE_ROLL_VISIBILITIES,
	EMPTY_SESSION_STATE,
	SESSION_STATE_SCHEMA_VERSION,
	SESSION_WORKFLOW_STATES,
} from './state/session-state';

export type {
	MapEntity,
	MapFeature,
	MapLayer,
	MapLayerCategory,
	MapLayerDefaults,
	MapProjection,
	MapProjectionKind,
	MapRegion,
	MapScale,
	MapState,
} from './state/map-state';

// MAP-008 / MAP-017: the durable map NESTING model — typed embed reference + 2D affine transform
// math + graph integrity. An embed references the child BY ID (never a copy), so the child keeps its
// own independent layers + visibility/permission model. Pure Processing-Core policy: cycle detection,
// max-depth enforcement, ancestor/descendant walks, and transform composition/inversion are
// deterministic functions; the GUI/renderer (deferred per ADR-014) consumes the computed model.
export type {
	AddEmbedRequest,
	AffineMatrix,
	MapEmbed,
	MapEmbedTransform,
	MapNestingError,
	MapTransitionBehavior,
	Point2D,
	UpdateEmbedPatch,
} from './state/map-nesting';
export {
	DEFAULT_TRANSITION_THRESHOLD,
	IDENTITY_MATRIX,
	MAX_NESTING_DEPTH,
	SUPPORTED_TRANSITION_BEHAVIORS,
	addEmbed,
	ancestorMapIds,
	applyMatrix,
	composeChain,
	composeMatrix,
	depthFromRoot,
	descendantMapIds,
	directChildMapIds,
	embedTransformToMatrix,
	invertMatrix,
	longestPathFromAnyRoot,
	matrixDeterminant,
	removeEmbed,
	subtreeDepth,
	updateEmbed,
	validateAddEmbed,
	validateEmbedTransform,
	validateTransitionThreshold,
} from './state/map-nesting';

// MAP-009 / MAP-017: the LOGICAL parent↔child viewport-transition model + non-leaking child-embed
// resolution. Visibility-filtered: a participant can only transition into a child they can see; a
// hidden/deleted/missing child collapses to ONE generic `unavailable` (indistinguishable, no
// name/content leak — same contract as the NAV deep-link resolver). Per ADR-014 this is the logical
// model only (no animation); the GUI reflects the computed viewport.
export type {
	MapChildUnavailableReason,
	MapTransition,
	MapViewport,
	ResolvedEmbed,
} from './queries/map-transition';
export {
	FULL_MAP_VIEWPORT,
	MAP_CHILD_UNAVAILABLE_MESSAGE,
	computeTransitionIntoChild,
	computeTransitionToParent,
	projectPointThroughChain,
	resolveEmbedsForActor,
} from './queries/map-transition';
export {
	DEFAULT_MAP_PROJECTION,
	EMPTY_MAP_STATE,
	MAP_STATE_SCHEMA_VERSION,
	SUPPORTED_MAP_PROJECTIONS,
	createDemoMapState,
	normalizeMapEntity,
	normalizeMapLayer,
} from './state/map-state';

// MAP-002: content-addressed map assets. The asset id IS the hash of its bytes (identical bytes dedupe
// to one asset; the hash is the integrity check). Pure + deterministic (no DOM/crypto.subtle) so the
// same bytes hash identically on every device. Size/MIME validated fail-closed before any mutation.
export type {
	AssetValidationError,
	BuildAssetInput,
	MapAsset,
	MapAssetDimensions,
	MapAssetKind,
} from './state/map-assets';
export {
	ASSET_HASH_ALGORITHM,
	DEFAULT_MAX_ASSET_BYTES,
	MAP_ASSET_SCHEMA_VERSION,
	NATIVE_ASSET_MIME_TYPES,
	assetId,
	buildMapAsset,
	hashAssetBytes,
	nativeAssetKind,
} from './state/map-assets';

// MAP-002 / MAP-020: external-format adapter registry (typed capability descriptor — external scene
// formats require a DECLARED adapter, else import is rejected fail-closed) + the safe, transactional
// import preview/staging. Preview is read-only and carries the capability summary + non-leaking
// per-element diagnostics (importable/lossy/unsupported). Staging is a pure staged-then-commit reducer:
// not adopting its result leaves the prior state byte-identical (rollback). No GUI reaches storage.
export type {
	MapImportAdapterCapabilitySummary,
	MapImportAdapterDescriptor,
	MapImportAdapterRegistry,
	MapImportAssetInput,
	MapImportElementDiagnostic,
	MapImportElementKind,
	MapImportElementSupport,
	MapImportPreview,
	MapImportRejectionReason,
	MapImportRequest,
	StagedMapImport,
	StageMapImportInput,
} from './state/map-import';
export {
	EMPTY_MAP_IMPORT_ADAPTER_REGISTRY,
	MAP_IMPORT_SCHEMA_VERSION,
	createMapImportAdapterRegistry,
	previewMapImport,
	stageMapImport,
	summarizeAdapterCapabilities,
} from './state/map-import';

// MAP-004: deterministic, seeded PRNG. The determinism anchor for procedural generation — no
// Math.random/Date.now/ambient entropy, so the same seed yields the same stream on every device.
export type { SeededRng } from './state/prng';
export { createRng, normalizeSeed } from './state/prng';

// MAP-003: pure draw/paint reducers. An edit replaces a layer's content, capturing before+after so it
// is undoable (inverse swaps before/after) and sync-replayable (the op carries both). Fail-closed on a
// locked layer, a stale before-base, or content outside normalized map space.
export type { ApplyLayerEditInput, MapEditError, MapEditStamp } from './state/map-editing';
export { applyLayerEdit, featuresEqual, layerContent } from './state/map-editing';

// MAP-004: deterministic procedural generation of editable map layers from explicit params + seed.
// Validates fail-closed first (no partial layers on rejection); same params ⇒ identical layers.
export type {
	GenerateMapLayersResult,
	MapGenerationError,
	MapGenerationKind,
	MapGenerationParams,
} from './state/map-generation';
export {
	MAX_GENERATION_DIMENSION,
	MIN_GENERATION_DIMENSION,
	generateMapLayers,
	validateGenerationParams,
} from './state/map-generation';

// MAP-005 / MAP-006: pure layer reducers (create/rename/reorder/duplicate/lock/delete + the three
// INDEPENDENT presentation axes: player-visibility, DM-display, opacity, plus tags). Locked layers
// reject mutation fail-closed; `order` stays dense; each mutated layer is revision-stamped. The
// command handlers compose these; storage is never touched here.
export type {
	CreateLayerInput,
	MapLayerError,
	MapLayerMutationKind,
	MapLayerStamp,
} from './state/map-layers';
export {
	createLayer,
	deleteLayer,
	duplicateLayer,
	findLayer,
	renameLayer,
	reorderLayer,
	setLayerDmEnabled,
	setLayerLock,
	setLayerOpacity,
	setLayerPlayerVisibility,
	setLayerTags,
	sortedLayers,
} from './state/map-layers';

// MAP-007: tag / metadata layer query — visibility-filtered and FAIL-CLOSED. A non-DM result omits
// (never redacts) hidden matches and exposes no hidden count; the DM result reports the
// player-hidden match count. `mapLayerConsistencyRecords` bridges layer visibility/order/opacity
// into the existing capability-cache + visibility-cache invalidation (Contract 3 Session Join rule 4).
export type {
	MapLayerQuery,
	MapLayerQueryEntry,
	MapLayerQueryOptions,
	MapLayerQueryResult,
} from './queries/map-layer-query';
export {
	mapLayerVisibilityMetadata,
	mapLayerVisibilitySurfaces,
	queryMapLayers,
} from './queries/map-layer-query';

// MAP-016: pre-projection map-layer visibility consistency audit. DM-facing and NON-LEAKING (entity
// references + generic remediation only). Blocks projection on errors (visible route → hidden POI;
// visible overlay omits a required token; visible nested-link → hidden map); warns on safely-omitted
// hidden content. Follows the `consistency.ts` audit pattern.
export type {
	MapFogRecord,
	MapNestedLink,
	MapPoiRecord,
	MapProjectionConsistencyReport,
	MapProjectionElementKind,
	MapProjectionInput,
	MapProjectionProblem,
	MapProjectionProblemKind,
	MapProjectionSeverity,
	MapRouteRecord,
	MapTokenRecord,
} from './permissions/map-projection-consistency';
export {
	actorCanViewMapProjectionConsistency,
	auditMapProjectionConsistency,
	getMapProjectionConsistencyForActor,
} from './permissions/map-projection-consistency';

// MAP-010 / MAP-011 / MAP-012 / MAP-013 / MAP-019: durable map ANNOTATION model (POIs, routes, fog,
// tokens) + pure reducers. Every annotation lives on a layer, carries its OWN player-facing visibility
// (independent of map/layer), and stores normalized coordinates so it survives scale/projection. The
// reducers validate fail-closed (normalized bounds, non-empty label, ≥2-waypoint route, positive size).
export type {
	AppendFogOpInput,
	CreatePoiInput,
	CreateRouteInput,
	CreateTokenInput,
	MapAnnotationError,
	MapAnnotationStamp,
	MapFogOp,
	MapFogOpKind,
	MapPoi,
	MapPoiCategory,
	MapRoute,
	MapRouteWaypoint,
	MapToken,
	MoveTokenInput,
	NormalizedPoint,
	RouteWaypointInput,
	UpdatePoiPatch,
	UpdateRoutePatch,
	UpdateTokenPatch,
} from './state/map-annotations';
export {
	MAP_POI_CATEGORIES,
	appendFogOp,
	createPoi,
	createRoute,
	createToken,
	deletePoi,
	deleteRoute,
	deleteToken,
	isNormalizedPoint,
	isNormalizedRegion,
	moveToken,
	removeFogOp,
	updatePoi,
	updateRoute,
	updateToken,
} from './state/map-annotations';

// MAP-013: pure, deterministic route distance + travel-time math, derived from waypoints + map scale
// (+ optional speed); never stored on the route. Also the token range / AoE radius measurement.
export type { RouteMeasurement, TravelSpeed } from './state/map-travel';
export {
	measureRange,
	measureRoute,
	normalizedPathLength,
	normalizedSegmentLength,
} from './state/map-travel';

// MAP-014: combat overlay MODE config with DECLARED PREREQUISITE visual state. Entering a mode whose
// prerequisite (e.g. a visible grid) is unmet is blocked with a reason unless auto-satisfied; the gate
// is enforced fail-closed even against a forced transition.
export type {
	ConfigureOverlayError,
	ConfigureOverlayPatch,
	EnterModeInput,
	MapOverlayMode,
	MapOverlayModeError,
	MapOverlayPrerequisite,
	MapOverlaySettings,
} from './state/map-overlay-modes';
export {
	DEFAULT_MAP_OVERLAY_SETTINGS,
	MAP_OVERLAY_MODES,
	MODE_PREREQUISITES,
	configureOverlay,
	enterOverlayMode,
	normalizeOverlaySettings,
} from './state/map-overlay-modes';

// MAP-018: THE single actor-filtered map query model. Search, graph, widget, MCP, and deep-link
// surfaces all consume this — never raw MapState — so a hidden POI/route/fog/token cannot leak through
// one surface while blocked on another. POIs/routes/fog/tokens/overlay come back already filtered for
// the actor (omitted, not redacted); the DM additionally gets hidden-count aggregates.
export type {
	MapFogView,
	MapGraphEdge,
	MapHiddenCounts,
	MapLayerView,
	MapPoiView,
	MapQueryOptions,
	MapRouteView,
	MapSearchHit,
	MapTokenView,
	MapView,
	MapViewResult,
} from './queries/map-query';
export {
	deliveredMapIdsForActor,
	getMapViewForActor,
	mapGraphEdgesForActor,
	searchMapsForActor,
} from './queries/map-query';

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
	commitMapImportInputSchema,
	createMapInputSchema,
	createMapLayerInputSchema,
	deleteMapLayerInputSchema,
	disableWidgetPackageInputSchema,
	dockWidgetInputSchema,
	duplicateMapLayerInputSchema,
	dispatchWidgetCommandInputSchema,
	embedChildMapInputSchema,
	editMapLayerInputSchema,
	enableWidgetPackageInputSchema,
	generateMapLayersInputSchema,
	ensureCommandCenterHomeInputSchema,
	grantCapabilitySetInputSchema,
	importMapAssetInputSchema,
	groupWidgetsInputSchema,
	installWidgetPackageInputSchema,
	instantiateSceneTemplateInputSchema,
	layerWidgetInputSchema,
	lockMapLayerInputSchema,
	deliverHandoutInputSchema,
	revealHandoutSectionInputSchema,
	pinQuickReferenceInputSchema,
	unpinQuickReferenceInputSchema,
	moveGroupInputSchema,
	moveWidgetInputSchema,
	pinWidgetInputSchema,
	projectPlayerViewInputSchema,
	projectActiveMapInputSchema,
	removeWidgetPackageInputSchema,
	renameMapLayerInputSchema,
	reorderMapLayerInputSchema,
	recordSessionDiceInputSchema,
	removeMapEmbedInputSchema,
	revokeGrantInputSchema,
	revokePlayerViewInputSchema,
	resizeWidgetInputSchema,
	transferOwnershipInputSchema,
	updateMapEmbedInputSchema,
	saveCommandCenterPresetInputSchema,
	saveSceneTemplateInputSchema,
	setActiveMapInputSchema,
	setMapLayerEnabledInputSchema,
	setMapLayerOpacityInputSchema,
	setMapLayerTagsInputSchema,
	setMapLayerVisibilityInputSchema,
	setSceneSectionsInputSchema,
	setSessionWorkflowInputSchema,
	setWidgetFocusOrderInputSchema,
	updateSceneMetadataInputSchema,
	upgradeWidgetPackageInputSchema,
} from './schemas/commands';

export { sceneSchema, sceneStateSchema } from './schemas/scene';

export {
	actorCanAuthorScene,
	actorCanCoEditScene,
	effectiveCapabilitySetsForActorOnEntity,
	hasGrantedCapability,
} from './permissions/grants';

// PERM-004 / PERM-013: durable grant + transfer record primitives (validation, expiry, pure
// grant-list reducers, and the atomic singular-capability transfer). The grant/transfer command
// handlers compose these; storage is never touched here.
export type {
	GrantRecordInput,
	GrantValidationError,
	GrantValidationResult,
	OwnershipTransferResult,
	TransferValidationError,
	TransferValidationResult,
} from './permissions/grant-records';
export {
	buildGrantRecord,
	computeOwnershipTransfer,
	isGrantActive,
	isGrantExpired,
	revokeGrantById,
	singularGrantsOnEntity,
	upsertGrant,
	validateGrantRecord,
	validateOwnershipTransfer,
} from './permissions/grant-records';

// PERM-005 / PERM-006 / PERM-008: capability-set inheritance rules, human explanations, the
// grantable-set list, and the effective-permission PREVIEW the DM grant UI renders. All computed
// in core; capability sets remain schema-defined named options, never raw field lists.
export type { CapabilitySetDescriptor, GrantEffectivePreview } from './permissions/capability-sets';
export {
	capabilitySetGrants,
	describeCapabilitySet,
	inheritedCapabilitySets,
	listGrantableCapabilitySets,
	previewGrantEffect,
} from './permissions/capability-sets';
export { canActorSeeScene, evaluateSceneVisibility } from './permissions/visibility';
export type { SceneVisibilityResult } from './permissions/visibility';

// PERM-002 / PERM-003: the visibility-filtering engine — the SECURITY KEYSTONE choke-point every
// non-DM read path passes through. Three levels (`dm-only`/`player-visible`/`shared`, where
// `shared` means delivery only through player-view assignment / handout delivery / viewer grant),
// authorable at entity/section/field granularity with field>section>entity precedence and
// hidden-ancestor-wins. Fail closed: absent/unknown visibility ⇒ `dm-only` (least visible).
export type {
	EntityVisibilityMetadata,
	FilterableContent,
	FilteredContent,
	VisibilityDecision,
	VisibilityDenialReason,
	VisibilityLevel,
	VisibilityRule,
	VisibilityScope,
	VisibilityTarget,
} from './permissions/visibility-filter';
export {
	DEFAULT_VISIBILITY,
	evaluateVisibility,
	filterEntityForActor,
	isEntityVisibleToActor,
	normalizeVisibilityLevel,
} from './permissions/visibility-filter';

// PERM-012: visibility revoke/change + invalidation. Reuses the capability-cache fingerprint-diff
// pattern (whose trigger list already names "visibility"): a per-actor visibility fingerprint folds
// in every granular rule + the actor's effective access, so narrowing a section/field/entity
// immediately invalidates exactly the affected actors' subscriptions, sync streams, cached data,
// and widget bindings — and a stale cache never serves a now-hidden surface. The entity-level
// bridge feeds the existing capability cache without duplicating it.
export type {
	VisibilityCache,
	VisibilityCacheEntry,
	VisibilityCacheInputs,
	VisibilityInvalidationResult,
	VisibilitySurfaceRef,
} from './permissions/visibility-invalidation';
export {
	EMPTY_VISIBILITY_CACHE,
	buildVisibilityCache,
	computeActorVisibilityFingerprint,
	computeVisibilityMetadataFingerprint,
	invalidateVisibilityCache,
	isVisibilityCacheEntryValid,
	toConsistencyEntityRecords,
} from './permissions/visibility-invalidation';

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

// CHAR-010: FIELD-SCOPED character-edit authority (Contract 3 "Minimum Capability Sets"). Maps a
// character field path to the MINIMUM capability set that may write it (narrative ⇒ backstory-editor,
// combat ⇒ combat-participant, identity/other ⇒ owner). The field-edit command is driven by this so a
// backstory-editor can edit ONLY the narrative surface, fail closed. Pure data + pure predicates.
export {
	BACKSTORY_EDITOR_DATA_KEYS,
	isBackstoryEditorField,
	requiredCapabilityForCharacterField,
} from './permissions/character-field-authority';

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

// MAP-015: the map control interaction-safety state machine. A pure Processing-Core reducer
// deciding whether the active POI popover / compact sheet / overlay / canvas control stays
// engaged given a raw interaction intent. Internal pointermove/hover-out/scroll/child-focus
// never dismiss; only explicit close, Escape, a true outside pointer, or selecting another POI
// do. The GUI dispatches intents and applies the returned focus directive (Contract 1).
export type {
	ControlFocusDirective,
	ControlId,
	ControlInteractionEvent,
	ControlInteractionPhase,
	ControlInteractionReason,
	ControlInteractionState,
	ControlPresentation,
} from './queries/control-interaction';
export {
	CLOSED_CONTROL_INTERACTION,
	controlInteractionReducer,
	isControlOpen,
	reduceControlInteractions,
} from './queries/control-interaction';

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

// SES-005 — the OPERATE-vs-CONFIGURE widget authority policy (Contract 3 Timer/Tool + Widget capability
// sets). An `operator` grant authorizes runtime OPERATE actions (start/pause/resume/reset/advance/roll/
// draw) WITHOUT authorizing CONFIGURE/DEFINE actions; configure requires `manager`. Fail closed both ways.
export type {
	WidgetCommandAuthorityDecision,
	WidgetCommandKind,
} from './permissions/widget-operator-authority';
export {
	CONFIGURE_ACTION_VERBS,
	OPERATE_ACTION_VERBS,
	classifyWidgetCommand,
	decideWidgetCommandAuthority,
	requiredCapabilityForWidgetCommand,
} from './permissions/widget-operator-authority';

// SES-004 — THE single actor-filtered HANDOUT read model. A NON-RECIPIENT receives `{ kind:
// 'unavailable' }` with NO content (the non-leak guarantee); a recipient/DM sees only the sections they
// may see, with progressive reveal folded into the PERM visibility-filter. The delivery history is DM-only.
export type {
	HandoutDeliveryView,
	HandoutQueryResult,
	HandoutSectionView,
	HandoutUnavailable,
	HandoutView,
} from './queries/handout-query';
export {
	getHandoutDeliveryHistory,
	getHandoutForActor,
	getHandoutsForActor,
} from './queries/handout-query';

// SES-007 — THE single actor-filtered QUICK-REFERENCE read model. DM-only (a non-DM gets an empty list).
// Each pinned panel resolves its reference against the LIVE actor-filtered target; a hidden/deleted target
// degrades to an `unavailable` panel (no crash, no leak). Durable pin state survives route changes.
export type {
	QuickReferenceContent,
	QuickReferencePanelView,
} from './queries/quick-reference-query';
export {
	getQuickReferencePanelsForActor,
	resolveQuickReferencePanelForActor,
} from './queries/quick-reference-query';

export type { WidgetPackageExport } from './commands/widget-package';
export { exportWidgetPackage } from './commands/widget-package';

// MAP-003: build the inverse of a paint edit (before/after swapped) for the undo path. Pure — the
// caller dispatches the returned `map.edit-layer` intent to restore the captured prior content.
export { buildInverseMapEditCommand } from './commands/map-editing';

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

// CHAR-001 / CHAR-002 / CHAR-013: the foundational character state model — finalized characters
// (DM quick-create + finalized PCs) and pre-finalization drafts with EXACTLY ONE owner. Pure
// reducers: quick-create (dm-only visibility default fails closed), draft create/step/finalize, and
// the ATOMIC draft-ownership transfer (the same singular-ownership invariant as PERM-013).
export type {
	AbilityScores,
	Character,
	CharacterAttack,
	CharacterCombatState,
	CharacterDraft,
	CharacterDraftStepProgress,
	CharacterKind,
	CharacterState,
	CreateDraftInput,
	DraftTransferError,
	DraftTransferResult,
	PartyInventoryItem,
	PartyRecord,
	QuickCreateCharacterInput,
	UpsertPartyInventoryInput,
} from './state/character-state';
export {
	CHARACTER_DRAFT_ENTITY_TYPE,
	CHARACTER_ENTITY_TYPE,
	CHARACTER_STATE_SCHEMA_VERSION,
	EMPTY_CHARACTER_STATE,
	EMPTY_COMBAT_STATE,
	EMPTY_PARTY_RECORD,
	applyDraftStep,
	buildCharacterDraft,
	buildQuickCreatedCharacter,
	draftStepValues,
	ensureCharacterState,
	isDraftOwner,
	journalsOf,
	partyRecordOf,
	removeDraft,
	removePartyInventoryItem,
	setMarchingOrder,
	transferDraftOwnership,
	upsertCharacter,
	upsertDraft,
	upsertPartyInventoryItem,
} from './state/character-state';

// CHAR-012 / CHAR-016: the durable CHARACTER JOURNAL model — per-character entries (bookmarks, NPC
// impressions, personal quests, session highlights) each carrying their OWN canonical visibility.
// A new entry fails closed to `shared`-to-owner (owner-readable, DM-auditable, NOT player-visible).
export type {
	AddJournalEntryInput,
	CharacterJournal,
	CharacterJournalEntry,
	CharacterJournalState,
	JournalEntryKind,
	JournalEntryMeta,
	UpdateJournalEntryPatch,
} from './state/character-journal';
export {
	CHARACTER_JOURNAL_ENTITY_TYPE,
	CHARACTER_JOURNAL_SCHEMA_VERSION,
	EMPTY_CHARACTER_JOURNAL_STATE,
	JOURNAL_ENTRY_KINDS,
	addJournalEntry,
	buildJournalEntry,
	ensureCharacterJournalState,
	journalForCharacter,
	removeJournalEntry,
	setJournalEntryVisibility,
	updateJournalEntry,
} from './state/character-journal';

// CHAR-011 / CHAR-015: THE single actor-filtered PARTY-OVERVIEW read model (MAP-018 pattern) — visible
// HP/status/resource summaries, marching order, and party inventory, filtered per viewer. Observer
// gets an EMPTY overview (PERM-011 ceiling). Search/widgets/MCP all consume this, never raw state.
export type {
	PartyHiddenCounts,
	PartyInventoryView,
	PartyMemberSummary,
	PartyOverview,
} from './queries/party-overview';
export { getPartyOverviewForActor } from './queries/party-overview';

// CHAR-012 / CHAR-015 / CHAR-016: THE single actor-filtered CHARACTER-JOURNAL read model. Observer
// denied wholesale (PERM-011); per-entry visibility with DM/owner access and OTHER-PLAYER filtering;
// a hidden entry is omitted entirely (no title/snippet/id/count/edge). Search/widgets/MCP consume this.
export type {
	CharacterJournalView,
	JournalEntryView,
} from './queries/character-journal-query';
export {
	actorCanAuthorJournal,
	getCharacterJournalForActor,
} from './queries/character-journal-query';

// CONTENT-011: the CUSTOM (campaign) CALENDAR arithmetic + STABLE display formatting. Pure functions of
// (calendar definition, date value, format spec) ONLY — no Date/Intl/locale/timezone, same determinism
// discipline as the seeded PRNG. Custom months/day counts/epoch; day-of-year, comparison, month rollover.
export type {
	CalendarDateErrorCode,
	CalendarDateFormat,
	CalendarDateValidation,
	CalendarDefinition,
	CalendarMonth,
	CustomDate,
} from './state/calendar';
export {
	CALENDAR_SCHEMA_VERSION,
	absoluteDayIndex,
	addDays,
	compareCustomDates,
	createCalendarDefinition,
	dayOfYear,
	daysInMonth,
	daysInYear,
	formatCustomDate,
	fromAbsoluteDayIndex,
	isValidCustomDate,
	validateCustomDate,
	weekdayName,
} from './state/calendar';

// CONTENT-011: the durable VAULT CONTENT model — a campaign calendar registry + calendar-aware content
// items (notes/structured objects) with custom-date fields, timeline references, and per-item
// visibility. The first CONTENT slice; new items fail closed to `dm-only`. Pure data + pure reducers.
export type {
	AddContentEmbedInput,
	ContentEmbed,
	ContentEmbedKind,
	ContentItem,
	ContentItemKind,
	ContentItemMeta,
	CreateContentItemInput,
	TimelineReference,
	UpdateContentItemPatch,
	VaultContentState,
} from './state/content';
export {
	CONTENT_EMBED_KINDS,
	CONTENT_ITEM_ENTITY_TYPE,
	CONTENT_ITEM_KINDS,
	EMPTY_VAULT_CONTENT_STATE,
	VAULT_CONTENT_SCHEMA_VERSION,
	addContentEmbed,
	addContentItem,
	buildContentItem,
	calendarById,
	contentItemById,
	contentItemVisibilityMetadata,
	ensureVaultContentState,
	isLiveContentItem,
	liveContentItems,
	removeContentEmbed,
	removeContentItem,
	restoreContentItem,
	setContentFieldVisibility,
	setContentItemVisibility,
	setContentSectionVisibility,
	softDeleteContentItem,
	updateContentItem,
	upsertCalendarDefinition,
} from './state/content';

// CONTENT-009: granular SECTION/FIELD visibility detail read + CONTENT-010: actor-filtered EMBED-by-
// REFERENCE resolution + the content-item widget DATA ENVIRONMENT for entity-backed Scene widgets. The
// detail read REUSES the PERM visibility-filter precedence (field>section>entity, hidden-ancestor-wins);
// the embed resolver resolves each reference against the LIVE target so a viewer who cannot see the
// target gets the generic fail-closed `unavailable` placeholder (no clone, no leak).
export type {
	ContentItemDetailView,
} from './queries/content-query';
export {
	CONTENT_FIELD_PATH_PREFIX,
	contentFieldPath,
	getContentItemDetailForActor,
} from './queries/content-query';
export type {
	ContentEmbedUnavailableReason,
	ResolvedContentEmbed,
	ResolvedNoteSectionEmbed,
	ResolvedObjectCardEmbed,
	ResolvedRenderBlockEmbed,
	UnavailableEmbed,
} from './queries/content-embed';
export {
	buildContentWidgetDataEnvironment,
	resolveContentEmbedForActor,
	resolveContentEmbedsForActor,
} from './queries/content-embed';

// CONTENT-002: pure, deterministic markdown EDITOR support — frontmatter/wikilink VALIDATION (fail
// closed), a safe block-model PREVIEW (no raw HTML), and the active-wikilink-query caret helper. Reuses
// the markdown parser; the GUI renders the computed result and dispatches command intents (Contract 1).
export type {
	MarkdownPreview,
	MarkdownValidationIssue,
	MarkdownValidationResult,
	PreviewBlock,
	ValidationSeverity,
} from './state/content-editor';
export {
	CONTENT_EDITOR_SCHEMA_VERSION,
	activeWikilinkQuery,
	renderMarkdownPreview,
	validateMarkdownDraft,
} from './state/content-editor';

// CONTENT-003: pure, deterministic CONTENT TEMPLATES — variable substitution, starter presets, and
// VALIDATE-BEFORE-WRITE of the generated content through the EXISTING markdown/object validators (no
// parallel validation path). A missing required variable or invalid generated content is rejected fail
// closed; visibility fails closed to dm-only so a template can never silently widen visibility.
export type {
	ContentTemplate,
	ContentTemplateKind,
	ContentTemplatePresetSummary,
	ContentTemplateVariable,
	TemplateRenderIssue,
	TemplateRenderResult,
} from './state/content-templates';
export {
	CONTENT_TEMPLATE_KINDS,
	CONTENT_TEMPLATE_PRESETS,
	CONTENT_TEMPLATE_SCHEMA_VERSION,
	contentTemplatePreset,
	listContentTemplatePresets,
	renderTemplate,
	templatePlaceholders,
} from './state/content-templates';

// CONTENT-004: reusable SNIPPETS that CANNOT BYPASS validation, sanitization, or visibility. Inserting a
// snippet produces note text that funnels through the SAME validator (`validateMarkdownDraft`) and the SAME
// safe block-model renderer (`renderMarkdownPreview`, which never emits raw HTML) as hand-typed content,
// and a snippet inherits — never widens — the host note's visibility (all fail closed).
export type {
	ContentSnippet,
	ContentSnippetSummary,
	SnippetInsertionResult,
	SnippetInsertPosition,
} from './state/content-snippets';
export {
	CONTENT_SNIPPET_LIBRARY,
	CONTENT_SNIPPET_SCHEMA_VERSION,
	contentSnippet,
	inheritedSnippetVisibility,
	insertSnippet,
	listContentSnippets,
	previewInsertedSnippet,
	snippetCanInsertIntoVisibility,
} from './state/content-snippets';

// CONTENT-011: THE single actor-filtered CONTENT read model. Per-item visibility decided BEFORE any
// content is returned to ANY surface (note/graph/search/recap), with STABLE formatted dates. A hidden
// dated item is OMITTED ENTIRELY from calendar/timeline views (AC2). Deterministic ordering by date.
export type {
	CalendarEventView,
	ContentItemView,
	DeletedContentItemView,
	FormattedDateView,
	TimelineReferenceView,
} from './queries/content-query';
export {
	actorCanAuthorContent,
	getCalendarTimelineForActor,
	getContentItemsForActor,
	getDeletedContentItemsForActor,
} from './queries/content-query';

// CONTENT-001 / CONTENT-002: the actor-filtered NOTE SEARCH + the actor-filtered WIKILINK suggestion
// source. Both compose `getContentItemsForActor`, so a hit/snippet/suggestion can NEVER name a note the
// actor cannot see (no separate index to leak hidden content). Pure + deterministic ranking.
export type {
	ContentSearchHit,
	SearchSnippet,
	WikilinkSuggestion,
} from './queries/content-search';
export {
	searchContentForActor,
	suggestWikilinkTargetsForActor,
} from './queries/content-search';

// CONTENT-007 / CONTENT-008: pure, deterministic Obsidian-aware markdown parse/serialize — the
// determinism keystone for import/export. Preserves frontmatter properties, aliases, tags, wikilinks.
export type { ParsedMarkdownNote, ParsedWikilink } from './state/markdown';
export {
	MARKDOWN_PARSE_SCHEMA_VERSION,
	extractWikilinks,
	parseMarkdownNote,
	serializeMarkdownNote,
} from './state/markdown';

// CONTENT-007: transactional, resumable import. Preview is pure/read-only; the plan is deterministic and
// re-derivable on resume (already-applied steps are skipped — no double-write); applying is pure (a
// discarded result leaves prior state byte-identical — no partial commit).
export type {
	AppliedImport,
	ImportArchiveFile,
	ImportConflictPolicy,
	ImportFileAction,
	ImportPlan,
	ImportPlanStep,
	ImportPreview,
	ImportPreviewEntry,
	ImportSourceKind,
} from './state/content-import';
export {
	CONTENT_IMPORT_SCHEMA_VERSION,
	DNDTOOLS_PROPERTY_NAMESPACE,
	IMPORT_CONFLICT_POLICIES,
	applyContentImport,
	importEntryIdForPath,
	importItemIdForPath,
	planContentImport,
	previewContentImport,
} from './state/content-import';

// CONTENT-008: fail-closed export. PORTABLE composes the visibility filter (no dm-only/hidden) + the
// redaction scrub (no secrets/absolute paths). DM-BACKUP includes hidden content but STILL scrubs
// secrets/paths. Every export carries a validation report with a clean self-check.
export type {
	ContentExport,
	ContentExportMode,
	ExportContentInput,
	ExportedFile,
	ExportValidationNote,
	ExportValidationReport,
} from './state/content-export';
export {
	CONTENT_EXPORT_MODES,
	CONTENT_EXPORT_SCHEMA_VERSION,
	exportContent,
} from './state/content-export';

// CONTENT-012: SOURCE-SPECIFIC CONSTRAINTS — typed capability descriptors for the note sources
// (local markdown / Obsidian / Google Docs) + a PURE pre-write constraint check. Given a note's detected
// structures (via markdown.ts) and a target source, it reports BEFORE the write which formatting,
// properties, links, or unsupported structures would be lost/downgraded. FAIL-CLOSED: a lossy write
// requires an acknowledgment token (it never silently loses data); an unknown source/feature is
// unsupported. Modeled on the platform capability descriptors + the MAP-020 pre-commit diagnostic; the
// descriptors are the seam a future Obsidian/Google Docs transport plugs into (transports deferred per
// ADR-014). The check is read-only — it never mutates the local draft.
export type {
	ContentConstraintCheck,
	ContentConstraintDiagnostic,
	ContentFeatureSupport,
	ContentNoteFeature,
	ContentSourceCapabilitySummary,
	ContentSourceDescriptor,
	ContentSourceId,
	DetectedNoteStructures,
} from './state/content-constraints';
export {
	CONTENT_CONSTRAINTS_SCHEMA_VERSION,
	CONTENT_NOTE_FEATURES,
	CONTENT_SOURCE_DESCRIPTORS,
	CONTENT_SOURCE_IDS,
	checkContentSourceConstraints,
	checkDetectedStructuresAgainstSource,
	contentSourceDescriptor,
	detectNoteStructures,
	featureSupportForSource,
	isContentWriteAcknowledged,
	listContentSourceCapabilities,
	summarizeContentSourceCapabilities,
} from './state/content-constraints';

// CONTENT-013: the core VAULT OBJECT SUBTYPE SCHEMA REGISTRY — a typed catalog over the note-backed object
// substrate covering the ten initial v2 subtypes (note/character/map/handout/calendar-event/timeline-event/
// dice-table/encounter/audio-preset/widget-package-ref). It REFERENCES the already-built character/map/
// calendar models by entity type + schema version rather than re-modeling them, and NEVER registers a `scene`
// subtype — a Scene stays in SceneState (Contract 4). Pure data + pure functions.
export type {
	VaultObjectFieldSchema,
	VaultObjectFieldType,
	VaultObjectModelReference,
	VaultObjectSchema,
	VaultObjectSchemaSummary,
	VaultObjectSubtype,
} from './state/vault-object-schema';
export {
	SCENE_ENTITY_TYPE,
	VAULT_OBJECT_SCHEMAS,
	VAULT_OBJECT_SCHEMA_REGISTRY_VERSION,
	VAULT_OBJECT_SUBTYPES,
	dmOnlyFieldKeys,
	isSceneEntityType,
	isVaultObjectSubtype,
	listVaultObjectSchemas,
	summarizeVaultObjectSchema,
	vaultObjectSchema,
} from './state/vault-object-schema';

// CONTENT-005: STRUCTURED VAULT OBJECTS — note-backed records with SCHEMA-VALIDATED frontmatter (fail closed)
// and deterministic frontmatter ↔ body SYNCHRONIZATION. A Vault Object is a `ContentItem` (`kind: 'object'`)
// interpreted through a subtype schema; `syncObjectToNote`/`syncNoteToObject` keep the structured fields and
// the markdown body in sync by one deterministic rule, and the actor-filtered projection omits DM-only fields.
export type {
	VaultObject,
	VaultObjectValidationIssue,
	VaultObjectValidationResult,
} from './state/vault-object';
export {
	VAULT_OBJECT_SCHEMA_VERSION,
	VAULT_OBJECT_SUBTYPE_KEY,
	projectObjectFieldsForRole,
	readObjectSubtype,
	syncNoteToObject,
	syncObjectToNote,
	validateObjectFrontmatter,
} from './state/vault-object';

// CONTENT-006: the PURE WIKILINK LIFECYCLE engine — create / resolve / rename-propagation / repair, PRESERVING
// per-source conventions (reuses the source constraint descriptors). All deterministic functions of explicit
// inputs; the actor-filtered candidate index lives in the query layer so a target the editor cannot see is
// never resolved, renamed, or suggested (fail closed; never a destructive offline rewrite — AC3).
export type {
	BrokenWikilink,
	LinkRepairResult,
	WikilinkResolution,
	WikilinkTarget,
} from './state/wikilink-graph';
export {
	WIKILINK_GRAPH_SCHEMA_VERSION,
	applyLinkRepair,
	createWikilink,
	detectBrokenLinks,
	renamePropagateInBody,
	resolveWikilink,
} from './state/wikilink-graph';

// CONTENT-006: the ACTOR-FILTERED wikilink graph read/repair surface. Builds the candidate index from the
// actor's visible content items, so resolve/rename-propagation/repair operate ONLY over targets the editor may
// see. Pure + deterministic.
export type { WikilinkRenamePropagation } from './queries/wikilink-graph';
export {
	applyLinkRepairForActor,
	buildWikilinkCandidatesForActor,
	detectBrokenLinksForActor,
	propagateRenameForActor,
	resolveWikilinkForActor,
} from './queries/wikilink-graph';

// CHAR-002: the guided, structured PC-creation flow — step definitions, options, per-step validation
// (rules incl. the ability point-buy budget), and the resumable completeness report. Pure policy.
export type {
	AbilityId,
	CharacterDraftStepId,
	DraftCompleteness,
	DraftStepDefinition,
	DraftStepField,
	DraftStepOption,
	DraftStepValidation,
	DraftValidationIssue,
} from './state/character-draft-flow';
export {
	ABILITY_IDS,
	ABILITY_MAX,
	ABILITY_MIN,
	ABILITY_POINT_BUDGET,
	DRAFT_BACKGROUND_OPTIONS,
	DRAFT_CLASS_OPTIONS,
	DRAFT_STEPS,
	computeDraftCompleteness,
	getDraftStep,
	pointBuyCost,
	validateDraftStep,
} from './state/character-draft-flow';

// CHAR-001: the actor-filtered character read model — fail-closed visibility before any non-DM read
// (a dm-only NPC is OMITTED, not redacted; a non-owner gets NO draft fields). Search/roster/widget/MCP
// all consume this rather than raw CharacterState.
export type { CharacterDraftView, CharacterView } from './queries/character-query';
export {
	getCharacterForActor,
	getDraftForActor,
	listCharactersForActor,
	listDraftsForActor,
} from './queries/character-query';

// CHAR-001: bridge a character's fields into the EXISTING widget binding model so a Scene widget can
// bind to e.g. `character:<id>` / selector `combat.hp` and reuse the same resolver + hidden/conflicted/
// missing fail-closed states (Contract 4).
export {
	buildCharacterDataEnvironment,
	characterBindingRecord,
} from './queries/character-bindings';

// CHAR-006: the STABLE, STRUCTURED, ENUMERABLE character data-exposure CONTRACT a widget binds to —
// the comprehensive field-group surface (HP, resources, conditions, spell slots, abilities, skills,
// equipment, visible notes) plus the actor-filtered resolver wrapper that fails closed on an
// unknown/unsupported selector. Built ON the existing binding record + resolver; no parallel system.
export type {
	CharacterExposureFieldGroup,
	CharacterExposurePath,
	ExposedClassResource,
	ExposedSpellSlotLevel,
} from './queries/character-exposure';
export {
	BACKSTORY_DATA_KEY,
	CHARACTER_EXPOSURE_PATHS,
	EQUIPMENT_DATA_KEY,
	SKILLS_DATA_KEY,
	SUPPORTED_EXPOSURE_SELECTORS,
	VISIBLE_NOTES_DATA_KEY,
	characterExposureValue,
	characterHiddenSelectors,
	exposurePathsForGroup,
	isSupportedExposureSelector,
	resolveCharacterExposure,
} from './queries/character-exposure';

// CHAR-004 / CHAR-005 — COLLABORATIVE field edits: per-field MERGE (different paths both apply) vs
// same-path CONFLICT (concurrent same-path edits surface a durable, DM-resolvable conflict, never
// silent last-write-wins), with ATTRIBUTION on ONE canonical value (no hidden DM override layer). Pure
// deterministic reducers/validators the command handlers compose.
export type {
	ApplyFieldEditInput,
	ApplyFieldEditMeta,
	ApplyFieldEditResult,
	CharacterCollaboration,
	CharacterEdit,
	CharacterFieldConflict,
	CharacterFieldPath,
	CharacterFieldValue,
	ConflictResolutionChoice,
	FieldAuthorship,
	FieldEditError,
	FieldEditValidation,
	ResolveConflictError,
	ResolveConflictResult,
} from './state/character-collaboration';
export {
	CHARACTER_COLLABORATION_SCHEMA_VERSION,
	EMPTY_CHARACTER_COLLABORATION,
	applyFieldEdit,
	collaborationFor,
	ensureCollaboration,
	hasUnresolvedConflict,
	isDmOnlyFieldPath,
	readFieldValue,
	resolveFieldConflict,
	unresolvedConflictForPath,
	unresolvedConflictPaths,
	validateFieldEdit,
	writeFieldValue,
} from './state/character-collaboration';

// CHAR-014 — the actor-filtered COLLABORATIVE view: distinguishes DM-authored vs player-authored vs
// conflicted fields, while a non-DM view never includes a DM-only field's value/path/author/history/
// conflict (non-leak). The single sanctioned read path for the collaborative surface.
export type {
	CollaborativeCharacterView,
	CollaborativeConflict,
	CollaborativeField,
	CollaborativeHistoryEntry,
	FieldAuthorKind,
} from './queries/character-collaboration';
export { getCollaborativeCharacterView } from './queries/character-collaboration';

// CHAR-007 / CHAR-008 — the STRUCTURED combat-resource + spell/resource state and its pure
// deterministic policy: HP/temp-HP/conditions/death-saves/concentration, spell-slot + class-resource
// expenditure, owner-managed spell/slot/resource structure, deterministic short/long REST RECOVERY,
// and the append-only EXPENDITURE history. Extends the character model; no parallel model.
export type {
	CharacterResources,
	ClassResource,
	ConcentrationState,
	DeathSaveState,
	PreparedSpell,
	ResourceLedgerEntry,
	ResourceUpdateError,
	ResourceUpdateMeta,
	ResourceUpdateResult,
	RestKind,
	SetClassResourceInput,
	SetSpellInput,
	SetSpellSlotsInput,
	SpellSlotLevel,
} from './state/character-resources';
export {
	CHARACTER_RESOURCES_SCHEMA_VERSION,
	DEATH_SAVE_MAX,
	EMPTY_CHARACTER_RESOURCES,
	EMPTY_CONCENTRATION,
	EMPTY_DEATH_SAVES,
	applyHpDelta,
	applyRest,
	availableClassResource,
	availableSlots,
	ensureCharacterResources,
	expendClassResource,
	expendSpellSlot,
	recordDeathSave,
	resourcesOf,
	setClassResource,
	setCondition,
	setConcentration,
	setSpell,
	setSpellSlots,
	setTempHp,
} from './state/character-resources';

// CHAR-009 — level-up / ADVANCEMENT (XP or milestone) with VALIDATION before the revision is
// FINALIZED, via the staged-then-commit pattern. The staged draft lives on the durable character so
// it restores across restarts; commit is fail-closed on validation (no partial mutation). Pure policy.
export type {
	AdvancementChoices,
	AdvancementDraft,
	AdvancementError,
	AdvancementIssue,
	AdvancementMode,
	AdvancementState,
	AdvancementValidation,
	CommitAdvancementResult,
	EligibilityResult,
} from './state/character-advancement';
export {
	CHARACTER_ADVANCEMENT_SCHEMA_VERSION,
	MAX_CHARACTER_LEVEL,
	XP_THRESHOLDS,
	advancementDraftOf,
	advancementStateOf,
	buildAdvancementDraft,
	characterLevel,
	characterXp,
	checkAdvancementEligibility,
	clearAdvancementDraft,
	commitAdvancement,
	mergeAdvancementChoices,
	validateAdvancement,
	writeAdvancementDraft,
	xpForLevel,
} from './state/character-advancement';

export {
	addJournalEntryInputSchema,
	cancelAdvancementInputSchema,
	commitAdvancementInputSchema,
	commitContentImportInputSchema,
	createCharacterDraftInputSchema,
	createContentItemInputSchema,
	createFromTemplateInputSchema,
	defineCalendarInputSchema,
	exportContentInputSchema,
	insertSnippetInputSchema,
	editCharacterFieldInputSchema,
	finalizeCharacterDraftInputSchema,
	openAdvancementInputSchema,
	quickCreateCharacterInputSchema,
	removeContentItemInputSchema,
	removeJournalEntryInputSchema,
	removePartyInventoryItemInputSchema,
	resolveCharacterConflictInputSchema,
	restCharacterInputSchema,
	restoreContentItemInputSchema,
	revokeCharacterDraftInputSchema,
	setAdvancementChoicesInputSchema,
	setCharacterCombatInputSchema,
	setCharacterSpellInputSchema,
	setCharacterXpInputSchema,
	setClassResourceInputSchema,
	setContentItemVisibilityInputSchema,
	setJournalEntryVisibilityInputSchema,
	setMarchingOrderInputSchema,
	setSpellSlotsInputSchema,
	transferCharacterDraftInputSchema,
	updateCharacterDraftStepInputSchema,
	updateCombatResourceInputSchema,
	updateContentItemInputSchema,
	updateJournalEntryInputSchema,
	upsertPartyInventoryItemInputSchema,
	writeContentToSourceInputSchema,
} from './schemas/commands';

// SES-002 — the DURABLE COMBAT TRACKER model + the PURE deterministic turn/round state machine
// (initiative order with a deterministic stable tie-break, advance-turn that wraps to the next round,
// per-combatant HP/conditions/concentration/death-saves reusing the CHAR-007 resource shapes,
// stat-block previews, and a durable encounter log). Pure data + pure reducers; no GUI/storage/clock.
export type {
	Combatant,
	CombatantKind,
	CombatantResources,
	CombatantStatBlock,
	CombatAdvance,
	CombatLogEntry,
	CombatStatus,
	SessionCombatState,
} from './state/combat-tracker';
export {
	COMBATANT_KINDS,
	COMBAT_ENTITY_TYPE,
	COMBAT_TRACKER_SCHEMA_VERSION,
	EMPTY_COMBATANT_RESOURCES,
	EMPTY_SESSION_COMBAT_STATE,
	activeCombatant,
	advanceTurn,
	cloneCombatant,
	cloneResources,
	ensureSessionCombatState,
	orderInitiative,
} from './state/combat-tracker';

// SES-002 — THE single actor-filtered combat tracker read model. Hidden combatants are omitted (or
// replaced by a DM-approved placeholder with stat data withheld) for non-DM viewers; the DM sees all.
export type {
	CombatantResourcesView,
	CombatantStatBlockView,
	CombatantView,
	CombatLogEntryView,
	CombatTrackerView,
} from './queries/combat-tracker-view';
export { HIDDEN_COMBATANT_NAME, getCombatTrackerForActor } from './queries/combat-tracker-view';

// SES-006 — the DURABLE ENCOUNTER model + the PURE deterministic challenge-guidance calculator
// (CR/difficulty from combatant selection + party). Consistent with the `encounter` Vault Object
// subtype; session-log links are references (target ids), never clones. Pure data + pure reducers.
export type {
	BuildEncounterInput,
	Encounter,
	EncounterChallenge,
	EncounterCombatantSelection,
	EncounterDifficulty,
	EncounterLootItem,
	EncounterMeta,
	EncounterSpecialAction,
	EncounterState,
	PartyContext,
	SessionLogLink,
	UpdateEncounterPatch,
} from './state/encounter';
export {
	ENCOUNTER_DIFFICULTIES,
	ENCOUNTER_ENTITY_TYPE,
	ENCOUNTER_SCHEMA_VERSION,
	EMPTY_ENCOUNTER_STATE,
	buildEncounter,
	challengePointsForCr,
	cloneEncounter,
	computeEncounterChallenge,
	encounterById,
	encounterObjectFrontmatter,
	ensureEncounterState,
	partyDeadlyThreshold,
	updateEncounter,
	upsertEncounter,
} from './state/encounter';

// SES-006 — THE single actor-filtered encounter read model. The DM sees every encounter with its
// recomputed challenge guidance; a non-DM actor gets an EMPTY list (DM prep, fail closed, no leak).
export type { EncounterView } from './queries/encounter-query';
export { getEncounterForActor, listEncountersForActor } from './queries/encounter-query';

// SES-002 / SES-006 — combat + encounter command input schemas.
export {
	advanceCombatTurnInputSchema,
	applyCombatResourceInputSchema,
	buildEncounterInputSchema,
	endCombatInputSchema,
	startCombatInputSchema,
	updateEncounterInputSchema,
} from './schemas/commands';

// SES-003 / SES-008 — the PURE deterministic dice engine: the expression PARSER (text → AST, malformed
// rejected fail-closed), the recorded ROLL EVALUATOR (deterministic from a recorded seed; every die
// recorded so the roll is reproducible), rollable-table resolution from a recorded draw, and macros.
export type {
	ConstantTerm,
	DiceExpression,
	DiceExpressionTerm,
	DiceKeep,
	DiceMacro,
	DiceParseError,
	DiceParseResult,
	DiceRollResult,
	DiceTerm,
	EvaluatedConstantTerm,
	EvaluatedDiceTerm,
	EvaluatedTerm,
	RolledDie,
	TableDrawResult,
} from './state/dice';
export {
	DICE_SCHEMA_VERSION,
	MAX_DICE_COUNT,
	MAX_DICE_SIDES,
	MAX_EXPRESSION_LENGTH,
	canonicalSource,
	evaluateRoll,
	parseDiceExpression,
	resolveMacro,
	resolveTableDraw,
	rollExpression,
} from './state/dice';

// SES-003 / SES-008 — THE single actor-filtered session ROLL HISTORY read model. A secret/DM-only roll
// is omitted from a player's history; a shared roll reaches only the listed participants; the DM sees all.
export type { DiceHistoryView, DiceRollView } from './queries/dice-history';
export { findRollById, getDiceHistoryForActor } from './queries/dice-history';

// SES-003 / SES-008 — dice command input schemas.
export {
	appendRollToNoteInputSchema,
	rollDiceInputSchema,
	rollTableInputSchema,
} from './schemas/commands';

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
