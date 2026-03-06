import path from 'node:path';

export type DesktopIntent =
	| { kind: 'note'; noteId: string }
	| { kind: 'session'; boardId: string }
	| { kind: 'file'; filePath: string };

function sanitizeArg(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1).trim();
	}
	return trimmed;
}

export function parseProtocolIntent(rawUrl: string): DesktopIntent | null {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'dndtools:') return null;

	const resource = parsed.hostname.toLowerCase();
	const target = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
	if (!target) return null;

	if (resource === 'note') {
		return { kind: 'note', noteId: target };
	}
	if (resource === 'session') {
		return { kind: 'session', boardId: target };
	}
	return null;
}

export function parseDesktopIntentArg(rawArg: string): DesktopIntent | null {
	const arg = sanitizeArg(rawArg);
	if (!arg) return null;

	if (arg.toLowerCase().startsWith('dndtools://')) {
		return parseProtocolIntent(arg);
	}

	if (/\.md$/i.test(arg)) {
		return { kind: 'file', filePath: path.resolve(arg) };
	}

	return null;
}

export function isVaultDirectoryArg(rawArg: string): boolean {
	const arg = sanitizeArg(rawArg);
	if (!arg || arg.startsWith('-')) return false;
	return parseDesktopIntentArg(arg) === null;
}
