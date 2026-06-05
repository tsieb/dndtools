/**
 * PLAT-005: type-only contract for the Android (Capacitor) shell's platform services.
 *
 * Declares the typed interfaces the Android shell would expose for storage, file access,
 * keyboard adaptation, and share/import. INTENTIONALLY type-only (PLAT-011): the real Capacitor
 * native bridge is out of first-slice scope (ADR-014). Feature logic receives a platform-service
 * RESULT, never raw native API access (PLAT-005 AC1) — these interfaces define that result shape.
 * No native API is exposed to feature components, so the boundary lint stays green.
 */

/** Result of importing a file through the native share/import flow. */
export interface AndroidFileImportResult {
	/** A stable handle the feature layer uses; never a raw native URI (Contract 1). */
	readonly importId: string;
	readonly name: string;
	readonly mimeType: string;
	readonly sizeBytes: number;
}

/** Capacitor filesystem storage for the vault. */
export interface AndroidFilesystemService {
	readVaultFile(relativePath: string): Promise<Uint8Array>;
	writeVaultFile(relativePath: string, contents: Uint8Array): Promise<void>;
}

/** Native share / import sheet. */
export interface AndroidShareImportService {
	/** Import a file the user picked from the native share sheet. */
	importFile(): Promise<AndroidFileImportResult | null>;
	/** Share content out through the native sheet. */
	shareContent(input: { readonly title: string; readonly text?: string }): Promise<void>;
}

/**
 * Virtual-keyboard adaptation. The shell reports keyboard inset changes so the GUI can keep the
 * active input visible and controls reachable (PLAT-005 AC2). Feature components read the inset
 * facts; they never poll the native keyboard API directly.
 */
export interface AndroidKeyboardInsets {
	/** Height in CSS pixels the keyboard occupies; 0 when hidden. */
	readonly bottomInset: number;
	readonly visible: boolean;
}

export interface AndroidKeyboardService {
	current(): AndroidKeyboardInsets;
	subscribe(listener: (insets: AndroidKeyboardInsets) => void): () => void;
}

/** The aggregate Android platform-service surface a Capacitor shell would implement. */
export interface AndroidPlatformServices {
	readonly filesystem: AndroidFilesystemService;
	readonly shareImport: AndroidShareImportService;
	readonly keyboard: AndroidKeyboardService;
}
