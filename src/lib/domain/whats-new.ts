import changelogMarkdown from '../../../CHANGELOG.md?raw';

export interface WhatsNewLink {
	label: string;
	href: string;
}

export interface WhatsNewChange {
	text: string;
	links: WhatsNewLink[];
}

export interface WhatsNewRelease {
	version: string;
	title: string;
	changes: WhatsNewChange[];
}

function normalizeVersion(value: string): string {
	return value.trim().replace(/^v/i, '');
}

function parseLinks(line: string): WhatsNewLink[] {
	const links: WhatsNewLink[] = [];
	const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
	let match: RegExpExecArray | null = pattern.exec(line);
	while (match) {
		const label = match[1]?.trim() ?? '';
		const href = match[2]?.trim() ?? '';
		if (label && href) {
			links.push({ label, href });
		}
		match = pattern.exec(line);
	}
	return links;
}

function stripMarkdownLinks(line: string): string {
	return line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').trim();
}

export function parseChangelog(markdown: string): WhatsNewRelease[] {
	const releases: WhatsNewRelease[] = [];
	let current: WhatsNewRelease | null = null;

	for (const rawLine of markdown.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;

		const headingMatch = /^##\s+\[?([^\]\s]+)\]?(?:\s*-\s*(.+))?$/i.exec(line);
		if (headingMatch) {
			if (current) releases.push(current);
			const version = normalizeVersion(headingMatch[1] ?? '');
			const suffix = headingMatch[2]?.trim();
			current = {
				version,
				title: suffix ? `${version} - ${suffix}` : version,
				changes: [],
			};
			continue;
		}

		if (!current) continue;
		if (!line.startsWith('- ')) continue;
		const body = line.slice(2).trim();
		if (!body) continue;
		current.changes.push({
			text: stripMarkdownLinks(body),
			links: parseLinks(body),
		});
	}

	if (current) releases.push(current);
	return releases;
}

export const WHATS_NEW_RELEASES = parseChangelog(changelogMarkdown);

export function getWhatsNewReleaseForVersion(version: string): WhatsNewRelease | null {
	const normalized = normalizeVersion(version);
	return WHATS_NEW_RELEASES.find((release) => release.version === normalized) ?? null;
}
