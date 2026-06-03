<script lang="ts">
	import {
		EMPTY_WIDGET_DATA_ENVIRONMENT,
		getSceneForActor,
		listWidgetLayoutCommands,
		resolveLayoutCommandPayload,
		type SceneLayoutCommand,
		type WidgetBindingPayload,
		type WidgetInstance,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	const { data } = $props();
	const runtime = useRuntime();

	const sceneId = $derived(data.id);
	// Resolve widget bindings through the Processing Core data layer (CANVAS-009)
	// so hidden, conflicted, missing, and unbound states are surfaced explicitly.
	const summary = $derived(
		getSceneForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			runtime.defaultActorId,
			sceneId,
			{ widgetPackages: runtime.state.widgets, dataEnvironment: EMPTY_WIDGET_DATA_ENVIRONMENT },
		),
	);

	// Raw Scene for actor-scoped layout command descriptors (CANVAS-012). The GUI may
	// know which command descriptors are available for visible controls (Contract 1);
	// it never mutates layout directly.
	const rawScene = $derived(runtime.state.scenes.scenes[sceneId]);

	let widgetType = $state('note');
	let widgetVersion = $state('1.0.0');
	let widgetX = $state(40);
	let widgetY = $state(40);
	let widgetW = $state(240);
	let widgetH = $state(160);
	let bindEntityType = $state('');
	let bindEntityId = $state('');
	let bindSelector = $state('');

	// Widgets selected for a grouping operation (keyboard/touch reachable, no drag).
	let selectedForGroup = $state<Set<string>>(new Set());

	// Render widgets in declared focus-traversal order (CANVAS-016) so DOM tab order
	// follows z-order/grouping/dock/pin/explicit metadata rather than insertion order.
	const orderedWidgets = $derived.by(() => {
		if ('kind' in summary) return [] as Array<{ tabIndex: number; payload: WidgetBindingPayload }>;
		const byId = new Map<string, WidgetBindingPayload>();
		for (const payload of summary.widgets) {
			const id =
				payload.kind === 'available' || payload.kind === 'degraded'
					? payload.widget.id
					: payload.widgetInstanceId;
			byId.set(id, payload);
		}
		const out: Array<{ tabIndex: number; payload: WidgetBindingPayload }> = [];
		for (const entry of summary.focusOrder) {
			const payload = byId.get(entry.widgetInstanceId);
			if (payload) out.push({ tabIndex: entry.tabIndex, payload });
		}
		return out;
	});

	function widgetAccessibleName(widget: WidgetInstance): string {
		const boundTo = widget.binding ? ` bound to ${widget.binding.source.entityId}` : '';
		return `${widget.type} widget${boundTo}`;
	}

	function layoutCommandsFor(widget: WidgetInstance): SceneLayoutCommand[] {
		if (!rawScene) return [];
		return listWidgetLayoutCommands(
			rawScene,
			widget,
			runtime.state.permissions,
			runtime.defaultActorId,
		);
	}

	async function runLayoutCommand(command: SceneLayoutCommand, widget: WidgetInstance) {
		if (!rawScene) return;
		const resolved = resolveLayoutCommandPayload(command, rawScene, widget);
		if (!resolved) return;
		await runtime.dispatch({
			type: resolved.type,
			actorId: runtime.defaultActorId,
			payload: resolved.payload,
		});
	}

	function toggleGroupSelection(id: string, checked: boolean) {
		const next = new Set(selectedForGroup);
		if (checked) next.add(id);
		else next.delete(id);
		selectedForGroup = next;
	}

	async function groupSelected() {
		if (selectedForGroup.size < 2) return;
		await runtime.dispatch({
			type: 'scene.group-widgets',
			actorId: runtime.defaultActorId,
			payload: { sceneId, widgetInstanceIds: [...selectedForGroup] },
		});
		selectedForGroup = new Set();
	}

	async function addWidget(event: SubmitEvent) {
		event.preventDefault();
		const entityType = bindEntityType.trim();
		const entityId = bindEntityId.trim();
		const selector = bindSelector.trim();
		const binding =
			entityType && entityId
				? {
						source: { entityType, entityId, ...(selector ? { selector } : {}) },
						mode: 'read' as const,
						requiredCapability: 'viewer' as const,
					}
				: null;
		await runtime.dispatch({
			type: 'scene.add-widget',
			actorId: runtime.defaultActorId,
			payload: {
				sceneId,
				widget: {
					type: widgetType,
					version: widgetVersion,
					layout: { x: widgetX, y: widgetY, w: widgetW, h: widgetH },
					configuration: {},
					binding,
				},
			},
		});
	}

	async function destroyWidget(id: string) {
		await runtime.dispatch({
			type: 'scene.destroy-widget',
			actorId: runtime.defaultActorId,
			payload: { sceneId, widgetInstanceId: id },
		});
	}

	async function startTimer(id: string) {
		if ('kind' in summary) return;
		await runtime.dispatch({
			type: 'widget.dispatch-command',
			actorId: runtime.defaultActorId,
			idempotencyKey: `timer-start-${id}-${Date.now()}`,
			payload: {
				sceneId,
				widgetInstanceId: id,
				commandType: 'timer.start',
				payload: { durationSeconds: 60 },
				expectedRevision: summary.ownership.revision,
			},
		});
	}

	async function saveTemplate() {
		if ('kind' in summary) return;
		await runtime.dispatch({
			type: 'scene.save-template',
			actorId: runtime.defaultActorId,
			payload: { sourceSceneId: sceneId, templateName: `${summary.name} (template)` },
		});
	}
