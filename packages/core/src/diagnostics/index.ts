export {
	REDACTED_PATH,
	REDACTED_SECRET,
	containsSensitiveData,
	redactPaths,
	redactSecretsInText,
	redactValue,
} from './redaction';

export type {
	CapabilityAvailability,
	CapabilityStatusView,
	DiagnosticsContextInput,
	PlatformCapabilityInput,
	SchemaHealthInput,
	SyncSourceState,
	SyncSourceStatusInput,
	SyncSourceStatusView,
	SystemHealthLevel,
} from './health';
export { deriveHealthLevel, deriveLastSyncAt, toSyncSourceStatusView } from './health';

export type { ErrorTaxonomyCategory, ErrorTaxonomyCounts, RawErrorRecord } from './error-taxonomy';
export { ERROR_TAXONOMY_CATEGORIES, countErrorsByCategory } from './error-taxonomy';

export type { RawStorageUsageEntry, StorageCategory, StorageUsageView } from './storage-usage';
export { STORAGE_CATEGORIES, summarizeStorageUsage } from './storage-usage';

export type {
	DiagnosticsDenialReason,
	DmDiagnosticsResult,
	DmDiagnosticsView,
	SchemaHealthView,
	SupportBundle,
	SupportBundleOptions,
	SupportBundleResult,
} from './dm-diagnostics';
export {
	DIAGNOSTICS_ENTITY_ID,
	DIAGNOSTICS_ENTITY_TYPE,
	DIAGNOSTIC_GRANT_CAPABILITY,
	actorCanViewDmDiagnostics,
	exportSupportBundle,
	getDmDiagnostics,
} from './dm-diagnostics';

export type {
	ParticipantCapabilityStatus,
	ParticipantConnectionState,
	ParticipantDeliveryState,
	ParticipantSafeStatusSummary,
	ParticipantStatusInput,
	ParticipantStatusResult,
	ParticipantStatusView,
	ParticipantSyncState,
} from './participant-status';
export { getParticipantStatus, toParticipantSafeSummary } from './participant-status';

/* ---- RC-CLD-1.4 — opt-in product analytics taxonomy (content-free) ---------------------------- */
export type {
	ProductAnalyticsEvent,
	ProductAnalyticsEventName,
	ProductAnalyticsPayload,
	ProductAnalyticsProps,
	TelemetryConsent,
	TelemetryPlatform,
} from './product-analytics';
export {
	PRODUCT_ANALYTICS_EVENTS,
	PRODUCT_ANALYTICS_EVENT_NAMES,
	PRODUCT_ANALYTICS_MAX_EVENTS,
	PRODUCT_ANALYTICS_PAYLOAD_VERSION,
	buildProductAnalyticsEvent,
	isTelemetryConsent,
	parseProductAnalyticsPayload,
	telemetryConsentAllows,
	toAnalyticsAppVersion,
} from './product-analytics';
