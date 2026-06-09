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
	HandoutAcknowledgement,
	HandoutDeliveryRecord,
	HandoutKind,
	HandoutRevocation,
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
	HANDOUT_KINDS,
	SESSION_STATE_SCHEMA_VERSION,
	SESSION_WORKFLOW_STATES,
} from './state/session-state';

// SES-012 — durable CAMPAIGN CALENDAR CONTINUITY state: the current campaign date + dated LINKS by
// reference (note/session/map/event/handout). Campaign-level, never reset between sessions. Date math +
// formatting are owned by `state/calendar.ts` (CONTENT-011); this stores only the date + references.
export type {
	CalendarContinuityState,
	CalendarLink,
	CalendarLinkTargetKind,
} from './state/calendar-continuity';
export {
	CALENDAR_CONTINUITY_SCHEMA_VERSION,
	CALENDAR_LINK_TARGET_KINDS,
	EMPTY_CALENDAR_CONTINUITY_STATE,
	addCalendarLink,
	calendarLinkById,
	ensureCalendarContinuityState,
	removeCalendarLink,
	setCampaignDate,
} from './state/calendar-continuity';

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
	CommandCenterAutoSave,
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
	findOperationByIdempotencyKey,
	hasIdempotencyKey,
} from './sync/operation-log';

// SYNC-002: the CANONICAL operation shape + IDEMPOTENCY model. Formalizes Contract 2's Sync Unit:
// every durable op is entity-scoped (actor/target/path), carries explicit dependencies + revisions +
// issue time, and is idempotent by op id (re-applying an id is a no-op). `validateSyncOperationShape`
// is the pure structural conformance check (fails closed if a required field is missing/malformed);
// `assertDurableOperationConforms` is the guard the cross-command conformance test asserts against.
export type {
	OperationConformanceProblem,
	OperationConformanceProblemKind,
	OperationConformanceResult,
	RequiredOperationField,
	ApplyOperationIdempotentResult,
} from './sync/operation-model';
export {
	REQUIRED_OPERATION_FIELDS,
	appliedOperationIdsOf,
	applyOperationIdempotent,
	assertDurableOperationConforms,
	dedupeOperationsById,
	isConformantSyncOperation,
	isOperationApplied,
	validateSyncOperationShape,
} from './sync/operation-model';

// SYNC-011: fail-closed REPLAY VALIDATION for queued/remote ops. BEFORE applying an op, validates (in
// order) shape, schema-version compatibility, dependencies satisfied, target existence, actor
// authority, visibility, and write permission — reusing the PERM visibility-filter + grant model and
// the migration fail-closed-on-future-version stance. A valid op accepts; an unsatisfied dependency
// DEFERS; any other failure REJECTS (the op is not applied). This is a replay-time guard for the
// future transport; it does NOT touch the in-process dispatch path (which already validates).
export type {
	ReplayBatchEntry,
	ReplayBatchResult,
	ReplayRejectionReason,
	ReplayValidationContext,
	ReplayValidationOutcome,
	ReplayValidationResult,
} from './sync/replay-validation';
export { validateReplayBatch, validateReplayOperation } from './sync/replay-validation';

// SYNC-001: the LOCAL-FIRST invariant model. Declares the core workflows that must stay usable offline
// for content already on the device, computes per-workflow offline availability (content never synced
// to a device reports `unavailable` rather than blocking the whole vault), derives the collaboration-
// unavailable-offline + queued-local-ops status, and proves the offline path carries no network handle
// (`assertNoNetworkDependency`). Pure Processing-Core policy; by construction it performs no network I/O.
export type {
	LocalFirstStatus,
	LocalFirstStatusInput,
	LocalFirstWorkflow,
	LocalFirstWorkflowInput,
	NetworkDependencyFinding,
	NetworkDependencyReason,
	WorkflowAvailability,
	WorkflowAvailabilityState,
} from './sync/local-first';
export {
	LOCAL_FIRST_WORKFLOWS,
	assertNoNetworkDependency,
	deriveLocalFirstStatus,
	evaluateWorkflowAvailability,
	findNetworkDependencies,
	hasNoNetworkDependency,
	isLocalFirstWorkflow,
} from './sync/local-first';

// SYNC-009: large binary assets sync as CONTENT-ADDRESSED ASSET RECORDS (hash-as-id, reuse MAP-002)
// plus METADATA OPERATIONS — the op-log carries the asset's metadata + content-hash reference, NEVER
// the binary payload. `assertNoBinaryInOperationLog` is the fail-closed guard that proves the binding
// rule. `deriveAssetAvailability` is the pure, content-addressed availability model the GUI renders
// for the asset-missing/degraded state when a referenced blob has not synced to a device.
export type {
	AssetAvailabilityEntry,
	AssetAvailabilityState,
	BinaryPayloadFinding,
	BinaryPayloadReason,
	MapAssetAvailability,
	MapAssetAvailabilityView,
} from './sync/asset-sync';
export {
	MAX_OPERATION_VALUE_BYTES,
	assertNoBinaryInOperationLog,
	deriveAssetAvailability,
	findBinaryPayloadsInOperations,
	operationCarriesBinaryPayload,
} from './sync/asset-sync';

// SYNC-007 / SYNC-008: the TYPED, FAIL-CLOSED data-classification registry. Every storage category is
// declared `cloud-syncable` (only eligible when cloud sync is ENABLED for the vault) or `device-local`
// (never leaves the device unless the user explicitly exports). Fails closed: unknown category ⇒
// device-local; cloud-disabled ⇒ nothing eligible for cloud. The cloud-payload leak guard reuses the
// diagnostics redaction guard to prove a generated payload carries no raw paths/auth tokens.
export type {
	ClassifiedStorageRecord,
	CloudPayloadLeakFinding,
	CloudPayloadLeakReason,
	CloudPayloadRecord,
	StorageClassification,
	StorageClassificationPlan,
	StorageDataCategory,
} from './sync/storage-classification';
export {
	CLOUD_SYNCABLE_CATEGORIES,
	DEVICE_LOCAL_CATEGORIES,
	FAIL_CLOSED_CLASSIFICATION,
	STORAGE_CLASSIFICATION_REGISTRY,
	assertCloudPayloadIsClean,
	classifyStorageCategory,
	declaredClassification,
	eligibleCloudCategories,
	findCloudPayloadLeaks,
	isCloudEligible,
	isKnownStorageCategory,
	partitionStorageRecords,
} from './sync/storage-classification';

// SYNC-017: the ENCRYPTION-PREREQUISITE cloud-sync enablement gate. Default OFF, fail-closed. Cloud
// sync CANNOT be enabled until the release-approved encryption, key custody, rotation, and recovery
// model is satisfied. Per ADR-014 the real crypto is deferred, so the prerequisites are declared-unmet
// by default and the gate blocks enablement — this is the seam a future crypto ADR plugs into.
export type {
	CloudSyncGateInput,
	CloudSyncGateResult,
	CloudSyncPrerequisiteId,
	CloudSyncPrerequisiteStatus,
	CloudSyncSecurityModel,
	RecoveryDeclaration,
} from './sync/cloud-sync-gate';
export {
	CLOUD_SYNC_PREREQUISITE_IDS,
	CLOUD_SYNC_PREREQUISITE_LABELS,
	UNMET_CLOUD_SYNC_SECURITY_MODEL,
	canEnableCloudSync,
	evaluateCloudSyncGate,
	evaluateCloudSyncPrerequisites,
	isCloudSyncEnabled,
} from './sync/cloud-sync-gate';

// SYNC-003 / SYNC-015: the SOURCE ADAPTER interface + CAPABILITY-METADATA + FAIL-CLOSED model. An adapter
// transforms external source content ↔ canonical SyncOperations at the boundary; it declares typed
// capability metadata (supported schema/source versions, auth modes, entity types, transform fidelity) and
// every fail-closed dimension rejects with an explicit reason before any mutation. `assertAdapterEmits
// CanonicalOperations` is the SYNC-003 proof: an adapter plugs in WITHOUT a new command/reducer because it
// emits the SAME canonical op shape every in-process command satisfies. Pure; the transport is injected.
export type {
	AdapterTransformContext,
	AuthorizationInput,
	AuthorizationOutcome,
	CapabilityCheckResult,
	CapabilityRejectionReason,
	ExternalMutation,
	SourceAdapterCapability,
	SyncSourceAdapter,
	SyncSourceAuthMode,
	SyncSourceKind,
	SyncSourceLifecycleState,
	SyncTransformDirection,
} from './sync/source-adapters';
export {
	ADAPTER_CANONICAL_SCHEMA_VERSION,
	SOURCE_ADAPTER_SCHEMA_VERSION,
	SYNC_SOURCE_LIFECYCLE_STATES,
	adapterEmitsCanonicalOperations,
	assertAdapterEmitsCanonicalOperations,
	buildCanonicalOperation,
	checkAuthModeSupported,
	checkEntityTypeSupported,
	checkSchemaVersionSupported,
	checkSourceVersionSupported,
	checkTransformFidelity,
	deriveAuthorizationState,
} from './sync/source-adapters';

// SYNC-003 / ADR-014: the IN-MEMORY / FAKE transport the adapters read/write through. The live
// filesystem/Obsidian/Drive transports are deferred; this is the deterministic, plain-data store the
// adapters are exercised over. A real transport later implements the same shapes with no adapter change.
export type {
	FakeDriveChange,
	FakeDriveFile,
	FakeDriveTransport,
	FakeVaultFile,
	FakeVaultTransport,
} from './sync/source-transport';
export {
	createFakeDriveTransport,
	createFakeVaultTransport,
	deleteVaultFile,
	readDriveChanges,
	readDriveFile,
	readVaultFile,
	writeDriveFile,
	writeVaultFile,
} from './sync/source-transport';

// SYNC-004 / SYNC-012: the OBSIDIAN adapter logic. Reuses `markdown.ts`; a parse → canonical → serialize
// round-trip preserves YAML properties, tags, aliases, [[wikilinks]], markdown links, headings, and
// user-authored frontmatter, and ISOLATES DND Tools metadata under the `dndtools.*` namespace so it never
// collides with user frontmatter. The fake vault transport is injected.
export type {
	ObsidianCanonicalNote,
	ParsedHeading,
	ParsedMarkdownLink,
} from './sync/obsidian-adapter';
export {
	OBSIDIAN_ADAPTER_CAPABILITY,
	OBSIDIAN_SOURCE_KIND,
	canonicalNoteToObsidianFile,
	createObsidianAdapter,
	extractHeadings,
	extractMarkdownLinks,
	obsidianEntityIdForPath,
	obsidianFileToCanonicalNote,
	obsidianPresentFeatures,
	pullObsidianNote,
	pushObsidianOperation,
} from './sync/obsidian-adapter';

// SYNC-005 / SYNC-012 / SYNC-016: the GOOGLE DOCS adapter logic over a FAKE Drive transport. Tracks Drive
// file ids, change page tokens, and revision metadata; the import/export transforms report unsupported
// formatting loss (reused from the content-constraint lossy descriptors); and authorization, rename,
// deletion, offline queued edits, unsupported formatting, and conflict are handled as EXPLICIT typed sync
// states (never silent failures). The incremental pull stores the next cursor for future sync.
export type {
	GoogleDocsCanonicalNote,
	GoogleDocsConflict,
	GoogleDocsFileState,
	GoogleDocsImportTransform,
	GoogleDocsPullResult,
} from './sync/google-docs-adapter';
export {
	GOOGLE_DOCS_ADAPTER_CAPABILITY,
	GOOGLE_DOCS_SOURCE_KIND,
	canonicalNoteToGoogleDocsFile,
	createGoogleDocsAdapter,
	detectGoogleDocsConflict,
	googleDocsEntityIdForFile,
	googleDocsFileToCanonicalNote,
	googleDocsPresentFeatures,
	pullGoogleDocsChanges,
	pushGoogleDocsOperation,
} from './sync/google-docs-adapter';

// SYNC-003 / SYNC-015 / SYNC-005 / SYNC-016: the SOURCE ADAPTER REGISTRY — the inspectable list of
// declared adapter capabilities (local-vault baseline + Obsidian + Google Docs) + the fail-closed
// registration/preflight surface. `preflightSourceAdapter` rejects an unsupported schema/source version,
// auth mode, entity type, or lossy transform with an explicit reason BEFORE any mutation; an unknown kind
// fails closed. `SourceCursorRecord` models the durable per-source change cursor a pull advances.
export type {
	CapabilityDescriptorProblem,
	CapabilityDescriptorProblemKind,
	SourceAdapterCapabilitySummary,
	SourceAdapterPreflightRequest,
	SourceAdapterPreflightResult,
	SourceCursorRecord,
} from './sync/source-adapter-registry';
export {
	LOCAL_VAULT_ADAPTER_CAPABILITY,
	REGISTERED_SOURCE_KINDS,
	SOURCE_ADAPTER_CAPABILITIES,
	SOURCE_ADAPTER_REGISTRY_SCHEMA_VERSION,
	advanceSourceCursor,
	capabilityForSourceKind,
	listSourceAdapterCapabilities,
	listSourceAdapterCapabilitySummaries,
	preflightSourceAdapter,
	summarizeSourceAdapterCapability,
	validateRegisteredSourceAdapters,
	validateSourceAdapterCapability,
} from './sync/source-adapter-registry';

// SYNC-010: the computed SYNC STATUS model — pending outbound operations, inbound revisions, conflicts
// (from conflict-shaped ops), source health (reuse PLAT diagnostics), and retry actions (reuse the
// PLAT-018 lifecycle). A clean derived view over the op-log substrate, never raw storage. Pure
// Processing-Core derivation; the GUI renders it and dispatches the named retry/resolve intents.
export type {
	ConflictStatusView,
	InboundRevisionInput,
	InboundRevisionView,
	PendingOutboundOperation,
	PendingOutboundSourceGroup,
	SyncRetryAction,
	SyncRetryActionView,
	SyncStatusInput,
	SyncStatusResult,
	SyncStatusView,
} from './queries/sync-status';
export { getSyncStatus } from './queries/sync-status';

