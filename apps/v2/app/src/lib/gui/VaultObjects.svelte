<script lang="ts">
	import {
		actorCanAuthorContent,
		detectBrokenLinksForActor,
		getContentItemsForActor,
		listVaultObjectSchemas,
		validateObjectFrontmatter,
		vaultObjectSchema,
		type VaultObjectSubtype,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CONTENT-005 / CONTENT-006 / CONTENT-013 — STRUCTURED VAULT OBJECTS + WIKILINK LIFECYCLE.
	//
	// CONTENT-013: the DM browses the typed SUBTYPE SCHEMA REGISTRY (the ten initial v2 subtypes) — Scene is
	// intentionally absent (it stays in SceneState, Contract 4).
	// CONTENT-005: the DM creates a note-backed structured object; its frontmatter is SCHEMA-VALIDATED in the
	// Processing Core BEFORE the durable write, so an invalid object never commits (fail closed). The
	// structured fields and the markdown body stay in sync per the core's deterministic rule.
	// CONTENT-006: the DM RENAMES a wikilink target (propagating the rename to referring notes) and REPAIRS a
	// broken wikilink, both actor-filtered + fail-closed (never a destructive offline rewrite).
	//
	// The GUI renders computed core models and dispatches command intents; it never touches storage (Contract
	// 1). Which authoring affordances appear is an ergonomic role hint; the AUTHORITATIVE enforcement lives in
	// the core, so a player rendering this can only do what the core permits.
	const runtime = useRuntime();

	const canAuthor = $derived(
		actorCanAuthorContent(runtime.state.permissions, runtime.activeActorId),
	);

	// CONTENT-013 — the static subtype schema registry (the catalog the create form + validator read).
	const schemaRegistry = listVaultObjectSchemas();

	// --- CONTENT-005 — create a structured object -----------------------------------------------------
	let objectSubtype = $state<VaultObjectSubtype>('handout');
	let objectTitle = $state('');
	let objectFieldsText = $state('{\n  "title": "Sealed Letter",\n  "format": "letter"\n}');
	let objectBody = $state('A weathered parchment.');
	let createError = $state<string | null>(null);
	let createSummary = $state<string | null>(null);

	const activeSchema = $derived(vaultObjectSchema(objectSubtype));

	// A pure, read-only client-side validation PREVIEW (the core re-validates fail-closed on dispatch).
	const parsedFields = $derived.by((): { ok: true; value: Record<string, unknown> } | { ok: false } => {
		try {
			const value = JSON.parse(objectFieldsText) as unknown;
			if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false };
			return { ok: true, value: value as Record<string, unknown> };
		} catch {
			return { ok: false };
		}
	});

	const validationPreview = $derived(
		parsedFields.ok ? validateObjectFrontmatter(objectSubtype, parsedFields.value) : null,
	);

	async function createObject(): Promise<void> {
		createError = null;
		createSummary = null;
		if (!parsedFields.ok) {
			createError = 'The frontmatter fields must be a valid JSON object.';
			return;
		}
		const result = await runtime.dispatch({
			type: 'content.create-object',
			actorId: runtime.activeActorId,
			payload: {
				subtype: objectSubtype,
				title: objectTitle,
				fields: parsedFields.value,
				body: objectBody,
			},
		});
		if (result.status === 'rejected') {
			const detail = result.rejection.issues
				?.map((issue) => `${issue.path}: ${issue.message}`)
				.join('; ');
			createError = detail ? `${result.rejection.message} (${detail})` : result.rejection.message;
			return;
		}
		const event = result.events[0] as { subtype?: string } | undefined;
		createSummary = `Created ${event?.subtype ?? objectSubtype} object.`;
		objectTitle = '';
	}

	// --- CONTENT-006 — wikilink rename + repair -------------------------------------------------------
	// The actor-filtered note list (rename targets and repair hosts are chosen from visible notes only).
	const notes = $derived(
		getContentItemsForActor(runtime.state.content, runtime.state.permissions, runtime.activeActorId),
	);

	let renameItemId = $state('');
	let renameNewTitle = $state('');
	let renameError = $state<string | null>(null);
	let renameSummary = $state<string | null>(null);

	$effect(() => {
		if (renameItemId === '' && notes.length > 0) renameItemId = notes[0]!.id;
	});

	async function renameTarget(): Promise<void> {
		renameError = null;
		renameSummary = null;
		const result = await runtime.dispatch({
			type: 'content.rename-wikilink-target',
			actorId: runtime.activeActorId,
			payload: { itemId: renameItemId, newTitle: renameNewTitle },
		});
		if (result.status === 'rejected') {
			renameError = result.rejection.message;
			return;
		}
		const event = result.events[0] as
			| { toTitle: string; rewrittenItemIds: string[]; linksRewritten: number }
			| undefined;
		renameSummary = `Renamed to "${event?.toTitle}" — ${event?.linksRewritten ?? 0} link(s) across ${
			event?.rewrittenItemIds.length ?? 0
		} note(s) updated.`;
		renameNewTitle = '';
	}

	// Repair: pick a note, see its actor-filtered broken links, rewrite a broken target to a fix.
	let repairItemId = $state('');
	let repairBrokenTarget = $state('');
	let repairFixTitle = $state('');
	let repairError = $state<string | null>(null);
	let repairSummary = $state<string | null>(null);

	$effect(() => {
		if (repairItemId === '' && notes.length > 0) repairItemId = notes[0]!.id;
	});

	const repairHost = $derived(notes.find((note) => note.id === repairItemId) ?? null);
	const brokenLinks = $derived(
		repairHost
			? detectBrokenLinksForActor(
					runtime.state.content,
					runtime.state.permissions,
					runtime.activeActorId,
					repairHost.body,
				)
			: [],
	);

	async function repairLink(): Promise<void> {
		repairError = null;
		repairSummary = null;
		const result = await runtime.dispatch({
			type: 'content.repair-wikilink',
			actorId: runtime.activeActorId,
			payload: {
				itemId: repairItemId,
				brokenTarget: repairBrokenTarget,
				fixTargetTitle: repairFixTitle,
			},
		});
		if (result.status === 'rejected') {
			repairError = result.rejection.message;
			return;
		}
		const event = result.events[0] as { linksRewritten: number } | undefined;
		repairSummary = `Repaired ${event?.linksRewritten ?? 0} link(s).`;
		repairBrokenTarget = '';
		repairFixTitle = '';
	}
