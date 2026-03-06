export type SearchScopeKind = 'all' | 'folder' | 'type';

export interface SearchScope {
	kind: SearchScopeKind;
	value: string | null;
}

export interface SearchScopeTarget {
	folder: string;
	type: string | null;
}

export const DEFAULT_SEARCH_SCOPE: SearchScope = {
	kind: 'all',
	value: null,
};

function normalizeFolder(value: string): string | null {
	const normalized = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
	if (!normalized) return null;
	return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeType(value: string): string | null {
	const normalized = value.trim().toLowerCase();
	return normalized.length > 0 ? normalized : null;
}

export function normalizeSearchScope(input: Partial<SearchScope> | null | undefined): SearchScope {
	const kind = input?.kind;
	const rawValue = input?.value ?? '';
	if (kind !== 'folder' && kind !== 'type') {
		return { ...DEFAULT_SEARCH_SCOPE };
	}

	if (kind === 'folder') {
		const normalized = normalizeFolder(rawValue);
		if (!normalized) return { ...DEFAULT_SEARCH_SCOPE };
		return { kind: 'folder', value: normalized };
	}

	const normalized = normalizeType(rawValue);
	if (!normalized) return { ...DEFAULT_SEARCH_SCOPE };
	return { kind: 'type', value: normalized };
}

export function parseSearchScopeFromParams(params: URLSearchParams): SearchScope {
	const rawKind = params.get('scope');
	const rawValue = params.get('scopeValue');
	if (rawKind !== 'folder' && rawKind !== 'type') {
		return { ...DEFAULT_SEARCH_SCOPE };
	}
	return normalizeSearchScope({ kind: rawKind, value: rawValue });
}

export function writeSearchScopeToParams(
	params: URLSearchParams,
	scope: SearchScope,
): URLSearchParams {
	const normalized = normalizeSearchScope(scope);
	if (normalized.kind === 'all') {
		params.delete('scope');
		params.delete('scopeValue');
		return params;
	}
	params.set('scope', normalized.kind);
	params.set('scopeValue', normalized.value ?? '');
	return params;
}

function scopeOperator(scope: SearchScope): string {
	if (scope.kind === 'folder' && scope.value) {
		return `folder:${scope.value}`;
	}
	if (scope.kind === 'type' && scope.value) {
		return `type:${scope.value}`;
	}
	return '';
}

export function applySearchScopeToQuery(query: string, scope: SearchScope): string {
	const normalizedQuery = query.trim();
	const operator = scopeOperator(scope);
	if (!operator) return normalizedQuery;
	if (!normalizedQuery) return operator;
	return `${operator} ${normalizedQuery}`;
}

export function matchesSearchScope(target: SearchScopeTarget, scope: SearchScope): boolean {
	if (scope.kind === 'all') return true;
	if (scope.kind === 'folder') {
		if (!scope.value) return true;
		const folder = target.folder.toLowerCase();
		const expected = scope.value.toLowerCase();
		return folder === expected || folder.startsWith(`${expected}/`);
	}
	if (!scope.value) return true;
	return (target.type ?? '').toLowerCase() === scope.value.toLowerCase();
}

export function describeSearchScope(scope: SearchScope): string {
	if (scope.kind === 'folder' && scope.value) {
		return `Searching in ${scope.value}`;
	}
	if (scope.kind === 'type' && scope.value) {
		return `Searching ${scope.value.toUpperCase()}s only`;
	}
	return 'Searching all notes';
}
