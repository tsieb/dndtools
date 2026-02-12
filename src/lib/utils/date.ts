/** Return current time as ISO 8601 string */
export function nowISO(): string {
	return new Date().toISOString();
}

/** Format an ISO date string as a human-readable date */
export function formatDate(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

/** Format an ISO date string as relative time (e.g. "2 hours ago") */
export function formatRelativeDate(iso: string): string {
	const date = new Date(iso);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 5) return 'just now';
	if (diffSec < 60) return `${diffSec}s ago`;
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;
	if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;

	return formatDate(iso);
}