// SYNC-014: actor-filtered sync lineage. A DM sees STRUCTURAL source version history, compacted
// snapshot lineage, and recovery checkpoints (reusing the PLAT-migration safety-snapshot lineage); a
// player/observer sees only a non-leaking freshness summary. The view is structural by construction
// and never carries entity content/titles/values — `syncLineageIsStructuralOnly` proves the non-leak.
export type {
	DmSyncLineageView,
	EntityVersionHistory,
	SnapshotCheckpoint,
	SyncFreshness,
	SyncFreshnessSummary,
	SyncLineageInput,
	SyncLineageResult,
} from './queries/sync-lineage';
export {
	actorCanViewSyncLineage,
	getDmSyncLineage,
	getSyncFreshness,
	syncLineageIsStructuralOnly,
} from './queries/sync-lineage';

// SYNC-006 / SYNC-013: the VAULT-WIDE conflict LIFECYCLE. Generalizes the per-entity/per-path
// character conflict handling into ONE durable, entity-agnostic conflict-record model derived from the
// op-log substrate (DETECT → PERSIST → DISPLAY → RESOLVE). Per-entity ISOLATION is the load-bearing
// guarantee: a conflict on entity A never blocks reads/writes/publication of unrelated entity B. The
// DM-authorized resolution (`resolveVaultConflict`) takes explicit selected values + the actual source
// revisions + optional notes, records audit, and produces a non-conflicted revision; it fails closed
// on a stale/unknown/already-resolved conflict.
export type {
	EntityPublicationStatus,
	ResolveVaultConflictError,
	ResolveVaultConflictInput,
	ResolveVaultConflictMeta,
	ResolveVaultConflictResult,
	VaultConflictReason,
	VaultConflictRecord,
	VaultConflictResolutionAudit,
	VaultConflictSide,
} from './state/conflict-lifecycle';
export {
	VAULT_CONFLICT_SCHEMA_VERSION,
	conflictEntityKey,
	conflictedEntityKeys,
	deriveVaultConflicts,
	entityIsEditableDespiteOtherConflicts,
	isConflictDetectionOpType,
	isConflictResolutionOpType,
	isEntityConflicted,
	publicationStatusForEntity,
	resolveVaultConflict,
	unresolvedConflicts,
} from './state/conflict-lifecycle';

// SYNC-006 / SYNC-013: the ACTOR-FILTERED conflict-lifecycle VIEW. The DM sees full records (diverging
// values + the resolution audit); a non-DM sees only structural facts (entity/path/reason/status) —
// never the conflicting values (`conflictLifecycleIsStructuralOnly` proves the non-leak). Reuses the
// same op-log substrate the SYNC status surface reads.
export type {
	ConflictLifecycleDmDetailView,
	ConflictLifecycleEntryView,
	ConflictLifecycleInput,
	ConflictLifecycleResult,
	ConflictLifecycleView,
} from './queries/conflict-lifecycle';
export {
	conflictLifecycleIsStructuralOnly,
	entityPublicationStatus,
	getConflictLifecycle,
} from './queries/conflict-lifecycle';

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
	acknowledgeHandoutInputSchema,
	createPlayerGroupInputSchema,
	createSavedSearchInputSchema,
	deletePlayerGroupInputSchema,
	deleteSavedSearchInputSchema,
	deliverHandoutInputSchema,
	revealHandoutSectionInputSchema,
	revokeHandoutInputSchema,
	pinSavedSearchInputSchema,
	searchFilterSchema,
	updatePlayerGroupInputSchema,
	updateSavedSearchInputSchema,
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
	recoverSessionInputSchema,
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
	importAudioAssetInputSchema,
	updateAudioAssetMetadataInputSchema,
	configureAudioSourceInputSchema,
	validateAudioPackageInputSchema,
	configureAudioAutomationInputSchema,
	deleteAudioAutomationInputSchema,
	playSessionAudioInputSchema,
	setSessionAudioVolumeInputSchema,
	projectSessionAudioInputSchema,
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
	SectionRouteAccess,
} from './queries/navigation';
export {
	NAVIGATION_SECTIONS,
	listNavigationRegistryForActor,
	listNavigationSections,
	resolveSectionRouteAccess,
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
	DeepLinkViewportFocus,
} from './queries/deep-links';
export { DEEP_LINK_UNAVAILABLE_MESSAGE, resolveDeepLink } from './queries/deep-links';

// SRCH-007 — open a chosen search result into the right route/viewport/heading (re-checks visibility).
export type { SearchResultOpenTarget } from './queries/result-open';
export { resolveSearchResultOpen } from './queries/result-open';

// SRCH-008 — deterministic, id-normalized search diagnostics + saved-search portability remapping.
export type {
	SavedSearchPortabilityDiagnostics,
	SavedSearchRemapping,
	SearchDiagnosticHit,
	SearchResultDiagnostics,
} from './queries/search-diagnostics';
export {
	SEARCH_DIAGNOSTICS_SCHEMA_VERSION,
	diagnoseSavedSearchPortability,
	diagnoseSearchResult,
} from './queries/search-diagnostics';

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
	ParsedQuickSwitcherQuery,
	QuickSwitcherCommandEntry,
	QuickSwitcherEntry,
	QuickSwitcherEntryKind,
	QuickSwitcherNavigationEntry,
	QuickSwitcherOptions,
	QuickSwitcherStateView,
	ResolvedQuickSwitcherEntry,
} from './queries/quick-switcher-query';
export {
	QUICK_SWITCHER_COMMAND_SIGIL,
	buildQuickSwitcher,
	parseQuickSwitcherQuery,
	resolveQuickSwitcherEntry,
} from './queries/quick-switcher-query';

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

// UX-CMD-003 / UX-CMD-012 — the viewer-gated Command Center home read model: the glanceable session
// status strip + the role-differentiated home decision (the single no-leak choke point for `/`).
export type {
	CommandCenterHomeView,
	SessionPhaseTone,
	SessionStatusStrip,
	SessionStatusStripResult,
	StatusStripAudioCell,
	StatusStripPhaseCell,
	StatusStripPlayersCell,
	StatusStripTurnCell,
} from './queries/command-center-home';
export { getSessionStatusStrip, resolveCommandCenterHome } from './queries/command-center-home';

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

