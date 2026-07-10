import { useEffect, useState } from 'react';
import { getAssetBytes } from './storage/assetStore';

/**
 * The single seam through which UI turns a content-addressed asset id into something the DOM
 * can render or play (`<img src>`, `<image href>`, `<audio src>`). Object URLs are revoked on
 * release so multi-megabyte blobs never leak across navigation.
 */

export interface AssetObjectUrlHandle {
	url: string;
	revoke: () => void;
}

/**
 * Imperative resolver for non-React callers (e.g. the audio playback driver). Returns null when
 * the bytes are absent — callers render their honest missing-bytes state, never a crash.
 */
export async function createAssetObjectUrl(
	assetId: string,
): Promise<AssetObjectUrlHandle | null> {
	const blob = await getAssetBytes(assetId);
	if (!blob) return null;
	const url = URL.createObjectURL(blob);
	let revoked = false;
	return {
		url,
		revoke: () => {
			if (!revoked) {
				revoked = true;
				URL.revokeObjectURL(url);
			}
		},
	};
}

/**
 * Resolve an asset id to an object URL for rendering. Returns null while loading, when the id
 * is absent, or when no bytes exist for the id (the caller's empty/missing state). The URL is
 * revoked automatically when the id changes or the component unmounts.
 */
export function useAssetObjectUrl(assetId: string | null | undefined): string | null {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		if (!assetId) {
			setUrl(null);
			return;
		}
		let cancelled = false;
		let handle: AssetObjectUrlHandle | null = null;
		void createAssetObjectUrl(assetId).then((resolved) => {
			if (cancelled) {
				resolved?.revoke();
				return;
			}
			handle = resolved;
			setUrl(resolved?.url ?? null);
		});
		return () => {
			cancelled = true;
			handle?.revoke();
			setUrl(null);
		};
	}, [assetId]);
	return url;
}