</script>

{#if 'kind' in summary}
	<p class="error" role="alert" data-testid="scene-denied">
		Cannot open scene: {summary.reason}
	</p>
{:else}
	<section class="scene-editor" data-testid="scene-editor">
		<header>
			<a href="../../scenes/" data-testid="back-to-scenes">← Back</a>
			<h2 data-testid="scene-name">{summary.name}</h2>
			<p class="meta">
				visibility {summary.visibility} • rev {summary.ownership.revision} •
				{summary.widgets.length} widget{summary.widgets.length === 1 ? '' : 's'}
			</p>
			<div class="row-actions">
				<button class="button secondary" data-testid="save-template" onclick={saveTemplate}>
					Save as Template
				</button>
			</div>
		</header>

		<section>
			<h3>Add widget</h3>
			<form class="form" onsubmit={addWidget} aria-label="Add widget">
				<label>
					<span>Type</span>
					<input bind:value={widgetType} data-testid="widget-type" required />
				</label>
				<label>
					<span>Version</span>
					<input bind:value={widgetVersion} data-testid="widget-version" required />
				</label>
				<label>
					<span>x</span>
					<input type="number" bind:value={widgetX} data-testid="widget-x" />
				</label>
				<label>
					<span>y</span>
					<input type="number" bind:value={widgetY} data-testid="widget-y" />
				</label>
				<label>
					<span>w</span>
					<input type="number" min="1" bind:value={widgetW} data-testid="widget-w" />
				</label>
				<label>
					<span>h</span>
					<input type="number" min="1" bind:value={widgetH} data-testid="widget-h" />
				</label>
				<label>
					<span>Bind entity type</span>
					<input bind:value={bindEntityType} data-testid="bind-entity-type" autocomplete="off" />
				</label>
				<label>
					<span>Bind entity id</span>
					<input bind:value={bindEntityId} data-testid="bind-entity-id" autocomplete="off" />
				</label>
				<label>
					<span>Bind selector</span>
					<input bind:value={bindSelector} data-testid="bind-selector" autocomplete="off" />
				</label>
				<button class="button" type="submit" data-testid="widget-add">Add widget</button>
			</form>
		</section>

		<section>
			<div class="widgets-head">
				<h3>Widgets</h3>
				<button
					type="button"
					class="button secondary"
					data-testid="group-selected"
					disabled={selectedForGroup.size < 2}
					onclick={groupSelected}
				>
					Group selected ({selectedForGroup.size})
				</button>
			</div>
			<p class="meta">Tab order follows the declared Scene focus order.</p>
			<div class="widget-grid" data-testid="widget-grid">
				{#each orderedWidgets as { tabIndex, payload } (payload.kind === 'available' || payload.kind === 'degraded' ? payload.widget.id : payload.widgetInstanceId)}
					{#if payload.kind === 'available' || payload.kind === 'degraded'}
						{@const w = payload.widget}
						{@const timer = runtime.state.session.timers[w.id]}
						<article
							class="widget-row"
							data-testid={`widget-${w.id}`}
							data-focus-index={tabIndex}
						>
							<div>
								<label class="select-widget">
									<input
										type="checkbox"
										data-testid={`select-${w.id}`}
										checked={selectedForGroup.has(w.id)}
										onchange={(e) => toggleGroupSelection(w.id, e.currentTarget.checked)}
									/>
									<span><strong>{w.type}</strong> <span class="meta">v{w.version}</span></span>
								</label>
								{#if payload.kind === 'degraded'}
									<div class="layout" data-testid={`degraded-${w.id}`}>
										degraded: {payload.unavailableHostPermissions.join(', ')} unavailable
									</div>
								{/if}
								<div class="layout">
									x {w.layout.x.toFixed(0)} • y {w.layout.y.toFixed(0)} • w {w.layout.w.toFixed(0)} •
									h {w.layout.h.toFixed(0)} • z {w.layout.z}
									{#if w.layout.dock}• docked {w.layout.dock}{/if}
									{#if w.layout.pinned}• pinned{/if}
									{#if w.layout.groupId}• grouped{/if}
									{#if w.layout.focusOrder !== null}• focus {w.layout.focusOrder}{/if}
									{#if timer}
										• timer {timer.status}
									{/if}
								</div>
							</div>
							<div
								class="row-actions"
								role="toolbar"
								aria-label={`Layout controls for ${widgetAccessibleName(w)}`}
								data-testid={`layout-toolbar-${w.id}`}
							>
								{#each layoutCommandsFor(w) as command (command.id)}
									{#if command.targets === 'self'}
										<button
											type="button"
											data-testid={`layout-${command.id}-${w.id}`}
											aria-label={`${command.label} — ${widgetAccessibleName(w)}`}
											onclick={() => runLayoutCommand(command, w)}
										>
											{command.label}
										</button>
									{/if}
								{/each}
								{#if w.type === 'timer'}
									<button
										type="button"
										data-testid={`start-timer-${w.id}`}
										onclick={() => startTimer(w.id)}
									>
										Start
									</button>
								{/if}
							</div>
						</article>
					{:else if payload.kind === 'disabled'}
						<article
							class="widget-row"
							data-testid={`disabled-${payload.widgetInstanceId}`}
							data-focus-index={tabIndex}
						>
							<div>
								<strong>{payload.type}</strong>
								<div class="layout">disabled: {payload.reason}</div>
							</div>
							<div class="row-actions">
								<button
									type="button"
									onclick={() => destroyWidget(payload.widgetInstanceId)}
									data-testid={`destroy-${payload.widgetInstanceId}`}
								>
									Remove
								</button>
							</div>
						</article>
					{:else if payload.kind === 'missing'}
						<article
							class="widget-row"
							data-testid={`missing-${payload.widgetInstanceId}`}
							data-focus-index={tabIndex}
						>
							<div>
								<strong>{payload.type}</strong>
								<div class="layout">binding missing</div>
							</div>
						</article>
					{:else if payload.kind === 'conflicted'}
						<article
							class="widget-row"
							data-testid={`conflicted-${payload.widgetInstanceId}`}
							data-focus-index={tabIndex}
						>
							<div>
								<strong>{payload.type}</strong>
								<div class="layout">binding conflicted: {payload.conflictPaths.join(', ')}</div>
							</div>
						</article>
					{:else if payload.kind === 'unbound'}
						<article
							class="widget-row"
							data-testid={`unbound-${payload.widgetInstanceId}`}
							data-focus-index={tabIndex}
						>
							<div>
								<strong>{payload.type}</strong>
								<div class="layout">needs a data source</div>
							</div>
						</article>
					{:else}
						<article
							class="widget-row"
							data-testid={`hidden-${payload.widgetInstanceId}`}
							data-focus-index={tabIndex}
						>
							<div>
								<strong>{payload.type}</strong>
								<div class="layout">hidden in this view</div>
							</div>
						</article>
					{/if}
				{/each}
				{#if summary.widgets.length === 0}
					<p class="meta">No widgets yet — add one above.</p>
				{/if}
			</div>
		</section>
	</section>
{/if}
