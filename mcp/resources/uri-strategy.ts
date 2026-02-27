export const RESOURCE_URI_VERSION = 'v1';

export const RESOURCE_URIS = {
	noteTemplate: `dndtools://${RESOURCE_URI_VERSION}/notes/{id}`,
	vaultStructure: `dndtools://${RESOURCE_URI_VERSION}/vault/structure`,
	vaultTags: `dndtools://${RESOURCE_URI_VERSION}/vault/tags`,
	resourceCatalog: `dndtools://${RESOURCE_URI_VERSION}/resources/catalog`,
} as const;

export const LEGACY_RESOURCE_URIS = {
	noteTemplate: 'note://{id}',
	vaultStructure: 'vault://structure',
	vaultTags: 'vault://tags',
} as const;

export interface ResourceDiscoverabilityEntry {
	id: 'note' | 'vault-structure' | 'vault-tags' | 'resource-catalog';
	title: string;
	description: string;
	canonicalUri: string;
	legacyUris: string[];
	mimeType: string;
	stability: 'stable';
	useCases: string[];
}

export const RESOURCE_DISCOVERABILITY: ResourceDiscoverabilityEntry[] = [
	{
		id: 'note',
		title: 'Single Note Content',
		description: 'Read markdown content for one note id.',
		canonicalUri: RESOURCE_URIS.noteTemplate,
		legacyUris: [LEGACY_RESOURCE_URIS.noteTemplate],
		mimeType: 'text/markdown',
		stability: 'stable',
		useCases: ['note inspection', 'prompt grounding', 'context retrieval'],
	},
	{
		id: 'vault-structure',
		title: 'Vault Folder Structure',
		description: 'Read note counts by folder path for active notes.',
		canonicalUri: RESOURCE_URIS.vaultStructure,
		legacyUris: [LEGACY_RESOURCE_URIS.vaultStructure],
		mimeType: 'application/json',
		stability: 'stable',
		useCases: ['folder discovery', 'campaign topology overview'],
	},
	{
		id: 'vault-tags',
		title: 'Vault Tag Distribution',
		description: 'Read normalized tag counts across active notes.',
		canonicalUri: RESOURCE_URIS.vaultTags,
		legacyUris: [LEGACY_RESOURCE_URIS.vaultTags],
		mimeType: 'application/json',
		stability: 'stable',
		useCases: ['taxonomy analysis', 'prompt scoping'],
	},
	{
		id: 'resource-catalog',
		title: 'Resource Catalog',
		description: 'Discover canonical resource URIs, aliases, and usage metadata.',
		canonicalUri: RESOURCE_URIS.resourceCatalog,
		legacyUris: [],
		mimeType: 'application/json',
		stability: 'stable',
		useCases: ['resource discovery', 'URI migration', 'agent bootstrapping'],
	},
];