// SES-004 / COLLAB-007 — THE single actor-filtered HANDOUT read model. A NON-RECIPIENT (or a REVOKED,
// non-persistent recipient — SEALED) receives `{ kind: 'unavailable' }` with NO content (the non-leak
// guarantee); a recipient/DM sees only the sections they may see, with progressive reveal folded into the
// PERM visibility-filter. The view carries the handout kind + the recipient's acknowledged/persistent
// state. The delivery history and the per-recipient delivered/opened/revoked status surface are DM-only.
export type {
	HandoutDeliveryView,
	HandoutQueryResult,
	HandoutRecipientStatus,
	HandoutSectionView,
	HandoutStatusView,
	HandoutUnavailable,
	HandoutView,
} from './queries/handout-query';
export {
	getHandoutDeliveryHistory,
	getHandoutForActor,
	getHandoutStatusForDm,
	getHandoutsForActor,
	handoutRecipientPersistent,
	handoutRecipientSealed,
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

// SES-012 — THE single actor-filtered CAMPAIGN CALENDAR CONTINUITY read model. The current campaign date
// + dated LINKS resolved BY REFERENCE through the existing actor-filtered reads: a hidden/deleted target
// degrades to an `unavailable` link (no leak, no clone). `getCalendarContextForActor` partitions links
// into past/upcoming relative to the current date — the calendar context fed to the prep/recap digest.
export type {
	CalendarContextView,
	CalendarContinuityView,
	CalendarLinkView,
	ContinuityDateView,
} from './queries/calendar-continuity-query';
export {
	getCalendarContextForActor,
	getCalendarContinuityForActor,
	resolveCalendarLinkForActor,
} from './queries/calendar-continuity-query';

// SRCH-010 — CALENDAR / CUSTOM-TIME DISCOVERY: search and filter VISIBLE content by campaign calendar
// dates, custom-time RANGES, timeline EVENTS, and session CHRONOLOGY. A pure DISCOVERY surface composed
// ENTIRELY from the EXISTING actor-filtered reads — the content timeline (CONTENT-011), campaign
// continuity links (SES-012), and the DM-only session archives — so visibility is decided BEFORE
// discovery sees anything. The range filter, text match, and ordering live in the Processing Core; the
// counts are computed over the visible set only, so hidden events are omitted AND never revealed by an
// inflated count (SRCH-010 AC2). Dates render through the CONTENT-011 formatter (AC1, stable formatting).
export type {
	CalendarDateRange,
	CalendarDiscoveryEvent,
	CalendarDiscoveryFilter,
	CalendarDiscoveryResult,
	CalendarEventSource,
	DiscoveryDateView,
} from './queries/calendar-discovery-query';
export {
	CALENDAR_EVENT_SOURCES,
	searchCalendarTimeForActor,
} from './queries/calendar-discovery-query';

// SES-009 — the pre-session PREP / post-session RECAP digest, computed as a PURE DERIVATION over the
// existing durable sources (open threads SES-007, recent changes op-log, handout outcomes SES-004, combat
// summaries SES-002, calendar context SES-012) + deterministically synthesized continuity prompts (no AI).
// DM-FACING: a non-DM receives an EMPTY digest (fail closed, hard no-leak). Nothing is copied — it is
// COMPUTED. In `recap`, combat/handout sources derive from the archive snapshot of the just-ended session.
export type {
	DigestCombatSummary,
	DigestContinuityPrompt,
	DigestHandoutOutcome,
	DigestMode,
	DigestRecentChange,
	DigestThread,
	PrepRecapDigest,
} from './queries/prep-recap-digest';
export { DEFAULT_RECENT_CHANGE_LIMIT, getPrepRecapDigest } from './queries/prep-recap-digest';

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

// PERF-001 — PERFORMANCE BUDGET OWNERSHIP: the single authoritative registry where v2 performance
// budgets are DECLARED and OWNED. Each budget ties a user-facing workflow (startup, vault open, Scene
// render, widget update, map pan/zoom, search, graph indexing, sync reconciliation, smoke CI) to an
// owning domain, a user-facing risk, a measurement method (metric kind + target), a dataset/fixture,
// a device class, and a provisional review date. `validateBudgetRegistry` fails closed when a budget
// is unowned, unqualified, or its provisional review date has lapsed. The COLLAB live-session p95
// delivery target was migrated here (`live-session-delivery`).
export type {
	BudgetDirection,
	BudgetMaturity,
	BudgetMetric,
	BudgetMetricKind,
	BudgetProblem,
	BudgetProblemKind,
	PerformanceBudget,
} from './perf/budget-registry';
export {
	LIVE_SESSION_DELIVERY_BUDGET_ID,
	PERFORMANCE_BUDGET_REGISTRY_VERSION,
	PERFORMANCE_BUDGETS,
	budgetForId,
	budgetsForOwner,
	validateBudgetRegistry,
} from './perf/budget-registry';

// PERF-007 — PERFORMANCE MEASUREMENT: deterministically grade observed samples against a DECLARED
// budget and report pass / breach / unknown / error. Fail closed: a measurement against an unknown
// budget id is an `error` (never a silent pass); a measurement with no usable samples is `unknown`
// (un-proven, not green); exactly-at-threshold passes. Reuses the COLLAB nearest-rank `percentile`.
export type {
	BudgetMeasurement,
	BudgetMeasurementInput,
	BudgetMeasurementReason,
	BudgetMeasurementResult,
	BudgetMeasurementSuite,
} from './perf/measurement';
export { measureBudget, measureBudgetSuite } from './perf/measurement';

// PERF-005 — BUNDLE + MEMORY BUDGETS with PATH-AWARE GATES. Declares the core-bundle-size and
// long-session-memory budgets as ordinary PerformanceBudgets (graded by the SAME measureBudget), and
// adds the path-aware gate: a feature disabled-by-tier / out-of-scope must be lazy-loaded or excluded,
// never in the core bundle (AC1 — the AI/MCP subsystem is declared lazy + off the core path, composing
// MCP-001 default-off). Memory diagnostics report the major retained categories on a breach and detect
// unbounded growth across a session (AC2). Fail closed: oversized bundle = breach; unbounded growth =
// breach; unmeasured = unknown, never a confident pass.
export type {
	BundleCompositionProblem,
	BundleCompositionProblemKind,
	FeatureBundleEntry,
	FeatureLoadStrategy,
	MemoryCategory,
	MemoryFootprintAnalysis,
	MemorySnapshot,
	UnboundedGrowthFinding,
} from './perf/bundle-budget';
export {
	BUNDLE_BUDGETS,
	CORE_BUNDLE_SIZE_BUDGET_ID,
	SESSION_MEMORY_FOOTPRINT_BUDGET_ID,
	analyzeBundleComposition,
	analyzeMemoryFootprint,
	detectUnboundedMemoryGrowth,
	invalidBundleBudgetIds,
	measureCoreBundleSize,
} from './perf/bundle-budget';

// PERF-006 — AI / MCP ISOLATION: the deterministic PROOF that the optional AI/MCP subsystem can never
// degrade core performance. Composes MCP-001 optionality (isMcpEnabled) + the AI-boundary contract: a
// core measurement's verdict/timing must be independent of the MCP enabled flag, of the AI capability
// state, and of AI/MCP load (AC1/AC3 — off the critical path). Bounded AI tasks are cancellable and an
// over-limit/cancelled task's output is discarded or clearly marked partial, never silently final (AC2).
// Fail closed: un-provable isolation is `unknown`, never a confident pass; verdict drift is `not-isolated`.
export type {
	AiTaskBreachKind,
	AiTaskBudget,
	AiTaskDisposition,
	AiTaskOutcome,
	AiTaskUsage,
	CorePerfIsolationProof,
	IsolationResult,
} from './perf/ai-isolation';
export {
	DEFAULT_AI_ISOLATION_TOLERANCE,
	PERF_AI_ABSENT_CAPABILITY,
	classifyAiTaskOutcome,
	proveCorePerfIndependentOfAiCapability,
	proveCorePerfIndependentOfMcpState,
	proveCorePerfIsolatedFromAi,
} from './perf/ai-isolation';

// PERF-009 — PRIVACY-PRESERVING PERFORMANCE DIAGNOSTICS. A perf trace exported by default carries NO
// hidden player-inaccessible content, raw bodies, secrets, or absolute paths — only an EXPLICIT DM
// opt-in keeps raw context (AC1). Composes the diagnostics redaction guard (redactValue /
// containsSensitiveData) + the stream-privacy needle scanner. Local UX diagnostics stay LOCAL until the
// user explicitly exports them (AC2). Fail closed: a surviving secret/path/needle blocks the export; an
// un-exported local sample must not leave the device.
export type {
	PerfDiagnosticResidency,
	PerfDiagnosticSample,
	PerfDiagnosticsStore,
	PerfTraceContext,
	PerfTraceExportCertification,
	PerfTraceExportProblem,
	PerfTraceExportProblemKind,
	RawPerfMeasurement,
	RawPerfTrace,
	SanitizePerfTraceOptions,
	SanitizedPerfContext,
	SanitizedPerfMeasurement,
	SanitizedPerfTrace,
} from './perf/diagnostics-privacy';
export {
	EMPTY_PERF_DIAGNOSTICS_STORE,
	assertNoUnexportedLeavesDevice,
	certifyPerfTraceExport,
	localOnlySamples,
	markExportedByUser,
	recordLocalDiagnostic,
	sanitizePerfTrace,
} from './perf/diagnostics-privacy';

// PERF-002 / PERF-003 — SCENE + MAP RENDER COST MODEL + MEASUREMENT. Composes the PERF-001 registry +
// PERF-007 measureBudget to grade a Scene first-render estimate, a widget-update latency, and a map
// pan/zoom frame rate against the budgets the registry ALREADY owns. PERF-002: a deterministic Scene
// render-cost model where offscreen/collapsed widgets pay only bookkeeping (virtualization, AC1) plus a
// backpressure evaluator that flags an unbounded high-frequency subscription (AC2). PERF-003: a
// deterministic map frame-rate model graded against the desktop OR slim floor distinctly by device
// class (AC1) plus an incremental-fog analysis that repaints only affected regions, failing closed to a
// full repaint where region invalidation is unsupported (AC2). Fail closed: unmeasured = unknown; heavy
// Scene/map = breach; unbounded subscription = breach; exactly-at-threshold passes. Live raf/GPU timing
// capture is deferred per ADR-014 — this owns the declared budgets + the deterministic render model.
export type {
	BackpressurePolicyKind,
	BackpressureProblemKind,
	BackpressureResult,
	FogRegionUpdateAnalysis,
	MapFrameEstimate,
	MapRenderComplexity,
	MapRenderCostModel,
	RenderDeviceClass,
	RenderLayerRegion,
	RenderRegion,
	SceneRenderCostModel,
	SceneRenderEstimate,
	SceneWidgetComplexity,
	SubscriptionBackpressure,
} from './perf/scene-map-render';
export {
	DEFAULT_MAP_RENDER_COST_MODEL,
	DEFAULT_RENDER_STARVATION_RATE,
	DEFAULT_SCENE_RENDER_COST_MODEL,
	MAP_PAN_ZOOM_DESKTOP_BUDGET_ID,
	MAP_PAN_ZOOM_SLIM_BUDGET_ID,
	SCENE_FIRST_RENDER_BUDGET_ID,
	WIDGET_UPDATE_BUDGET_ID,
	analyzeFogRegionUpdate,
	estimateMapFrameRate,
	estimateSceneRenderCost,
	evaluateSubscriptionBackpressure,
	mapPanZoomBudgetIdForDeviceClass,
	measureMapPanZoom,
	measureSceneFirstRender,
	measureWidgetUpdate,
} from './perf/scene-map-render';

// PERF-004 / PERF-008 — SEARCH, GRAPH, AND SYNC RESPONSIVENESS COST MODELS + MEASUREMENT. Composes the
// PERF-001 registry + PERF-007 measureBudget to grade a search query, a graph/search incremental index
// update, and a sync reconciliation replay against the budgets the registry ALREADY owns (`search`,
// `graph-indexing`, `sync-reconciliation`). PERF-004: an index-update cost model where an INCREMENTAL
// one-changed-note update costs far less than a FULL recompute over the whole vault, measured DISTINCTLY
// (AC1), plus search/graph responsiveness reports that surface the SRCH/GRAPH stale/partial freshness
// WITHOUT blocking cached results (AC2 — composing `state/search-index.ts` + `state/graph-index.ts`).
// PERF-008: a reconciliation cost model over an op-batch (AC1), a foreground-during-background-work check
// that grades a concurrent search/navigate/advance-combat command against ITS OWN budget (AC1), and a
// resumable-batch plan that resumes from a checkpoint or restarts with a visible diagnostic (AC2). Fail
// closed: unmeasured = unknown; large index/op-batch over budget = breach; exactly-at-threshold passes; a
// missing/corrupt checkpoint restarts rather than resuming wrongly. Live indexer/replay timing capture is
// deferred per ADR-014 — this owns the declared budgets + the deterministic cost models + resumption plan.
export type {
	BackgroundWorkCheckpoint,
	BatchResumptionAction,
	BatchResumptionPlan,
	BatchRestartReason,
	ForegroundCommandKind,
	GraphNavigationReport,
	IndexUpdateComplexity,
	IndexUpdateCostModel,
	IndexUpdateEstimate,
	IndexUpdateMode,
	ReconciliationComplexity,
	ReconciliationCostModel,
	ReconciliationEstimate,
	SearchQueryComplexity,
	SearchQueryCostModel,
	SearchQueryEstimate,
	SearchResponsivenessReport,
} from './perf/search-graph-sync';
export {
	DEFAULT_INDEX_UPDATE_COST_MODEL,
	DEFAULT_RECONCILIATION_COST_MODEL,
	DEFAULT_SEARCH_QUERY_COST_MODEL,
	GRAPH_INDEXING_BUDGET_ID,
	SEARCH_BUDGET_ID,
	SYNC_RECONCILIATION_BUDGET_ID,
	estimateIndexUpdateCost,
	estimateReconciliationCost,
	estimateSearchQueryCost,
	foregroundBudgetIdFor,
	measureForegroundDuringBackgroundWork,
	measureIndexUpdate,
	measureReconciliation,
	measureSearchQuery,
	planBatchResumption,
	reportGraphNavigation,
	reportSearchResponsiveness,
} from './perf/search-graph-sync';

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

// SRCH-003 / SRCH-004: the durable SAVED-SEARCH model + the shared SEARCH-FILTER definition. A saved
// search stores ONLY its filter criteria + its own visibility + pin state — NEVER a cached result, so a
// run always re-evaluates LIVE through the actor-filtered search (no stale result leaks a now-hidden item).
// Saved searches fail closed to `dm-only`. Pure data + pure reducers; the command layer composes these.
export type {
	CreateSavedSearchInput,
	SavedSearch,
	SavedSearchMap,
	SavedSearchMeta,
	SearchContentType,
	SearchDateRange,
	SearchFilter,
	SearchRelationshipFilter,
	SearchSourceId,
	UpdateSavedSearchPatch,
} from './state/saved-search';
export {
	SAVED_SEARCH_ENTITY_TYPE,
	SAVED_SEARCH_SCHEMA_VERSION,
	SEARCH_CONTENT_TYPES,
	SEARCH_SOURCE_IDS,
	buildSavedSearch,
	cloneSavedSearch,
	ensureSavedSearches,
	normalizeSearchFilter,
	removeSavedSearch,
	setSavedSearchPinned,
	updateSavedSearch,
} from './state/saved-search';

// SRCH-003 / SRCH-005 / SRCH-006 / SRCH-011: THE single actor-filtered FACETED SEARCH read. Filters by
// source, content type, tag, folder, date, and a VISIBILITY-SAFE RELATIONSHIP (plus text), composing the
// actor-filtered content (CONTENT-011) + map (MAP-018) reads — no second index. SRCH-005: hits are ranked by
// a DETERMINISTIC composite score (recency, title, tag, link, entity-type, session-context signals, every
// signal from the visible set) with stable tie-breakers, BEFORE any optional AI assistance; the per-signal
// breakdown is exposed for diagnostics. SRCH-006: each hit carries a VISIBLE snippet + visibility-safe
// relationship hints (visible backlinks, date refs, folder, map context), so a snippet never crosses a hidden
// section boundary and a hint never names a hidden artifact. SRCH-011: optional semantic assist is SECONDARY,
// off by default, LABELLED, source-cited, can only re-order the already-visible hits (never add one), and
// degrades to deterministic results when unavailable; the deterministic order is preserved as a diagnostic.
// Counts derive from the visible set only (AC1, AC4); a referenced unavailable source is marked WITHOUT
// failing the search (AC2); the active filters are echoed (AC3). Pure + deterministic; the GUI renders it.
export type {
	ActiveSearchFilters,
	RankingSignals,
	SearchHit,
	SearchOptions,
	SearchRelationshipHints,
	SearchResult,
	SearchSnippet as SearchHitSnippet,
	SearchSourceFreshness,
	SearchSourceStatus,
	SemanticAssist,
	SemanticAssistStatus,
} from './queries/search-query';
export { searchVaultForActor } from './queries/search-query';

// SRCH-009 / SRCH-001: the LOCAL SEARCH INDEX FRESHNESS model — the FOUNDATION the SRCH query surfaces
// build on. It holds no content (rebuildable, device-local cache); it tracks per-DOMAIN index cursors so
// the engine can PUBLISH freshness, the source cursor, and partial-result status WITHOUT blocking cached
// results. Fail-closed: an unproven/unavailable domain is `stale`/`unknown`, never `fresh`. Pure reducers.
export type {
	SearchDomain,
	SearchDomainFreshness,
	SearchDomainFreshnessStatus,
	SearchDomainIndex,
	SearchIndexCursor,
	SearchIndexState,
} from './state/search-index';
export {
	EMPTY_INDEX_CURSOR,
	EMPTY_SEARCH_INDEX,
	SEARCH_DOMAINS,
	SEARCH_INDEX_SCHEMA_VERSION,
	catchUpDomainIndex,
	createEmptySearchIndex,
	domainFreshnessStatus,
	ensureSearchIndex,
	observeDomainSourceCursor,
	publishDomainFreshness,
	recordDomainMutation,
	setDomainAvailability,
} from './state/search-index';

// SRCH-009: PUBLISH per-domain index freshness for an actor, layered on the SAME actor-filtered domain
// reads as search. The source cursor is derived from the actor's VISIBLE artifacts only (no hidden artifact
// influences the cursor/behind-by — no leak), compared to the local index's consumed cursor. Decoupled
// from the cached results, so an incomplete index never blocks search (local-first). Fail-closed.
export type { SearchIndexStatusView } from './queries/search-index-query';
export { getSearchIndexStatus } from './queries/search-index-query';

// SRCH-004: THE actor-filtered SAVED-SEARCH read. A `dm-only` saved search is OMITTED ENTIRELY from a
// non-DM's list (AC2 — DM-only criteria never leak); every visible saved search is re-evaluated LIVE for
// the running actor (no stale leak — SRCH-003 AC1/AC4). `getPinnedSavedSearchesForActor` feeds the Command
// Center widget (AC1). Pure + deterministic; the GUI renders the computed result + dispatches intents.
export type { SavedSearchView } from './queries/saved-search-query';
export {
	actorCanAuthorSavedSearch,
	getPinnedSavedSearchesForActor,
	getSavedSearchesForActor,
	runSavedSearchForActor,
} from './queries/saved-search-query';

// CONTENT-007 / CONTENT-008: pure, deterministic Obsidian-aware markdown parse/serialize — the
// determinism keystone for import/export. Preserves frontmatter properties, aliases, tags, wikilinks.
export type { HeadingAnchor, ParsedMarkdownNote, ParsedWikilink } from './state/markdown';
export {
	MARKDOWN_PARSE_SCHEMA_VERSION,
	extractWikilinks,
	headingAnchors,
	parseMarkdownNote,
	serializeMarkdownNote,
	slugifyHeading,
} from './state/markdown';

// SEC-002 — PATH-LIKE INPUT SAFETY. The pure, fail-closed validator every path-like input (an import
// archive path, a note/object id, a folder name) passes BEFORE any read/write: traversal, NUL bytes,
// control characters, length, unsupported schemes, absolute paths — plus the defence-in-depth vault
// CONTAINMENT resolver that rejects an escape even if earlier validation missed it (SEC-002 AC2).
export type { PathRejection, PathRejectionReason, PathValidationResult } from './security/path-safety';
export {
	MAX_PATH_LENGTH,
	MAX_PATH_SEGMENT_LENGTH,
	PATH_SAFETY_SCHEMA_VERSION,
	isSafePathInput,
	resolveWithinVaultRoot,
	validateIdInput,
	validatePathInput,
} from './security/path-safety';

// SEC-003 — CONTENT SAFETY. The pure sanitizer untrusted markdown/embeds/object cards/imported source
// content pass through before entering the renderer DOM: raw HTML/script stripped to inert text and
// dangerous URL schemes (`javascript:`/`data:`/`vbscript:`/`file:`) neutralized, while legitimate
// content (valid markdown, safe links, wikilinks) is preserved. Composed by the markdown render path.
export {
	CONTENT_SAFETY_SCHEMA_VERSION,
	NEUTRALIZED_URL,
	isSafeMarkdownContent,
	isSafeUrl,
	neutralizeMarkdownLinks,
	safeUrl,
	sanitizeMarkdownContent,
	stripRawHtml,
} from './security/content-safety';

// SEC-006 — BOUNDARY PAYLOAD LIMITS. Explicit size/count ceilings (enforced BEFORE allocation-heavy
// processing) layered on top of Zod's schema validation + enum allowlists + field-path rejections, so an
// oversized import/body crossing a trust boundary is rejected cheaply with a STRUCTURED error.
export type {
	BoundedImportFile,
	PayloadLimitReason,
	PayloadLimitRejection,
	PayloadLimitResult,
} from './security/payload-limits';
export {
	MAX_CONTENT_BODY_BYTES,
	MAX_IMPORT_ENTRIES,
	MAX_IMPORT_FILE_BYTES,
	MAX_IMPORT_TOTAL_BYTES,
	PAYLOAD_LIMITS_SCHEMA_VERSION,
	byteLength,
	validateBodyLimit,
	validateImportLimits,
} from './security/payload-limits';

// SEC-008 — THE SECURITY REGRESSION-GATE REGISTRY. The declared catalogue of security-critical boundaries
// (IPC validation, storage containment, markdown sanitization, widget host permission denial, sync stream
// filtering, MCP staged write enforcement, cloud join authorization), each naming its guard surface + the
// dedicated test that proves it. The coverage meta-test drives this so a boundary added without tests fails
// CLOSED (SEC-008 AC1). It indexes existing enforcement; it never re-implements a boundary.
export type {
	SecurityBoundaryDefinition,
	SecurityBoundaryId,
	SecurityBoundaryRegistryProblem,
} from './security/regression-gates';
export {
	SECURITY_BOUNDARIES,
	SECURITY_BOUNDARY_IDS,
	findSecurityBoundary,
	validateSecurityBoundaryRegistry,
} from './security/regression-gates';

// CON-004 — THE PERMISSION-SUSTAINABILITY CONSTRAINT GATE. The declared invariant that keeps the
// permission/grant model bounded and comprehensible: capability sets stay SCHEMA-DEFINED NAMED options,
// never per-instance raw field lists (Cross-Contract Non-Negotiable 9). `findRawFieldListGrant` is the
// fail-closed AC1 detector the grant command boundary composes; `auditCapabilitySetGovernance` is the
// AC2 + sustainability governance audit (every grouping is a named, governed set; the model stays under
// a declared per-entity-type cap). It COMPOSES the capability-set schema/descriptors; it never
// re-implements the grant model. Mirrors the SEC-008/PERF-001 registry-gate pattern.
export type {
	CapabilitySetGovernanceProblem,
	CapabilitySetGovernanceSummary,
	RawFieldListGrantFinding,
} from './con/capability-set-sustainability';
export {
	CAPABILITY_SET_SUSTAINABILITY_VERSION,
	MAX_CAPABILITY_SETS_PER_ENTITY_TYPE,
	RAW_FIELD_LIST_SIGNAL_KEYS,
	auditCapabilitySetGovernance,
	findRawFieldListGrant,
	isGovernedCapabilitySet,
	isRawFieldListGrant,
	summarizeCapabilitySetGovernance,
} from './con/capability-set-sustainability';

// CON-003 + CON-006 — THE SCOPE-BOUNDARY CONSTRAINT GATE. The declared invariant that keeps v2 inside its
// declared scope boundaries: no community marketplace / public directory / plugin ecosystem / third-party
// compendium / i18n / public wiki (CON-003), and no new top-level platform / source / AI provider / public
// extension surface / cloud backend assumption (CON-006) without an explicit scope/contract revision.
// `findScopeViolation` is the fail-closed scope-review detector (reject / move to future scope) and
// `auditScopeBoundary` is the codebase-drift audit that cross-checks the LIVE declared registries (platform
// profiles, content sources, widget host permissions, widget author scopes) against the declared in-scope
// allowlists. It COMPOSES the existing declared registries; it never re-implements them. Mirrors the
// SEC-008 / PLAT-010 / CON-004 registry-gate pattern, wired into `scripts/quality-gates.ts` (`pnpm v2:gates`).
export type {
	InScopeWidgetDistributionScope,
	OutOfScopeFeatureClass,
	ScopeBoundaryProblem,
	ScopeBoundarySummary,
	ScopeProposal,
	ScopeViolationFinding,
	TopLevelScopeAxis,
} from './con/scope-constraints';
export {
	DECLARED_CONTENT_SOURCES,
	DECLARED_PLATFORM_TARGETS,
	DECLARED_WIDGET_DISTRIBUTION_SCOPES,
	DECLARED_WIDGET_HOST_PERMISSIONS,
	OUT_OF_SCOPE_FEATURE_CLASSES,
	PUBLIC_DISTRIBUTION_SIGNAL_TOKENS,
	SCOPE_CONSTRAINTS_VERSION,
	TOP_LEVEL_SCOPE_AXES,
	auditScopeBoundary,
	findScopeViolation,
	isDeclaredInScopeForAxis,
	isInScopeWidgetDistribution,
	summarizeScopeBoundary,
} from './con/scope-constraints';

// CON-001 — THE "GUI HIDING IS NEVER AUTHORITATIVE" CONSTRAINT GATE. The declared invariant that the
// data/storage/query layer — never the GUI — is the authoritative enforcement point for visibility,
// permission, sync-filtering, and security decisions (Contract 3; Defects `CODEX-PR5-DM-NOTES-LEAK`,
// `CODEX-PR17-POI-VISIBILITY-LEAK`). `projectEntityForActor` is the sanctioned non-DM read (hidden data is
// OMITTED at the source — AC1); `assertProjectionHasNoDmOnlyField` proves the GUI-bound payload carries no
// DM-only field to leak even if a component renders everything (AC2); `auditGuiHidingReliance` proves every
// non-DM delivery surface enforces at the data layer (none `gui-only`). It COMPOSES the existing visibility
// filter + SEC-010 stream-privacy scan; it never re-implements them. Mirrors the SEC-008/CON-003/004/006
// registry-gate pattern, wired into `scripts/quality-gates.ts` (`pnpm v2:gates`).
export type {
	EnforcementPoint,
	GuiHidingConstraintSummary,
	GuiHidingProblem,
	NonDmDeliverySurface,
} from './con/gui-hiding-not-authoritative';
export {
	GUI_HIDING_CONSTRAINT_VERSION,
	NON_DM_DELIVERY_SURFACES,
	assertProjectionHasNoDmOnlyField,
	auditGuiHidingReliance,
	findDmOnlyFieldLeaks,
	projectEntityForActor,
	summarizeGuiHidingConstraint,
} from './con/gui-hiding-not-authoritative';

// CON-002 — THE "NETWORK / MCP / AI / CLOUD IS NEVER REQUIRED" CONSTRAINT GATE. The declared invariant that
// no external dependency may be REQUIRED for core local workflows (Contract 2 Local-First Invariant;
// Cross-Contract Non-Negotiables 3/6/7). `evaluateWorkflowsUnderOutage` proves every core workflow stays
// usable with everything external disabled (AC1); `annotationDegradesWithoutAi` proves AI degrades to the
// deterministic path (AC2); `assertExternalDependencyOptional` proves no network handle is required;
// `auditExternalDependencyRequirement` proves every external dependency class is supplementary, never
// required. It COMPOSES the SYNC-001 local-first model + the MCP AI-boundary seam; it never re-implements
// them. Mirrors the SEC-008/CON-003/004/006 registry-gate pattern, wired into `scripts/quality-gates.ts`.
export type {
	DependencyPosture,
	ExternalDependencyClass,
	ExternalDependencyProblem,
	ExternalOutageProfile,
	NetworkNotRequiredSummary,
	WorkflowOutageResult,
} from './con/network-not-required';
export {
	EXTERNAL_DEPENDENCY_CLASSES,
	EXTERNAL_DEPENDENCY_POSTURE,
	NETWORK_NOT_REQUIRED_VERSION,
	TOTAL_OUTAGE_PROFILE,
	annotationDegradesWithoutAi,
	assertExternalDependencyOptional,
	auditExternalDependencyRequirement,
	evaluateWorkflowsUnderOutage,
	summarizeNetworkNotRequired,
} from './con/network-not-required';

// CON-005 — THE SOURCE-OF-TRUTH CONSTRAINT GATE. The declared invariant that the LOCAL vault / owning
// durable state document is the authoritative copy of core vault content; cloud storage, external sources,
// generated snapshots, player-device caches, and widget-local state may never be the SOLE source of truth
// (Contract 2 Cloud Storage Model; Contract 4 Widget State Ownership; Cross-Contract Non-Negotiable 5).
// `vaultUsableWithoutCloud` proves the vault stays usable + can queue ops with cloud off (AC1);
// `findWidgetLocalSourceOfTruthViolation` proves widget-local state never holds canonical entity data (AC2);
// `auditSourceOfTruthOwnership` proves every core content class is owned by a durable-local state document.
// It COMPOSES the SYNC-007/008 storage-classification policy + the Contract 1/4 ownership tables; it never
// re-implements them. Mirrors the SEC-008/CON-003/004/006 registry-gate pattern, wired into `pnpm v2:gates`.
export type {
	AuthoritativeOwner,
	CoreContentOwnership,
	NonAuthoritativeStoreClass,
	SourceOfTruthProblem,
	SourceOfTruthSummary,
	WidgetSourceOfTruthFinding,
	WidgetSourceOfTruthReason,
} from './con/source-of-truth';
export {
	AUTHORITATIVE_OWNERS,
	CANONICAL_FIELD_SIGNAL_KEYS,
	CORE_CONTENT_OWNERSHIP,
	NON_AUTHORITATIVE_STORE_CLASSES,
	SOURCE_OF_TRUTH_VERSION,
	auditSourceOfTruthOwnership,
	findWidgetLocalSourceOfTruthViolation,
	isWidgetLocalSourceOfTruth,
	summarizeSourceOfTruth,
	vaultUsableWithoutCloud,
} from './con/source-of-truth';

// SEC-010 — STREAM-PRIVACY PROOF + COVERAGE HARNESS. The shared, fail-closed proof that a player/observer
// replication stream (or any `*ForActor` projection) carries NO hidden value/title/id/edge/snippet/count,
// plus the replication-surface coverage enumeration so a new query surface is included in the filtering
// tests before release (SEC-010 AC2). Composes the existing filters; it is the adversarial PROOF on top.
export type {
	ReplicationSurfaceDomain,
	StreamPrivacyLeak,
	StreamPrivacyNeedle,
	StreamPrivacyNeedleKind,
} from './collab/stream-privacy';
export {
	REPLICATION_SURFACE_DOMAINS,
	assertViewCarriesNoHiddenContent,
	findStreamPrivacyLeaks,
	isReplicationSurfaceDomain,
	uncoveredReplicationSurfaceDomains,
} from './collab/stream-privacy';

// SEC-011 — WIDGET HOST NETWORK + EXFILTRATION CONTROLS. The pure, fail-closed policy constraining widget
// OUTBOUND requests (blocks/redacts hidden actor data, raw vault content, tokens, diagnostics, absolute
// paths; denies + audits an unapproved destination class), proving widget-local storage is never canonical,
// and isolating a crashed/policy-violating widget. Composes the host-permission model + the redaction guard.
export type {
	ExfiltrationClass,
	WidgetDestinationClass,
	WidgetIsolationReason,
	WidgetIsolationResult,
	WidgetNetworkGrant,
	WidgetOutboundAudit,
	WidgetOutboundDecision,
	WidgetOutboundRequest,
	WidgetOutboundResult,
	WidgetPersistedStateEntry,
	WidgetStateOwnership,
	WidgetStateOwnershipProblem,
} from './security/widget-exfiltration';
export {
	WIDGET_DESTINATION_CLASSES,
	evaluateWidgetOutboundRequest,
	evaluateWidgetStateOwnership,
	isolateWidgetFailure,
} from './security/widget-exfiltration';

// SEC-001 — RENDERER ISOLATION. The pure, fail-closed policy that declares the forbidden renderer import
// surfaces (the single source of truth the boundary-lint enforces; AC1), proves the renderer is exposed
// ONLY the named, allowlisted platform-service methods with no generic invoke channel (AC2), and validates
// a desktop renderer-window security configuration (`contextIsolation`/`nodeIntegration`/`sandbox`/preload
// named-APIs-only) so a release security check can reject a misconfigured shell fail-closed (AC3). Composes
// the platform-service allowlist; it never re-implements the boundary, it gates the configuration of it.
export type {
	RendererChannelSurface,
	RendererChannelViolation,
	RendererChannelViolationKind,
	RendererWindowSecurityConfig,
	RendererWindowViolation,
	RendererWindowViolationCode,
} from './security/renderer-isolation';
export {
	FORBIDDEN_RENDERER_IMPORT_PREFIXES,
	RENDERER_ISOLATION_SCHEMA_VERSION,
	SECURE_RENDERER_WINDOW_CONFIG,
	auditRendererChannelSurface,
	isForbiddenRendererImport,
	isRendererWindowSecure,
	validateRendererWindowSecurity,
} from './security/renderer-isolation';

// SEC-007 — CONSTRAINED WIDGET HOST API. The pure, fail-closed policy deciding which host-API capabilities
// are available to custom widget code given its declared/approved host permissions: a clipboard request
// without the permission is unavailable (AC1); a raw-vault-file read is rejected and isolates the widget
// failure (AC2); a network request to an unapproved destination class is unavailable + audited (AC3). The
// storage-adapter/IPC/cloud-client/auth-token/platform-bridge/raw-vault-file/hidden-actor-data surfaces are
// ALWAYS forbidden. Composes the host-permission catalogue, the outbound gate, and the isolation primitive.
export type {
	HostCapabilityAudit,
	HostCapabilityDecision,
	HostCapabilityGrant,
	HostCapabilityResult,
	RawVaultFileAccessResult,
	WidgetHostCapability,
} from './security/widget-host-api';
export {
	FORBIDDEN_HOST_CAPABILITIES,
	PERMISSION_GATED_CAPABILITIES,
	WIDGET_HOST_API_SCHEMA_VERSION,
	isHostCapabilityAvailable,
	requestRawVaultFileAccess,
	requestWidgetNetwork,
	requiredPermissionFor,
	resolveHostCapability,
} from './security/widget-host-api';

// SEC-004 — THE SECRET-CUSTODY POLICY. Auth/refresh/session/cloud/MCP secrets live in the OS/platform
// credential store (or fail-closed encrypted-device-local) and NEVER cross a durable/outbound channel
// (vault/export/op-log/sync/player-stream/diagnostics/log/error) in plaintext. Composes the diagnostics
// redaction guard + the SYNC storage-classification registry; `assertNoSecretLeak` is the boundary guard.
export type {
	SecretChannel,
	SecretCustodyStatus,
	SecretKind,
	SecretLeakFinding,
	SecretStorageLocation,
} from './security/secret-custody';
export {
	SECRET_CHANNELS,
	SECRET_CUSTODY_SCHEMA_VERSION,
	SECRET_KINDS,
	SECRET_KIND_LABELS,
	assertNoSecretLeak,
	assertSecretCategoryIsDeviceLocal,
	describeSecretCustody,
	findSecretLeak,
	requiredSecretLocation,
	scrubForChannel,
	storageCategoryForSecret,
} from './security/secret-custody';

// SEC-005 — THE CLOUD-COLLABORATION SECURITY BOUNDARY. The fail-closed, pre-payload policy a cloud transport
// plugs into: rate-limited joins that do not leak session existence (AC2), participant-revocation denial +
// queued-op admissibility (AC5), and the cloud-side request gate — tenant/session/stream isolation (AC3),
// fail-closed unsupported-payload-version parsing (AC1), and nonce-replay rejection/idempotency (AC4).
// Composes the COLLAB join policy + the SYNC replay validator; every decision precedes payload generation.
export type {
	CloudJoinDenialReason,
	CloudJoinGateInput,
	CloudJoinGateOutcome,
	CloudRequestContext,
	CloudRequestOutcome,
	CloudRequestRejectionReason,
	JoinAttemptRecord,
	JoinRateLimitConfig,
	JoinRateLimitDecision,
	ParticipantRevocation,
	ParticipantRevocationState,
} from './security/cloud-boundary';
export {
	CLOUD_BOUNDARY_SCHEMA_VERSION,
	DEFAULT_JOIN_RATE_LIMIT,
	authorizeCloudRequest,
	evaluateCloudJoinGate,
	evaluateJoinRateLimit,
	isQueuedOpAdmissibleAfterRevocation,
	recordFailedJoinAttempt,
} from './security/cloud-boundary';

// SEC-009 — THE CLOUD SECURITY MODEL DECISION RECORD + RELEASE GATE. The machine-checkable mirror of the
// prose decision record (encryption responsibilities, key custody, server trust boundaries, credential
// rotation, recovery tradeoffs); the fail-closed release gate that BLOCKS cloud release until a complete,
// approved record + the SYNC-017 prerequisites are satisfied (AC3); and the server-visibility classifier
// proving an E2EE claim (the server sees ONLY the allowed metadata, never hidden content — AC4).
export type {
	AllowedServerMetadataClass,
	CloudReleaseGateResult,
	CloudSecurityDecisionRecord,
	CloudSecurityRecordProblem,
	CloudSecurityRecordProblemKind,
	EncryptionResponsibility,
	KeyCustodian,
	ServerVisibilityViolation,
	ServerVisibilityViolationReason,
	ServerVisibleField,
} from './security/cloud-security-model';
export {
	ALLOWED_SERVER_METADATA_CLASSES,
	CLOUD_SECURITY_MODEL_SCHEMA_VERSION,
	UNDECLARED_CLOUD_SECURITY_DECISION_RECORD,
	assertServerSeesOnlyAllowedMetadata,
	canReleaseCloud,
	evaluateCloudReleaseGate,
	findServerVisibilityViolations,
	validateCloudSecurityRecord,
} from './security/cloud-security-model';

// SEC-012 — CLOUD KEY CUSTODY / ROTATION / REVOCATION / RECOVERY, ENFORCED BY TESTS. The deterministic
// logical key-epoch model (no cipher, per ADR-014): rotation on revocation locks a removed participant out
// of the new content epoch (AC1); recovery restores ONLY the approved scope, never another vault/tenant/
// participant stream (AC2); and a compromised cloud store exposes ONLY ciphertext + documented metadata
// classes (AC3). Composes the SEC-009 trust-boundary metadata + the redaction guard.
export type {
	CloudStoredArtifact,
	CloudStoredDataClass,
	KeyRotationResult,
	ParticipantKeyHolding,
	RecoverableItem,
	RecoveryScope,
	RecoveryScopeResult,
	RecoveryScopeViolation,
	RecoveryScopeViolationReason,
	TrustBoundaryExposure,
	TrustBoundaryViolationReason,
} from './security/key-custody';
export {
	KEY_CUSTODY_SCHEMA_VERSION,
	assertCompromiseMatchesTrustBoundary,
	assertRecoveryWithinScope,
	assertRevokedCannotDecryptNewEpoch,
	canDecryptEpoch,
	evaluateServerTrustBoundary,
	keyMaterialStaysDeviceLocal,
	partitionRecoveryScope,
	rotateKeyOnRevocation,
} from './security/key-custody';

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

// GRAPH-002: the PURE NOTE-RELATIONSHIP engine — BACKLINKS, CROSS-SECTION links, and RELATED-NOTE jumps with
// context snippets, computed deterministically from explicit note records. Built on the SAME actor-filtered
// link graph the CONTENT/SRCH surfaces use (no second relationship source); the actor-filtered query layer
// feeds it only the notes + visible sections the actor may see, so a backlink/jump/snippet can never name or
// quote a hidden note/section.
export type {
	CrossSectionResolution,
	NoteBacklink,
	NoteRelationshipRecord,
	NoteRelationships,
	RelatedNoteJump,
} from './state/note-relationships';
export {
	NOTE_RELATIONSHIPS_SCHEMA_VERSION,
	computeNoteRelationships,
	noteSectionAnchors,
} from './state/note-relationships';

// GRAPH-002: the ACTOR-FILTERED note-relationship surface. Composes the single visibility-and-tombstone
// content read so a hidden/deleted backlink SOURCE is absent (AC2), redacts context snippets by SECTION
// visibility (a partially-hidden source note surfaces its backlink WITHOUT a possibly-leaking quote), and
// FAILS CLOSED at the target (relationships of a note the actor cannot see return the generic empty set,
// indistinguishable from "no relationships" — a stale link to a now-hidden target degrades gracefully).
export { getNoteRelationshipsForActor } from './queries/note-relationships';

// GRAPH-003: the PURE DETERMINISTIC GRAPH-QUALITY engine — UNRESOLVED links (+ deterministic repair
// candidates), ALIAS / DUPLICATE-TITLE disambiguation, ORPHAN + HUB notes, and RELATIONSHIP-QUALITY scores
// (each carrying deterministic inputs + a versioned threshold + source references, no AI). Built on the SAME
// actor-filtered link graph + wikilink candidate index (no second relationship source); every finding is over
// the visible graph only, so an unresolved link can never distinguish "hidden" from "missing".
export type {
	ConnectionBand,
	DisambiguationGroup,
	GraphQualityReport,
	HubNote,
	OrphanNote,
	QualityNode,
	RelationshipQualityScore,
	UnresolvedLink,
} from './state/graph-quality';
export {
	GRAPH_QUALITY_SCHEMA_VERSION,
	GRAPH_QUALITY_THRESHOLD_VERSION,
	QUALITY_THRESHOLDS,
	buildQualityNode,
	computeGraphQuality,
} from './state/graph-quality';
// GRAPH-003: the ACTOR-FILTERED graph-quality surface. Composes the visibility-and-tombstone content read +
// the actor-filtered wikilink candidate index, so hidden notes are never analyzed nor revealed (a player's
// report and the DM's differ only by which notes are visible). Unknown actor ⇒ empty report (fail closed).
export { getGraphQualityForActor } from './queries/graph-quality-query';

// GRAPH-007: the PURE DETERMINISTIC GRAPH HEALTH + COVERAGE engine — STALE notes, MISSING links, CONTENT
// gaps, OPEN threads, and a 0–100 coverage grade, computed from the visible-graph quality report + staleness
// signals. Optional narrative AI explanation is a thin labelled layer over the deterministic findings (the
// findings stay the source of truth — AC2); the report needs no AI, so it completes offline (AC4).
export type {
	ContentGapFinding,
	CoverageScore,
	GraphHealthReport,
	HealthAiExplainer,
	HealthExplanation,
	HealthExplanationStatus,
	HealthNoteSignal,
	MissingLinkFinding,
	OpenThreadFinding,
	StaleNoteFinding,
	StalenessBand,
} from './state/graph-health';
export {
	GRAPH_HEALTH_SCHEMA_VERSION,
	GRAPH_HEALTH_THRESHOLD_VERSION,
	HEALTH_THRESHOLDS,
	computeGraphHealth,
	explainGraphHealth,
} from './state/graph-health';
// GRAPH-007: the actor-filtered health surface. The FULL report is DM-only (a non-DM gets the empty report —
// fail closed). The PLAYER-SCOPED summary computes over the actor's visible graph (no hidden node/snippet)
// AND generalizes aggregate counts into coarse bands so a count can never betray hidden content (AC3).
export type { CountBand, PlayerScopedHealthSummary } from './queries/graph-health-query';
export {
	getGraphHealthForDm,
	getPlayerScopedHealthSummary,
} from './queries/graph-health-query';

// GRAPH-009: the PURE DETERMINISTIC CALENDAR / CUSTOM-TIME RELATIONSHIP engine — it indexes the date
// references content carries and derives the date RELATIONSHIPS (same-date co-occurrence + timeline
// references) exposed through the visibility-filtered graph API. Built on the SAME CONTENT-011 date reads
// (no second calendar index); a hidden calendar-linked event AND its relationship edge are absent (AC2).
export type {
	DateEdgeKind,
	DateGraphEdge,
	DateGraphIndex,
	DateGraphNode,
	DateIndexEntry,
	DateRefKind,
	DateRelationships,
} from './state/graph-dates';
export {
	DATE_REF_KINDS,
	GRAPH_DATES_SCHEMA_VERSION,
	buildDateGraphIndex,
	relatedDatesForEntity,
} from './state/graph-dates';
// GRAPH-009: the actor-filtered calendar/custom-time GRAPH API. Composes getContentItemsForActor (date
// fields + timeline refs, with hidden targets already nulled) + getCalendarContinuityForActor (timeline
// links, edge only when the target resolved visible), so visible date relationships are queryable (AC1) and
// hidden events + edges are absent (AC2). Unknown actor / hidden target ⇒ empty (fail closed).
export {
	getDateGraphIndexForActor,
	getDateRelationshipsForActor,
} from './queries/graph-dates-query';

// GRAPH-010: the PURE DETERMINISTIC LINK-REPAIR + LINK-PICKER engine — a non-revealing link-picker
// suggestion list, a bulk-repair PREVIEW (each rewrite + affected source + ambiguity + unsupported-source
// limitation), and dead-link detection. Built on the SAME actor-filtered wikilink candidate index, so a
// hidden note is never suggested / previewed / proposed (AC1, AC4). Reuses the CONTENT-006 resolution path.
export type {
	BulkRepairPreview,
	BulkRepairPreviewRow,
	DeadLinkOccurrence,
	LinkPickerSuggestion,
	RepairBlockReason,
} from './state/graph-link-repair';
export {
	GRAPH_LINK_REPAIR_SCHEMA_VERSION,
	buildBulkRepairPreview,
	buildLinkPickerSuggestions,
	deadLinksInBody,
} from './state/graph-link-repair';
// GRAPH-010: the actor-filtered + capability-scoped link-repair surface. The link picker offers only visible
// candidates (AC1, AC4); the bulk preview scans only items the actor may EDIT (DM, or a section-editor grant);
// a chosen repair is AUTHORIZED at the data layer before mutation, so a section-editor on one item can never
// rewrite another item/source (AC5). The repair COMPUTES the body via the CONTENT-006 repair path (AC3).
export type {
	RepairAuthorizationRejection,
	RepairAuthorizationResult,
} from './queries/graph-link-repair-query';
export {
	authorizeLinkRepairForActor,
	getLinkPickerSuggestionsForActor,
	previewBulkLinkRepairForActor,
} from './queries/graph-link-repair-query';

// GRAPH-005: the PURE DETERMINISTIC INCREMENTAL GRAPH-INDEX engine — it builds the link graph (nodes + edges)
// over node records, APPLIES a single accepted change INCREMENTALLY (only the affected nodes/edges + the
// dependent backlink index update), computes the DELTA between two snapshots, and tracks per-graph FRESHNESS
// reusing the SRCH index-cursor convention WHOLESALE (same cursor shape + fresh/partial/stale/unknown
// statuses + fail-closed rule). Incremental updates CONVERGE to the full recompute (graphsEqual / diff prove
// it). A failed incremental update marks the graph stale and requires a repair/REINDEX (AC2, fail closed).
export type {
	GraphChange,
	GraphEdge,
	GraphEdgeDelta,
	GraphIndex,
	GraphIndexDelta,
	GraphIndexState,
	GraphNode,
	GraphNodeDelta,
	GraphNodeKind,
	GraphNodeRecord,
	GraphRepairSignal,
} from './state/graph-index';
export {
	GRAPH_INDEX_SCHEMA_VERSION,
	GRAPH_NODE_KINDS,
	applyGraphChange,
	backlinksOf,
	buildGraphIndex,
	buildGraphIndexState,
	diffGraphIndex,
	emptyGraphIndex,
	emptyGraphIndexState,
	forwardLinksOf,
	graphFreshnessStatus,
	graphRepairSignal,
	graphsEqual,
	markGraphStale,
	outboundTargetsFromBody,
	publishGraphFreshness,
	setGraphAvailability,
} from './state/graph-index';
// GRAPH-005: the ACTOR-FILTERED incremental graph-index surface. Builds the actor's visible graph over the
// SAME content/map actor-filtered reads (no second relationship source), maintains it incrementally after an
// accepted note/object/map/POI/sync change (the change carries only a visible record, so it can never surface
// a hidden node/edge — fail closed), and exposes the backlink/forward reverse index, freshness, and the
// repair/REINDEX signal. Unknown actor ⇒ empty graph (fail closed).
export {
	applyGraphChangeForActor,
	getGraphBacklinksForActor,
	getGraphForwardLinksForActor,
	getGraphIndexForActor,
	getGraphIndexStateForActor,
	getGraphRepairSignalForActor,
	graphRemoveChange,
	graphUpsertChangeForContent,
	markGraphStaleForActor,
	setGraphAvailabilityForActor,
} from './queries/graph-index-query';

// GRAPH-006: the SOURCE-AGNOSTIC graph query API — the SINGLE actor-filtered entry point navigation, search,
// widgets, and MCP tools use to read the graph (backlinks, related notes, cross-source link resolution)
// WITHOUT any consumer parsing raw markdown. A thin façade COMPOSING the GRAPH-002 navigable relationships +
// the GRAPH-005 structural index + the CONTENT-006 source-agnostic resolution. Actor-filtered + fail-closed:
// a player (or a player-scoped widget/MCP request) receives ONLY visible relationships (AC2); an MCP backlink
// request goes through this API rather than reading files ad hoc (AC1). The consumer kind is audit-only and
// never widens visibility.
export type { GraphConsumer, GraphRelationshipsResult } from './queries/graph-api';
export {
	getGraphBacklinks,
	getGraphRelatedNotes,
	getGraphRelationships,
	resolveGraphLink,
} from './queries/graph-api';

// GRAPH-001 / GRAPH-008: the SOURCE-INDEXING engine — build the link graph FROM the content sources (local
// files, Obsidian notes, Google Docs documents) ACROSS all configured sync sources, PRESERVE each node's
// source-specific identifiers + revision metadata to reconcile it back to its source, and track PER-SOURCE
// freshness so a not-cached/unavailable source marks the cached graph PARTIAL/STALE (cached metadata shown
// stale, never silently recomputed) without blocking the cached relationships that DID index. Composes the
// SAME GRAPH-005 structural engine + the SRCH freshness convention + the SYNC source taxonomy — one graph,
// one source layer. Pure + deterministic (identical sources ⇒ identical indexes).
export type {
	ConfiguredGraphSource,
	GraphSourceDiagnostic,
	GraphSourceFreshness,
	GraphSourceKind,
	GraphSourceRef,
	SourceGraphIndex,
	SourceGraphNode,
	SourceGraphNodeRecord,
} from './state/graph-source-index';
export {
	GRAPH_SOURCE_INDEX_SCHEMA_VERSION,
	GRAPH_SOURCE_KINDS,
	buildSourceGraphIndex,
	combineSourceStatuses,
	configuredSourceFromRecords,
	emptySourceGraphIndex,
	isSourceGraphPartial,
	publishSourceFreshness,
	sourceFreshnessStatus,
	sourceGraphDiagnostics,
	sourceGraphNodes,
	sourceRefForNode,
	unknownGraphSourceRef,
} from './state/graph-source-index';
// GRAPH-001 / GRAPH-008: the ACTOR-FILTERED source-indexing surface. Builds the actor's visible source graph
// over the SAME content/map actor-filtered reads (no second source layer), derives each node's provenance
// from the source metadata the adapters/import already recorded (never overwriting user frontmatter), and
// exposes the source-aware nodes, the per-node reconciliation ref, the stale/partial source diagnostics, and
// the partial-graph signal. Unknown actor ⇒ empty index (fail closed).
export type { SourceGraphAvailability } from './queries/graph-source-index-query';
export {
	getSourceGraphDiagnosticsForActor,
	getSourceGraphIndexForActor,
	getSourceGraphNodesForActor,
	getSourceRefForActor,
	isSourceGraphPartialForActor,
} from './queries/graph-source-index-query';

// GRAPH-004: the ACTOR-FILTERED graph-VISUALIZATION view model — the single computed model a graph
// visualization renders. The user filters the visible link graph by FOLDER, TAG, ENTITY TYPE, SOURCE,
// RELATIONSHIP TYPE, and visibility-safe SEARCH TEXT, and receives the matching VISIBLE nodes + the VISIBLE
// edges between them, plus the filter FACETS derived from the visible graph only. It COMPOSES the GRAPH-001/008
// source graph (no second graph) + the SAME folder/tag derivation as the SRCH filter surface, and fails
// closed: a hidden node never becomes a node, edge endpoint, facet, or count. Unknown actor ⇒ empty model.
export type {
	GraphRelationshipKind,
	GraphVisualization,
	GraphVizEdge,
	GraphVizFacets,
	GraphVizFilter,
	GraphVizNode,
} from './queries/graph-visualization-query';
export {
	GRAPH_RELATIONSHIP_KINDS,
	emptyGraphVisualization,
	getGraphVisualizationForActor,
} from './queries/graph-visualization-query';

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

// SES-012 — campaign calendar continuity command input schemas.
export {
	linkCalendarDateInputSchema,
	setCampaignDateInputSchema,
	unlinkCalendarDateInputSchema,
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

// SES-011: the SESSION WORKFLOW STATE MACHINE — the 7-state transition table + per-state command
// availability. Pure Processing-Core policy; the GUI renders the computed availability and the
// command guards enforce the authoritative gate (`active` remains the only live-session state).
export type {
	SessionCommandAvailability,
	SessionLifecycleIntent,
} from './lifecycle/session-workflow';
export {
	SESSION_COMMAND_AVAILABILITY,
	SESSION_INTENT_TARGET,
	SESSION_WORKFLOW_TRANSITIONS,
	allowedTransitionsFrom,
	availableSessionCommands,
	isLifecycleIntentAllowed,
	isSessionCommandAvailable,
	isTransitionAllowed,
} from './lifecycle/session-workflow';

// COLLAB-009 — FILTER-BEFORE-SEND replication-stream privacy (the keystone). Given the FULL op stream +
// a recipient actor, emits ONLY the ops that actor may see, so a player's/observer's outbound stream
// contains ZERO dm-only/hidden content — filtered AT THE SOURCE, before serialization, never hidden in
// the UI. Reuses the PERM visibility-filter engine; fail-closed (absent metadata ⇒ dm-only; unknown
// recipient ⇒ empty stream). `filterCatchUpStream` delivers only newly-authorized, not-yet-sent ops
// (AC2). `assertStreamCarriesNoHiddenContent` is the boundary leak guard. Per ADR-014 the LIVE transport
// is deferred; this is the policy a transport plugs into.
export type {
	ReplicationStreamResult,
	ReplicationVisibilitySource,
	ReplicationWithholdReason,
	WithheldOperation,
} from './collab/replication-filter';
export {
	assertStreamCarriesNoHiddenContent,
	filterCatchUpStream,
	filterReplicationStream,
	isOperationVisibleToRecipient,
} from './collab/replication-filter';

// COLLAB-008 — AUTHORITATIVE session-command resolution. A VALID DM command SUPERSEDES concurrent non-DM
// commands ON A FIELD WHERE SESSION POLICY GRANTS DM AUTHORITY (`dm-authoritative`); where policy does
// NOT (`shared-merge`), normal rules apply (no DM override; concurrent same-field edits conflict). An
// unauthorized non-DM command is REJECTED, not conflicted; a non-DM can NEVER override a DM (fail
// closed). Reuses the PERM base-role authority + grant model. Pure + deterministic.
export type {
	RejectedSessionCommand,
	SessionAuthorityOutcome,
	SessionAuthorityResolution,
	SessionFieldAuthority,
	SessionFieldCommand,
} from './collab/dm-authority';
export {
	DEFAULT_SESSION_FIELD_AUTHORITY,
	resolveSessionFieldAuthority,
} from './collab/dm-authority';

// COLLAB-010 + COLLAB-014 — the EXPLICIT SESSION-CACHE PRIVACY POLICY. On leave/end, every session-only
// cache entry WITHOUT a persistent grant is PURGED (online) or SEALED via session-key invalidation
// (offline), so it becomes unreadable EVEN IF the participant is offline (the offline-revocation crux,
// COLLAB-014 AC2). A persistent viewer grant RETAINS the entry (the COLLAB-010 exception, reusing the
// PERM grant model). The computed `SessionCachePolicy` carries TTL + key invalidation + persistent-grant
// exemptions; `isSealedCacheEntryUnreadable` evaluates local-TTL offline revocation;
// `computeParticipantCachePrivacyStatus` marks an unconfirmed device `purge-unconfirmed` without leaking
// device secrets. Per ADR-014 the real key custody / crypto is deferred; this is the policy + seam.
export type {
	CacheEntryDecision,
	CacheEntryDisposition,
	CachePrivacyInput,
	CachePrivacyResult,
	CachePurgeStatus,
	ParticipantCacheEntry,
	ParticipantCachePrivacyStatus,
	SessionCacheLifecycle,
	SessionCachePolicy,
} from './collab/cache-privacy';
export {
	DEFAULT_SESSION_CACHE_TTL_MS,
	SESSION_CACHE_POLICY_SCHEMA_VERSION,
	computeParticipantCachePrivacyStatus,
	decideCacheEntry,
	evaluateCachePrivacy,
	hasPersistentAccess,
	isSealedCacheEntryUnreadable,
} from './collab/cache-privacy';

// COLLAB-006 — the SHARED COMBAT VIEW participants see ACCORDING TO ROLE AND GRANTS. Builds on the SES-002
// actor-filtered tracker (hidden combatants omitted/placeholdered) and adds role/grant-gated PERMITTED
// CONTROLS (fail closed, matching the combat command authority) + OFFLINE/STALE handling (a stale/cached
// view disables every live-authority control). `filterCombatStreamForRecipient` filters combat ops at the
// source so a participant never RECEIVES a hidden combatant's ops (filter-before-send, COLLAB-009 reused);
// `assertCombatStreamCarriesNoHiddenCombatant` is the hard boundary leak guard. Pure + deterministic.
export type {
	CombatControlPermissions,
	CombatViewLiveness,
	SharedCombatView,
} from './collab/combat-view';
export {
	assertCombatStreamCarriesNoHiddenCombatant,
	combatantIdFromOpPath,
	computeCombatControls,
	filterCombatStreamForRecipient,
	getSharedCombatView,
} from './collab/combat-view';

// COLLAB-012 — PLAYER GROUP resolution. A Player Group is a DELIVERY/PROJECTION TARGET ONLY: resolving a
// delivery target through a group only EXPANDS the recipient list to current members; it confers NO
// capability/visibility/write authority. `resolveDeliveryTarget` unions explicit recipients + group members
// into individual deliverable recipients (fail closed: unknown group ⇒ no recipients; non-participant ⇒
// skipped). `groupMembershipGrantsNoCapability` is the executable proof that membership grants nothing.
export type { DeliveryTarget, ResolvedDeliveryTarget } from './collab/player-groups';
export {
	groupMembershipGrantsNoCapability,
	groupsContainingActor,
	resolveDeliveryTarget,
} from './collab/player-groups';

// COLLAB-012 — the durable PLAYER GROUP model (DM-authored delivery/projection target set). A group carries
// NO permission data — it is a plain membership list, so membership can never be a permission backdoor.
export type { PlayerGroup } from './state/player-group';
export {
	PLAYER_GROUP_ENTITY_TYPE,
	PLAYER_GROUP_SCHEMA_VERSION,
	clonePlayerGroup,
	ensurePlayerGroups,
	normalizeMembers,
} from './state/player-group';

// COLLAB-005 — the DM controls DIFFERENT PLAYER VIEW assignments for DIFFERENT players during the SAME
// session (Contract 4 Player View Rules). The COLLAB layer over the CANVAS player-view machinery:
// `projectPlayerViews` resolves EACH connected, non-DM participant's OWN filtered player view (assigned
// subset only, hidden bindings omitted) so different players receive different subsets at once (AC1);
// `crossPlayerLeakedWidgetIds` is the executable proof a participant's delivered view never exceeds their
// own assignment. `playerCanEditPlayerView` is the AC2 gate — a player may edit player-view widgets ONLY
// with scene `co-editor` (the SAME `actorCanCoEditScene` rule the scene-edit reducers enforce). Pure.
export type {
	ExcludedParticipant,
	ParticipantPlayerView,
	PlayerViewExclusionReason,
	PlayerViewProjectionSnapshot,
} from './collab/player-views';
export {
	crossPlayerLeakedWidgetIds,
	deliveredWidgetInstanceIds,
	playerCanEditPlayerView,
	projectPlayerViews,
} from './collab/player-views';

// COLLAB-011 — OBSERVER read-only access. Observers join as READ-ONLY participants with access ONLY to
// explicitly shared Scenes/maps/placeholders, NO character data, and NO write controls (Contract 3 Base
// Roles). The COLLAB layer composing the observer ceiling (`computeEffectivePermissions`), scene
// visibility (`evaluateSceneVisibility`), and the character-data guard (`decideCharacterDataRead`):
// `observerVisibleScenes` / `observerAccessSummary` compute the observer's visible scene list — excluding
// dm-only content, private player views, and character sheets by construction (AC1). `classifyObserverCommand`
// is the fail-closed write gate — an observer may invoke NO command (it is wired into `dispatchCommand`),
// so any write-capable command an observer invokes is rejected BEFORE mutation (AC2). Pure + fail closed.
export type {
	ObserverAccessDenialReason,
	ObserverAccessResult,
	ObserverAccessSummary,
	ObserverCommandClassification,
	ObserverVisibleScene,
} from './collab/observer-access';
export {
	classifyObserverCommand,
	isObserverActor,
	observerAccessSummary,
	observerVisibleScenes,
} from './collab/observer-access';

// COLLAB-001 — the SESSION JOIN / IDENTITY policy. A DM-issued invitation / local pairing code
// AUTHENTICATES a joiner as DM/Player/Observer; on success `joinSession` returns the filtered
// `SessionJoinResult` (role, participant id, ACTIVE grants only, visible scenes, capability-schema version,
// sync cursor). FAIL CLOSED: an expired/revoked/consumed credential discloses NO session state (only a
// generic denial); a remote-only credential over an unreachable network degrades to a local-paired join
// only when the credential is local-pairing-capable. Per ADR-014 the live invitation transport is deferred;
// this is the policy the transport plugs into. Pure + deterministic.
export type {
	JoinChannel,
	JoinCredentialKind,
	JoinDenialReason,
	JoinIdentityInput,
	InvitationStatus,
	SessionInvitation,
	SessionJoinOutcome,
	SessionJoinResult,
} from './collab/session-join';
export {
	SESSION_INVITATION_SCHEMA_VERSION,
	activeGrantsForParticipant,
	ensureSessionInvitation,
	isInvitationExpired,
	joinSession,
} from './collab/session-join';

// COLLAB-002 — RECONNECT CATCH-UP policy. On reconnect a participant RE-EVALUATES role/visibility/grants
// (against CURRENT permission state, never the cache) before receiving catch-up ops: `computeReconnectCatchUp`
// filters the missed stream to NOW-visible, not-yet-applied ops (reusing the COLLAB-009 catch-up filter, so a
// revoked-grant op and a now-hidden op are absent — AC1/AC2), then REVALIDATES the batch in dependency order
// via the SYNC-011 replay validator and gates durable controls (`enabled`/`disabled-syncing`/`disabled-stale`)
// so a now-unauthorized op never re-enables a control (AC3). `assertCatchUpRestoresNoRevokedAccess` is the
// boundary leak guard; `appliedIdsBeforeCursor` expands a sync cursor to its applied-id set. Pure + fail closed.
export type {
	CatchUpControlState,
	ReconnectCatchUpInput,
	ReconnectCatchUpResult,
	ReconnectReplayContextSource,
} from './collab/reconnect-catchup';
export {
	appliedIdsBeforeCursor,
	assertCatchUpRestoresNoRevokedAccess,
	computeReconnectCatchUp,
} from './collab/reconnect-catchup';

// COLLAB-013 — MOBILE / RECONNECT CATCH-UP policy across sleep/backgrounding/intermittent connectivity.
// `orderCatchUpByDependency` applies missed ops (Scene projection, handout delivery, grant revocation, combat)
// in DEPENDENCY order, holding a missing/cyclic dependency fail-closed (AC1); `isCachedHandoutOpenable` makes a
// revoked/sealed cached handout UNREADABLE before any stale UI can open it — sealing on local-TTL expiry even
// OFFLINE (reusing the COLLAB-014 seal policy — AC2); `deriveCatchUpFailureState` / `catchUpPhase` turn a
// mid-stream catch-up failure into stale/reconnecting UI state with durable commands DISABLED until caught up
// (reusing the COLLAB-002 control gate — AC3). Per ADR-014 the live mobile transport is deferred; pure policy.
export type {
	CatchUpFailureState,
	CatchUpOpKind,
	CatchUpOrderProblem,
	CatchUpOrderProblemKind,
	CatchUpOrderResult,
	CatchUpStreamPhase,
	CatchUpUiStatus,
} from './collab/mobile-catchup';
export {
	catchUpPhase,
	classifyCatchUpOp,
	deriveCatchUpFailureState,
	isCachedHandoutOpenable,
	orderCatchUpByDependency,
} from './collab/mobile-catchup';

// COLLAB-004 — the EPHEMERAL `PresenceState` document (Contract 1's seventh, non-durable state document;
// Contract 2 "Presence | Ephemeral broadcast, no durable merge"). Online status, cursor/selection hints,
// and device availability for currently-connected participants. A fully-replaceable per-actor snapshot —
// no revision/dependency/base/idempotency — because presence must never persist, merge, or replay. The
// empty state IS the offline state; an `offline` broadcast removes an entry. Never enters the op log.
export type {
	PresenceCursor,
	PresenceDeviceKind,
	PresenceEntry,
	PresenceOnlineStatus,
	PresenceSelection,
	PresenceState,
} from './state/presence-state';
export {
	EMPTY_PRESENCE_STATE,
	PRESENCE_DEVICE_KINDS,
	PRESENCE_ONLINE_STATUSES,
	PRESENCE_STATE_SCHEMA_VERSION,
	applyPresenceBroadcast,
	buildPresenceEntry,
	ensurePresenceState,
	normalizeDeviceKind,
	normalizeOnlineStatus,
	removePresence,
} from './state/presence-state';

// COLLAB-004 — EPHEMERAL PRESENCE policy. `projectPresenceForViewer` / `projectSessionPresence` project
// the live presence to a viewer FAIL CLOSED: a participant the viewer may not see is OMITTED entirely (not
// merely hidden), and a cursor/selection hint scoped to a scene the viewer cannot see is STRIPPED, so
// presence never leaks a hidden participant or a hidden scene/widget. An unknown viewer sees nothing; the
// viewer always sees their own presence. `restorePresenceOnReconnect` always returns the EMPTY presence
// (old presence is NEVER replayed as authoritative history — AC2); `assertNoPresenceInOperationLog` proves
// no presence op is durable. Per ADR-014 the live awareness/cursor transport is deferred; pure + fail closed.
export type {
	ParticipantVisibilitySource,
	PresenceProjection,
	PresenceSceneVisibilitySource,
	PresenceWithholdReason,
	ProjectPresenceOptions,
	ProjectedPresenceEntry,
	WithheldPresence,
} from './collab/presence';
export {
	PRESENCE_ENTITY_TYPE,
	assertNoPresenceInOperationLog,
	assertPresenceProjectionIsClean,
	projectPresenceForViewer,
	projectSessionPresence,
	restorePresenceOnReconnect,
} from './collab/presence';

// COLLAB-003 — NEAR-REAL-TIME LIVE SESSION STATE sharing (active scenes, combat, dice, timers, handouts,
// visible map updates). `deliverableSessionUpdates` builds the ordered batch a connected participant may
// RECEIVE, filtered through the COLLAB-009 replication filter so a hidden op NEVER enters their stream
// (filter-before-send, AC1). `deriveLiveSessionStatus` computes live/syncing/stale/reconnecting from the
// pending-update + connection state, fail closed (AC2). `bufferOutOfOrderUpdate` / `drainApplicableUpdates`
// apply session ops IN dependency order — an op delivered before its dependencies is HELD, never applied
// out of order (AC3). `reportLatencyBudget` reports measured p95 delivery + stale-threshold breaches
// against the configured product budget (AC4). Per ADR-014 the live push transport is deferred; pure policy.
export type {
	DrainResult,
	LatencyBudgetReport,
	LiveSessionStatus,
	LiveSessionStatusInput,
	LiveSessionStatusResult,
	SessionLatencyBudget,
} from './collab/session-sync';
export {
	DEFAULT_SESSION_LATENCY_BUDGET,
	LIVE_SESSION_ENTITY_TYPES,
	bufferOutOfOrderUpdate,
	deliverableSessionUpdates,
	deriveLiveSessionStatus,
	drainApplicableUpdates,
	isLiveSessionUpdate,
	percentile,
	reportLatencyBudget,
} from './collab/session-sync';

// AUDIO-004 — content-addressed LOCAL AUDIO ASSET model with metadata, LICENSING notes, TAGS, and a
// source reference. Composes the map-asset content-address algorithm (`hashAssetBytes`/`assetId`). The
// license is a TYPED enum (never free text) so the review gate fails closed: `unknown` is the default for
// an undeclared license and `assetNeedsLicenseReview` flags it BEFORE export. Free-text notes/attribution
// are preserved verbatim (never fabricated). Pure data + pure functions; no DOM/storage/clock.
export type {
	AudioAsset,
	AudioAssetValidationError,
	AudioLicense,
	AudioLicenseKind,
	AudioLicenseReviewReason,
	BuildAudioAssetInput,
} from './state/audio-asset';
export {
	AUDIO_ASSET_ENTITY_TYPE,
	AUDIO_ASSET_SCHEMA_VERSION,
	AUDIO_LICENSE_KINDS,
	DEFAULT_MAX_AUDIO_BYTES,
	NATIVE_AUDIO_MIME_TYPES,
	UNDECLARED_AUDIO_LICENSE,
	assetNeedsLicenseReview,
	buildAudioAsset,
	buildAudioLicense,
	cloneAudioAsset,
	isAudioLicenseKind,
	isNativeAudioMimeType,
	licenseReviewReason,
	normalizeAudioTags,
} from './state/audio-asset';

// AUDIO-009 / AUDIO-010 — the DECLARED AUDIO SOURCE TYPE registry + per-source CACHE/OFFLINE behavior.
// Composes the source-capability-registry pattern: a frozen table of declared source-type descriptors,
// resolving fail-closed to `unsupported` for an unknown provider (no playback state created — AUDIO-009
// AC2). Cache/offline behavior is the AUDIO-010 prerequisite for enabling playback; offline availability
// is resolved fail-closed with NO network retry and NO track substitution. Pure data + pure functions.
export type {
	AudioCacheBehavior,
	AudioOfflineAvailability,
	AudioPlaybackAvailability,
	AudioPlaybackRequest,
	AudioSource,
	AudioSourceClassification,
	AudioSourceConfigResult,
	AudioSourceRejectionReason,
	AudioSourceType,
	AudioSourceTypeCapability,
	ConfigureAudioSourceInput,
} from './state/audio-source';
export {
	AUDIO_CACHE_BEHAVIORS,
	AUDIO_SOURCE_ENTITY_TYPE,
	AUDIO_SOURCE_SCHEMA_VERSION,
	AUDIO_SOURCE_TYPE_CAPABILITIES,
	BUNDLED_PRESET_SOURCE_CAPABILITY,
	LOCAL_FILE_SOURCE_CAPABILITY,
	REGISTERED_AUDIO_SOURCE_TYPES,
	SUPPORTED_AUDIO_SOURCE_TYPES,
	WEB_STREAM_SOURCE_CAPABILITY,
	capabilityForAudioSourceType,
	classifyAudioSource,
	configureAudioSource,
	isSupportedAudioSourceType,
	listAudioSourceTypeCapabilities,
	resolveAudioPlaybackAvailability,
} from './state/audio-source';

// AUDIO-004/005/009/010 — the durable AUDIO VaultState slice (asset library + declared source registry +
// automation rules). A bounded state document modeled like maps/encounters, with fail-closed hydration: an
// undeclared asset license stays `unknown`, a source with undeclared cache behavior stays playback-disabled,
// and an automation rule with an undeclared trigger/action is dropped. Playback state is NOT here —
// currently-playing audio is SessionState (Contract 4 Widget State Ownership).
export type { AudioState } from './state/audio-state';
export {
	AUDIO_STATE_SCHEMA_VERSION,
	EMPTY_AUDIO_STATE,
	audioAssetById,
	audioAssociationById,
	audioAutomationRuleById,
	audioSourceById,
	ensureAudioState,
} from './state/audio-state';

// MCP-001 / MCP-003 / MCP-009 / MCP-011 — the durable MCP IDENTITY, POLICY, and STAGED-WRITES VaultState
// slice: the vault-wide MASTER ENABLE switch (MCP-001 — off by default, fail-closed on hydration), agent →
// scoped actor bindings (MCP-011), per-agent policy modes + tool allowlists + audit visibility (MCP-009),
// pending staged proposals (MCP-003), the append-only write audit trail (MCP-011 AC2), and the vault
// default posture. Fail-closed hydration: MCP restores OFF; an unknown mode/status collapses to the most
// restrictive.
export type {
	McpAgentBinding,
	McpAgentPolicy,
	McpAuditEntry,
	McpPolicyMode,
	McpPolicyState,
	McpProposalStatus,
	McpStagedProposal,
	McpVaultDefaultMode,
	PersistedMcpPolicyState,
} from './state/mcp-policy';
export {
	EMPTY_MCP_POLICY_STATE,
	MCP_POLICY_ENTITY_TYPE,
	MCP_POLICY_MODES,
	MCP_POLICY_STATE_SCHEMA_VERSION,
	ensureMcpPolicyState,
	isMcpEnabled,
	isMcpPolicyMode,
	mcpBindingByAgentId,
	mcpPolicyByAgentId,
	mcpProposalById,
} from './state/mcp-policy';

// AUDIO-001 — SCENE / MAP / MAP-LAYER AUDIO ASSOCIATION: a DM-authored binding of an ambient track,
// playlist, or atmosphere preset to a Scene, map, or single map layer. On activation the deterministic
// resolver computes which cues are AVAILABLE to the audio widget, COMPOSING the EXISTING source (AUDIO-009),
// license (AUDIO-004), and offline (AUDIO-010) gates: a missing-on-device asset surfaces the MISSING-ASSET
// state (AUDIO-001 AC2), an unlicensed/out-of-scope cue is blocked (no silent playback). DM-only config;
// the GUI dispatches the EXISTING `session.audio.play` command for a cleared preset (no second playback path).
export type {
	AudioAssociation,
	AudioAssociationActivation,
	AudioAssociationRejectionReason,
	AudioAssociationResult,
	AudioAssociationTargetKind,
	AudioPresetAvailability,
	AudioPresetKind,
	BuildAudioAssociationInput,
	ResolvedAudioPreset,
} from './state/audio-association';
export {
	AUDIO_ASSOCIATION_ENTITY_TYPE,
	AUDIO_ASSOCIATION_SCHEMA_VERSION,
	AUDIO_ASSOCIATION_TARGET_KINDS,
	AUDIO_PRESET_KINDS,
	buildAudioAssociation,
	cloneAudioAssociation,
	isAudioAssociationTargetKind,
	isAudioPresetKind,
	resolveAudioAssociations,
} from './state/audio-association';

// AUDIO-001 — THE actor-filtered association read model. The DM lists the configured associations and, on a
// Scene/map/layer activation, resolves the presets available to the audio widget (each with its computed
// device availability); a non-DM gets EMPTY (associations are DM-only — fail closed, no leak).
export type { AudioAssociationView } from './queries/audio-association-query';
export {
	listAudioAssociationsForActor,
	resolveActivatedSceneAudioForActor,
} from './queries/audio-association-query';

// AUDIO-005 — ATMOSPHERE AUTOMATION: rule/trigger-driven audio behavior. The DM maps a session event
// (combat start / map reveal / Scene activation / handout delivery) to a declared audio command. The
// deterministic resolver composes the EXISTING source (AUDIO-009), offline (AUDIO-010), and license
// (AUDIO-004) gates: a blocked rule is a flagged NO-OP with a non-leaking diagnostic, never a silent
// unlicensed/out-of-scope playback (AUDIO-005 AC2). Pure data + pure functions; the GUI dispatches the
// resolved command request through the Processing Core.
export type {
	AudioAutomationAction,
	AudioAutomationBlockReason,
	AudioAutomationCommandRequest,
	AudioAutomationOutcome,
	AudioAutomationResolution,
	AudioAutomationRule,
	AudioAutomationRuleRejectionReason,
	AudioAutomationRuleResult,
	AudioAutomationTrigger,
	AudioAutomationTriggerKind,
	BuildAudioAutomationRuleInput,
} from './state/audio-automation';
export {
	AUDIO_AUTOMATION_ACTIONS,
	AUDIO_AUTOMATION_ENTITY_TYPE,
	AUDIO_AUTOMATION_SCHEMA_VERSION,
	AUDIO_AUTOMATION_TRIGGER_KINDS,
	actionStartsPlayback,
	buildAudioAutomationRule,
	cloneAudioAutomationRule,
	evaluateAudioAutomationRule,
	isAudioAutomationAction,
	isAudioAutomationTriggerKind,
	resolveAudioAutomation,
} from './state/audio-automation';

// AUDIO-011 — FAIL-CLOSED validation of a Scene AUDIO PACKAGE before import/export commit. Reports missing
// assets, missing licensing metadata (reusing the AUDIO-004 review gate), unsupported streams (the
// AUDIO-009 rule), and device-local output routes BEFORE commit; builds the per-asset portability manifest
// (source + license + content hash + portability) the AUDIO-011 AC2 requires. `committable` is the
// fail-closed commit gate (no blocking findings). Pure data + pure functions.
export type {
	AudioAssetPortability,
	AudioPackageDirection,
	AudioPackageFinding,
	AudioPackageFindingKind,
	AudioPackageFindingSeverity,
	AudioPackageManifestEntry,
	AudioPackagePreset,
	AudioPackageValidationReport,
	ValidateAudioPackageInput,
} from './state/audio-package';
export {
	AUDIO_PACKAGE_SCHEMA_VERSION,
	assetPortability,
	validateAudioPackage,
} from './state/audio-package';

// AUDIO-004/009/010 — THE single actor-filtered AUDIO LIBRARY read model. The DM sees each asset with its
// computed license-review flag and each source with its computed classification + offline availability; a
// non-DM gets EMPTY lists (audio config is DM-only — fail closed, no leak).
export type { AudioAssetView } from './queries/audio-library-query';
export {
	listAudioAssetsForActor,
	listAudioAssetsNeedingReview,
	listAudioAutomationRulesForActor,
	listAudioSourceClassificationsForActor,
	resolveAudioAutomationForActor,
	resolveAudioPlaybackForActor,
} from './queries/audio-library-query';

// AUDIO-006/007/008/012/013 — the PLATFORM + PLAYER DEGRADATION policy. Composes the AUDIO-004 license +
// AUDIO-009/010 offline gates and adds the PLATFORM (autoplay/consent/background/routing) and PLAYER
// (consent/mute/volume/safety) axes into ONE deterministic per-participant delivery decision. Fail closed:
// when consent is absent, the platform can't play, the track is offline/unlicensed/out-of-scope, or
// capability is unknown → a clearly-signalled non-playing state (never autoplay where forbidden, never an
// indefinite retry). Device-local preferences never mutate DM-authored session audio state. Pure +
// deterministic (no DOM, navigator, clock, or network) — identical inputs ⇒ identical decisions.
export type {
	AudioAnnounceableChange,
	AudioConsentState,
	AudioDeliveryDecision,
	AudioDeliveryDisposition,
	AudioDeliveryRequest,
	AudioMotionState,
	AudioOutputRouting,
	AudioParticipantPreferences,
	AudioPlatformCapability,
	AudioSafetyState,
} from './state/audio-degradation';
export {
	AUDIO_CONSENT_STATES,
	AUDIO_DEGRADATION_SCHEMA_VERSION,
	DEFAULT_AUDIO_FAILURE_LIMIT,
	DEFAULT_AUDIO_PARTICIPANT_PREFERENCES,
	DEFAULT_AUDIO_SAFETY_STATE,
	UNKNOWN_AUDIO_PLATFORM_CAPABILITY,
	isAudioConsentState,
	isAudioSounding,
	normalizeAudioParticipantPreferences,
	normalizeAudioPlatformCapability,
	normalizeAudioSafetyState,
	resolveAudioDelivery,
	resolveAudioMotionState,
	resolveAudioOutputRouting,
	shouldAnnounceAudioChange,
} from './state/audio-degradation';

// AUDIO-006/007/012/013 — the ACTOR-FILTERED audio-delivery read model. The DM inspecting session status
// sees every participant's NON-LEAKING delivery state (a participant who can't play audio is visible —
// AUDIO-006 AC2 — without exposing device secrets); a participant sees only their OWN resolved decision. A
// non-DM gets an empty roster (the DM session-status surface is DM-only — fail closed, no leak).
export type {
	AudioActiveTrack,
	AudioParticipantDeliveryView,
	AudioParticipantDeviceInput,
} from './queries/audio-delivery-query';
export {
	listAudioDeliveryForDm,
	resolveAudioDeliveryForActor,
} from './queries/audio-delivery-query';

// AUDIO-002 / AUDIO-003 — the SESSION-OWNED currently-playing audio state (Contract 4 Widget State
// Ownership). The DM controls playback (play/pause/stop/volume/crossfade) and projects the active track to
// players (an offline participant is QUEUED — AUDIO-003 AC3); the slice is durable session state, syncs to
// collaborators, and survives audio-widget removal (only a stop clears it — AUDIO-003 AC2).
export type {
	SessionAudioDelivery,
	SessionAudioDeliveryStatus,
	SessionAudioState,
	SessionAudioStatus,
	SessionAudioTrack,
} from './state/session-audio';
export {
	EMPTY_SESSION_AUDIO_STATE,
	SESSION_AUDIO_ENTITY_TYPE,
	SESSION_AUDIO_SCHEMA_VERSION,
	SESSION_AUDIO_STATUSES,
	cloneSessionAudioState,
	ensureSessionAudioState,
	isSessionAudioPlaying,
	isSessionAudioStatus,
} from './state/session-audio';

// AUDIO-002 / AUDIO-003 — THE actor-filtered SESSION AUDIO read model that COMPOSES every prior AUDIO model:
// the DM sees the authoritative track + the per-participant delivery roster (AUDIO-006 AC2) + the offline
// delivery queue (AUDIO-003 AC3); a participant sees ONLY the player-safe track + their OWN resolved
// delivery/degradation decision (AUDIO-006/007/012/013). Fail closed: DM-only audio config never leaks.
export type {
	SessionAudioDeliveryView,
	SessionAudioDmView,
	SessionAudioParticipantView,
	SessionAudioTrackView,
	SessionAudioView,
} from './queries/session-audio-query';
export { getSessionAudioView } from './queries/session-audio-query';

// MCP-004 / MCP-005 — the FAIL-CLOSED MCP TOOL POLICY LAYER. An MCP agent acts through a SCOPED vault
// actor and is filtered + permission-gated EXACTLY like a human actor: every READ tool composes an
// existing actor-filtered query (visibility/redaction enforced by the data layer before the agent sees
// anything), and every WRITE tool dispatches an existing authorized command (inheriting validation,
// authority checks, op-logging, and visibility). The tool REGISTRY is the closed allowlist of what an
// agent can do; the DISPATCHER enforces, in order and fail closed, unknown tool / unknown-or-under-
// scoped actor / schema-invalid input → deny, then routes. There is no privileged MCP side-channel.
export type {
	McpBaselineToolId,
	McpBoundCommandType,
	McpToolDefinition,
	McpToolKind,
	McpToolRegistry,
	McpWriteRisk,
} from './mcp/tool-registry';
export {
	MCP_BASELINE_TOOL_IDS,
	createBaselineMcpToolRegistry,
	createMcpToolRegistry,
	mcpBundleInputSchema,
	mcpDiceRollInputSchema,
	mcpEmptyInputSchema,
	mcpEntityIdInputSchema,
	mcpGraphContextInputSchema,
	mcpNoteCreateInputSchema,
	mcpNoteSearchInputSchema,
	mcpSessionPrepInputSchema,
} from './mcp/tool-registry';
export type {
	McpDenyReason,
	McpToolInvocation,
	McpToolResult,
} from './mcp/tool-dispatch';
export { invokeMcpTool } from './mcp/tool-dispatch';

// MCP-011 — the FAIL-CLOSED agent-connection → scoped-vault-actor identity resolution. Before any tool can
// read or stage data, an agent connection must resolve to an authenticated actor + role + policy + audit
// identity; an unmapped agent or a binding to an unregistered actor is denied here, BEFORE any core query.
export type {
	McpIdentityDenyReason,
	McpIdentityResolution,
	McpResolvedIdentity,
} from './mcp/identity';
export { resolveAgentIdentity, resolvePolicyMode } from './mcp/identity';

// MCP-009 / MCP-003 — the PURE POLICY DECISION composing the agent identity + the tool's declared write-risk
// into a fail-closed verdict: disabled → deny everything; not allowlisted → deny; read → allow (filtered by
// the data layer); write → STAGE (strict_review/balanced) or DIRECT (trusted_direct, allowlisted, still
// validated + audited). It never confers authority — only stage vs direct vs deny.
export type { McpPolicyDecision, McpPolicyDenyReason } from './mcp/policy';
export { decidePolicy, isToolAllowlisted } from './mcp/policy';

// MCP-003 / MCP-009 / MCP-011 — THE agent-facing entry point that composes identity + policy + staged-write
// onto the prior epic's tool dispatch. Resolves the connection to a scoped actor, applies the policy mode +
// allowlist, then routes: a read composes the actor-filtered query; a `trusted_direct` allowlisted write
// dispatches the bound command (still validated + audited); any other write is captured as a PENDING
// proposal a human must approve. Returns the result envelope + next state; never auto-commits a staged write.
export type {
	McpAgentDenyReason,
	McpAgentInvocation,
	McpAgentInvokeOutput,
	McpAgentToolResult,
} from './mcp/agent-dispatch';
export { invokeMcpToolAsAgent } from './mcp/agent-dispatch';

// MCP-010 — the STABLE, VERSIONED, SCHEMA-VALIDATED MCP/AI RESPONSE CONTRACT. Every tool already returns
// a structured envelope (`McpToolResult` / `McpAgentToolResult`); this FORMALIZES the OUTWARD shape those
// project into before leaving the core: one stable envelope with id/status/summary/data/warnings/citations/
// remediation (warnings SEPARATE from data), errors STRUCTURED + NON-LEAKING. `certifyMcpResponse` is the
// fail-closed gate — a malformed or leaky envelope (validated against the Zod contract + the shared
// redaction leak guard) is REPLACED with a safe contract-conformant error, never passed through. Pure +
// deterministic + versioned (unsupported future versions fail closed). Per ADR-014 the transport is deferred.
export type {
	McpResponseCertification,
	McpResponseCitation,
	McpResponseEnvelope,
	McpResponseError,
	McpResponseRemediation,
	McpResponseStatus,
	McpResponseContractViolation,
	McpResponseWarning,
} from './mcp/response-contract';
export {
	MCP_RESPONSE_CONTRACT_ERROR_CODE,
	MCP_RESPONSE_CONTRACT_VERSION,
	MCP_RESPONSE_ENVELOPE_SCHEMA,
	MCP_RESPONSE_STATUSES,
	buildCertifiedMcpAgentResponse,
	buildCertifiedMcpResponse,
	certifyMcpResponse,
	isConformantMcpResponse,
	toMcpAgentResponseEnvelope,
	toMcpResponseEnvelope,
} from './mcp/response-contract';

// MCP-007 / MCP-008 — THE AI-BOUNDARY CONTRACT: the architectural rule, as enforceable Processing-Core code,
// that AI is OPTIONAL and ANNOTATIVE — never load-bearing, never authoritative, never a mutation path, and
// never a visibility bypass. It FORMALIZES the established `SemanticAssist` / `HealthAiExplainer` pattern
// into one reusable contract: a capability-detected (MCP-008) optional annotator confined to the permitted
// annotative roles (MCP-007: creative text / narrative suggestion / named-entity extraction / explanation),
// producing a LABELLED, NON-AUTHORITATIVE, SEPARATED annotation that is dropped fail-closed when AI is
// off/absent/unavailable — so the deterministic content always stands alone and no AI call is load-bearing.
export type {
	AiAnnotation,
	AiAnnotationResult,
	AiAnnotationStatus,
	AiAnnotativeRole,
	AiAnnotator,
	AiCapability,
	AiCapabilityState,
	AiForbiddenRole,
} from './mcp/ai-boundary';
export {
	AI_ABSENT_CAPABILITY,
	AI_ANNOTATIVE_ROLES,
	AI_FORBIDDEN_ROLES,
	applyAiAnnotation,
	isAiAnnotativeRole,
	isAiCapabilityRunnable,
	isAiForbiddenRole,
} from './mcp/ai-boundary';

// MCP-006 / MCP-013 — THE SEMANTIC BUNDLE TOOLS: bounded, source-cited, CALENDAR-aware context packages for
// session prep, recap, continuity, open threads, coverage gaps, and campaign health, COMPOSED entirely from
// the existing deterministic, actor-filtered reads (the prep/recap digest, graph health/coverage, and the
// SES-012/GRAPH-009 calendar reads). A bundle adds no new index or mutation/visibility path: a `dm-only`
// source can never enter it, and a NON-DM actor gets a generalized, finding-free, exact-date-free bundle
// (MCP-006 AC1 / MCP-013 AC2). Semantic compression bounds each section to an explicit budget, choosing
// summaries over raw full-vault content (MCP-006 AC2). The optional AI annotation rides the AI-boundary
// contract above, held SEPARATE and dropped fail-closed — the deterministic bundle is complete with AI off.
export type {
	BundleAiStatus,
	BundleCalendarContext,
	BundleCitation,
	BundleCompression,
	BundleContent,
	BundleCountBand,
	BundleDatedEvent,
	SemanticBundle,
	SemanticBundleInputs,
	SemanticBundleKind,
	SemanticBundleOptions,
} from './mcp/semantic-bundles';
export {
	DEFAULT_BUNDLE_ITEM_BUDGET,
	SEMANTIC_BUNDLE_KINDS,
	buildSemanticBundle,
} from './mcp/semantic-bundles';

// MCP-012 — the EXPLICIT, FAIL-CLOSED MCP FILESYSTEM / PLATFORM-SERVICE EXCEPTION ALLOWLIST. The few
// narrow filesystem operations the future MCP sidecar may perform are DECLARED (not inferred from broad
// runtime access): every exception is contained to a root, size-bounded, schema-validated, and audited.
// `gateMcpFsOperation` certifies an op is safe BEFORE any I/O; an op outside the allowlist, an oversized
// payload, a schema-invalid request, or a path that escapes the containment root all fail closed.
export type {
	McpFsDenyReason,
	McpFsExceptionDefinition,
	McpFsExceptionRegistry,
	McpFsGateResult,
	McpFsOperationId,
	McpFsRequest,
} from './mcp/fs-allowlist';
export {
	DEFAULT_MCP_STAGED_PREVIEW_MAX_BYTES,
	MCP_FS_OPERATION_IDS,
	createBaselineMcpFsExceptionRegistry,
	createMcpFsExceptionRegistry,
	gateMcpFsOperation,
	isMcpFsOperationId,
	isPathContained,
} from './mcp/fs-allowlist';