</script>

{#if canAuthor}
	<section data-testid="vault-objects" aria-label="Structured objects and wikilinks">
		<h2>Structured objects</h2>

		<!-- CONTENT-013 — the subtype schema registry (Scene is intentionally absent). -->
		<details data-testid="object-schema-registry">
			<summary>Vault Object subtypes ({schemaRegistry.length})</summary>
			<ul class="scene-list">
				{#each schemaRegistry as schema (schema.subtype)}
					<li data-testid={`object-subtype-${schema.subtype}`}>
						<strong>{schema.displayName}</strong>
						<span class="meta">
							required: {schema.requiredFields.join(', ') || 'none'} • default:
							{schema.defaultVisibility}
							{#if schema.referencesModel}• references {schema.referencesModel}{/if}
							{#if !schema.modelImplemented}• (frontmatter only — full model deferred){/if}
						</span>
					</li>
				{/each}
			</ul>
		</details>

		<!-- CONTENT-005 — create a schema-validated, note-backed structured object. -->
		<form
			data-testid="create-object-form"
			onsubmit={(event) => {
				event.preventDefault();
				createObject();
			}}
		>
			<h3>Create a structured object</h3>
			<label>
				Subtype
				<select data-testid="object-subtype-select" bind:value={objectSubtype}>
					{#each schemaRegistry as schema (schema.subtype)}
						<option value={schema.subtype}>{schema.displayName}</option>
					{/each}
				</select>
			</label>
			{#if activeSchema}
				<p class="meta" data-testid="object-subtype-required">
					Required fields: {activeSchema.fields
						.filter((f) => f.required)
						.map((f) => f.key)
						.join(', ') || 'none'}
				</p>
			{/if}
			<label>
				Title
				<input data-testid="object-title-input" bind:value={objectTitle} />
			</label>
			<label>
				Frontmatter fields (JSON)
				<textarea data-testid="object-fields-input" rows="5" bind:value={objectFieldsText}></textarea>
			</label>
			<label>
				Body (markdown)
				<textarea data-testid="object-body-input" rows="3" bind:value={objectBody}></textarea>
			</label>

			{#if validationPreview}
				<p class="meta" data-testid="object-validation-preview">
					{#if validationPreview.valid}
						<span data-testid="object-valid">Frontmatter is valid.</span>
					{:else}
						<span data-testid="object-invalid"
							>Invalid: {validationPreview.issues.map((i) => `${i.field} (${i.code})`).join('; ')}</span
						>
					{/if}
				</p>
			{:else}
				<p class="meta" data-testid="object-fields-parse-error">
					The frontmatter fields must be a valid JSON object.
				</p>
			{/if}

			{#if createError}
				<p class="meta" role="alert" data-testid="object-create-error">{createError}</p>
			{/if}
			{#if createSummary}
				<p class="meta" data-testid="object-create-summary">{createSummary}</p>
			{/if}
			<button type="submit" data-testid="object-create-submit">Create object</button>
		</form>

		<!-- CONTENT-006 — rename a wikilink target (propagates to referring notes). -->
		<form
			data-testid="rename-wikilink-form"
			onsubmit={(event) => {
				event.preventDefault();
				renameTarget();
			}}
		>
			<h3>Rename a wikilink target</h3>
			<label>
				Note
				<select data-testid="rename-note-select" bind:value={renameItemId}>
					{#each notes as note (note.id)}
						<option value={note.id}>{note.title}</option>
					{/each}
				</select>
			</label>
			<label>
				New title
				<input data-testid="rename-new-title" bind:value={renameNewTitle} />
			</label>
			{#if renameError}
				<p class="meta" role="alert" data-testid="rename-error">{renameError}</p>
			{/if}
			{#if renameSummary}
				<p class="meta" data-testid="rename-summary">{renameSummary}</p>
			{/if}
			<button type="submit" data-testid="rename-submit">Rename + propagate</button>
		</form>

		<!-- CONTENT-006 — repair a broken wikilink (fail closed). -->
		<form
			data-testid="repair-wikilink-form"
			onsubmit={(event) => {
				event.preventDefault();
				repairLink();
			}}
		>
			<h3>Repair a broken wikilink</h3>
			<label>
				Note
				<select data-testid="repair-note-select" bind:value={repairItemId}>
					{#each notes as note (note.id)}
						<option value={note.id}>{note.title}</option>
					{/each}
				</select>
			</label>
			{#if brokenLinks.length > 0}
				<ul class="scene-list" data-testid="repair-broken-list">
					{#each brokenLinks as broken, index (`${broken.link.raw}-${index}`)}
						<li data-testid={`repair-broken-${index}`}>
							<code>{broken.link.raw}</code> <span class="meta">— {broken.reason}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="meta" data-testid="repair-no-broken">No broken links in this note.</p>
			{/if}
			<label>
				Broken target
				<input data-testid="repair-broken-target" bind:value={repairBrokenTarget} />
			</label>
			<label>
				Fix target title
				<input data-testid="repair-fix-title" bind:value={repairFixTitle} />
			</label>
			{#if repairError}
				<p class="meta" role="alert" data-testid="repair-error">{repairError}</p>
			{/if}
			{#if repairSummary}
				<p class="meta" data-testid="repair-summary">{repairSummary}</p>
			{/if}
			<button type="submit" data-testid="repair-submit">Repair link</button>
		</form>
	</section>
{/if}

<style>
	code {
		font-family: var(--font-mono, monospace);
	}
</style>
