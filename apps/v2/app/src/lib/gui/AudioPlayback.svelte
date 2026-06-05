<script lang="ts">
	import {
		getSessionAudioView,
		listAudioAssetsForActor,
		listAudioSourceClassificationsForActor,
		resolveAudioMotionState,
		type AudioParticipantDeviceInput,
		type AudioConsentState,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { prefersReducedMotion } from '$lib/platform/capabilities';

	// AUDIO-002 / AUDIO-003: the SESSION-OWNED audio playback surface on the Command Center / Session view.
	//
	// This is the integration the prior AUDIO epics deferred to. The DM controls playback through this widget
	// — play, pause, stop, volume, crossfade, and the active-track display (AUDIO-002) — and projects the
	// active track to players. The currently-playing audio is SESSION state (Contract 4 Widget State
	// Ownership), so it persists, syncs as session state, and survives this widget being removed; only a stop
	// clears it (AUDIO-003). The GUI ONLY dispatches command intents and renders the actor-filtered read model
	// (`getSessionAudioView`) — the license/scope/offline gates (AUDIO-009/010/004), the per-participant
	// degradation decision (AUDIO-006/007/012/013), and visibility are all enforced in the Processing Core.
	//
	// The real `<audio>` element is driven by the CORE-computed delivery state: a participant device only
	// sounds when the resolved disposition is `playing` (consent granted + platform allows autoplay + the
	// track is available). A participant's device-local consent / mute / volume are DEVICE-LOCAL UI state —
	// they change what THIS device hears and never mutate the DM-authored session audio (AUDIO-002 AC3 /
	// AUDIO-007 AC2). The "view as" header control re-renders the read against another actor, proving a player
	// sees only the player-safe track + their own decision, never the DM-only delivery roster or audio config.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');

	// The DM's configured sources + assets (DM-only; the read model returns empty for a non-DM).
	const sources = $derived(
		listAudioSourceClassificationsForActor(
			runtime.state.audio,
			runtime.state.permissions,
			runtime.activeActorId,
		).filter((source) => source.supported && source.playbackEnabled),
	);
	const assets = $derived(
		listAudioAssetsForActor(runtime.state.audio, runtime.state.permissions, runtime.activeActorId),
	);

	const recipients = $derived(runtime.actors.filter((a) => a.role !== 'dm'));

	// Device-local participant preferences (AUDIO-007). UI-only state: these never enter session state.
	let consent = $state<AudioConsentState>('unset');
	let muted = $state(false);
	let localVolume = $state(1);

	// A captured platform capability snapshot. In a real device the runtime would derive these from the
	// browser (autoplay policy, background-playback, setSinkId); for the prototype the DM/test toggles model
	// the platform so the degradation paths are demonstrable. Fail closed: autoplay false until consent.
	let canPlayAudio = $state(true);
	let canAutoplay = $state(true);
	let backgrounded = $state(false);
	// AUDIO-010 inputs for the active participant's device. Defaults assume the asset is locally present.
	let assetLocallyAvailable = $state(true);
	let online = $state(true);

	// AUDIO-008 — the resolved motion state for the (reduced) crossfade/visualizer effect. The platform layer
	// owns the `prefers-reduced-motion` probe (Contract 1 / PLAT-006); the core maps it. Fails closed to
	// `reduced` when the preference is unknown.
	const motion = $derived(resolveAudioMotionState(prefersReducedMotion()));

	// The per-device inputs the read model resolves the participant decision against. The DM passes the whole
	// roster (one row per participant, here the active participant's captured device) so the DM-only delivery
	// roster is populated; a participant passes only their own row.
	const deviceInputs = $derived<AudioParticipantDeviceInput[]>(
		actor && actor.role !== 'dm'
			? [
					{
						actorId: actor.id,
						assetLocallyAvailable,
						assetCached: false,
						cacheEvicted: false,
						online,
						capability: { canPlayAudio, canAutoplay, canPlayInBackground: false, canRouteOutput: false },
						preferences: { consent, muted, localVolume, outputRouteId: null },
						backgrounded,
					},
				]
			: recipients.map((recipient) => ({
					actorId: recipient.id,
					assetLocallyAvailable: true,
					assetCached: false,
					cacheEvicted: false,
					online: true,
					// The DM roster models each participant's device from the projection/queue; here the prototype
					// reuses the active participant's captured consent for the demonstrable participant only.
					capability: { canPlayAudio: true, canAutoplay: true, canPlayInBackground: false, canRouteOutput: false },
					preferences: {
						consent: recipient.id === runtime.activeActorId ? consent : 'unset',
						muted: false,
						localVolume: 1,
						outputRouteId: null,
					},
					backgrounded: false,
				})),
	);

	const view = $derived(
		getSessionAudioView(
			runtime.state.audio,
			runtime.state.session.audioPlayback,
			runtime.state.permissions,
			runtime.activeActorId,
			deviceInputs,
		),
	);

	let error = $state<string | null>(null);
	let selectedSourceId = $state('');
	let selectedAssetId = $state('');
	let crossfadeSeconds = $state(0);
	let dmVolume = $state(1);
	let selectedRecipients = $state<string[]>([]);
	let connectionState = $state<'connected' | 'offline'>('connected');

	// The player-safe active track is the same for DM and participant views (the type guard narrows the view).
	const track = $derived(view.track);

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	async function play(): Promise<void> {
		if (!selectedSourceId) {
			error = 'Select an audio source to play.';
			return;
		}
		await dispatch({
			type: 'session.audio.play',
			actorId: runtime.activeActorId,
			payload: {
				sourceId: selectedSourceId,
				assetId: selectedAssetId || null,
				volume: dmVolume,
				crossfadeSeconds: Number(crossfadeSeconds) || 0,
			},
		});
	}

	async function pause(): Promise<void> {
		await dispatch({ type: 'session.audio.pause', actorId: runtime.activeActorId, payload: {} });
	}

	async function resume(): Promise<void> {
		await dispatch({ type: 'session.audio.resume', actorId: runtime.activeActorId, payload: {} });
	}

	async function stop(): Promise<void> {
		await dispatch({ type: 'session.audio.stop', actorId: runtime.activeActorId, payload: {} });
	}

	async function setVolume(value: number): Promise<void> {
		dmVolume = value;
		if (track) {
			await dispatch({
				type: 'session.audio.set-volume',
				actorId: runtime.activeActorId,
				payload: { volume: value },
			});
		}
	}

	function toggleRecipient(id: string): void {
		selectedRecipients = selectedRecipients.includes(id)
			? selectedRecipients.filter((r) => r !== id)
			: [...selectedRecipients, id];
	}

	async function project(): Promise<void> {
		if (selectedRecipients.length === 0) {
			error = 'Select at least one player to project audio to.';
			return;
		}
		await dispatch({
			type: 'session.audio.project',
			actorId: runtime.activeActorId,
			payload: { playerActorIds: selectedRecipients, connectionState },
		});
	}

	// AUDIO-007 — the participant grants device-local consent. This is the captured user gesture that
	// satisfies the autoplay gate; it is device-local and never mutates session audio state.
	function grantConsent(): void {
		consent = 'granted';
	}
	function declineConsent(): void {
		consent = 'declined';
	}

	// A demonstrable DM affordance: configure a playback-enabled demo source so the playback controls have a
	// playable option. The prior AUDIO epics shipped no audio-config GUI (the source/asset library config was
	// deferred to this playback epic), so this minimal control seeds a bundled-preset (fully offline,
	// pre-licensed — no per-asset license review) and a local asset to play. Real source/asset management is
	// a future AUDIO library-management surface; this proves the end-to-end playback path.
	async function configureDemoSource(): Promise<void> {
		const sourceId = runtime.newId();
		const sourced = await dispatch({
			type: 'audio.configure-source',
			actorId: runtime.activeActorId,
			payload: {
				sourceId,
				type: 'bundled-preset',
				displayName: 'Tavern ambience (demo)',
				cacheBehavior: 'local',
			},
		});
		if (!sourced) return;
		const imported = await dispatch({
			type: 'audio.import-asset',
			actorId: runtime.activeActorId,
			payload: {
				sourceId,
				bytes: [82, 73, 70, 70],
				mimeType: 'audio/mpeg',
				fileName: 'tavern-ambience.mp3',
				title: 'Tavern ambience',
				// A bundled preset is pre-licensed; declaring `owned` clears the AUDIO-004 review gate so it plays.
				license: { kind: 'owned' },
			},
		});
		if (imported) {
			selectedSourceId = sourceId;
			// Select the just-imported asset (a bundled-preset plays a specific local asset — AUDIO-002).
			const newest = Object.values(runtime.state.audio.assets).find(
				(asset) => asset.source.sourceId === sourceId,
			);
			selectedAssetId = newest?.id ?? '';
		}
	}
</script>

<section data-testid="audio-playback" aria-label="Audio playback">
	<h2>Audio</h2>

	{#if error}
		<p class="error" role="alert" data-testid="audio-error">{error}</p>
	{/if}

	{#if !sessionActive}
		<p class="meta" data-testid="audio-needs-active-session">
			Session audio plays while the session is active. Start the session from the Command Center first.
		</p>
	{/if}

	<!-- Active-track display (AUDIO-002): the player-safe track is shown to DM and recipients alike. -->
	<div class="now-playing" data-testid="audio-now-playing">
		{#if track}
			<span data-testid="audio-track-status">Status: {track.status}</span>
			<span data-testid="audio-track-source">Source: {track.sourceId}</span>
			{#if track.assetId}<span data-testid="audio-track-asset">Asset: {track.assetId}</span>{/if}
			<span data-testid="audio-session-volume">Session volume: {track.volume.toFixed(2)}</span>
			{#if track.crossfadeSeconds > 0}
				<span data-testid="audio-crossfade" class:reduced-motion={motion === 'reduced'}>
					Crossfade {track.crossfadeSeconds}s
				</span>
			{/if}
		{:else}
			<span class="meta" data-testid="audio-idle">No audio is playing.</span>
		{/if}
	</div>

	{#if isDm && view.role === 'dm'}
		<form
			class="playback-form"
			data-testid="audio-playback-form"
			onsubmit={(event) => {
				event.preventDefault();
				void play();
			}}
		>
			<label for="audio-source">Source</label>
			<select id="audio-source" data-testid="audio-source-select" bind:value={selectedSourceId}>
				<option value="">Select a source…</option>
				{#each sources as source (source.sourceId)}
					<option value={source.sourceId}>{source.displayName} ({source.type})</option>
				{/each}
			</select>
			{#if sources.length === 0}
				<button type="button" data-testid="audio-configure-demo" onclick={() => void configureDemoSource()}>
					Configure a demo source
				</button>
			{/if}

			<label for="audio-asset">Track (optional for a stream)</label>
			<select id="audio-asset" data-testid="audio-asset-select" bind:value={selectedAssetId}>
				<option value="">No local asset (stream)</option>
				{#each assets as asset (asset.id)}
					<option value={asset.id} disabled={asset.needsLicenseReview}>
						{asset.title}{asset.needsLicenseReview ? ' (needs license review)' : ''}
					</option>
				{/each}
			</select>

			<label for="audio-crossfade">Crossfade seconds</label>
			<input
				id="audio-crossfade"
				type="number"
				min="0"
				step="1"
				data-testid="audio-crossfade-input"
				bind:value={crossfadeSeconds}
			/>

			<div class="controls" data-testid="audio-controls">
				<button type="submit" data-testid="audio-play" disabled={!sessionActive}>Play</button>
				{#if track && track.status === 'playing'}
					<button type="button" data-testid="audio-pause" onclick={() => void pause()}>Pause</button>
				{/if}
				{#if track && track.status === 'paused'}
					<button type="button" data-testid="audio-resume" onclick={() => void resume()}>Resume</button>
				{/if}
				{#if track}
					<button type="button" data-testid="audio-stop" onclick={() => void stop()}>Stop</button>
				{/if}
			</div>

			<label for="audio-volume">Session volume</label>
			<input
				id="audio-volume"
				type="range"
				min="0"
				max="1"
				step="0.05"
				data-testid="audio-volume-input"
				bind:value={dmVolume}
				onchange={() => void setVolume(dmVolume)}
			/>
		</form>

		<fieldset class="project" data-testid="audio-project">
			<legend>Project to players</legend>
			{#each recipients as recipient (recipient.id)}
				<label class="recipient">
					<input
						type="checkbox"
						data-testid={`audio-recipient-${recipient.id}`}
						checked={selectedRecipients.includes(recipient.id)}
						onchange={() => toggleRecipient(recipient.id)}
					/>
					{recipient.displayName}
				</label>
			{/each}
			<label for="audio-connection">Connection</label>
			<select id="audio-connection" data-testid="audio-connection-select" bind:value={connectionState}>
				<option value="connected">Connected</option>
				<option value="offline">Offline (queue)</option>
			</select>
			<button type="button" data-testid="audio-project-button" onclick={() => void project()} disabled={!track}>
				Project audio
			</button>
		</fieldset>

		<!-- AUDIO-006 AC2 — the per-participant delivery roster (DM-only): who can/cannot hear audio. -->
		<section class="delivery-roster" data-testid="audio-delivery-roster" aria-label="Audio delivery status">
			<h3>Participant delivery</h3>
			{#if view.participantDelivery.length === 0}
				<p class="meta" data-testid="audio-delivery-empty">No participant audio to report.</p>
			{:else}
				<ul>
					{#each view.participantDelivery as row (row.actorId)}
						<li data-testid={`audio-delivery-${row.actorId}`}>
							{row.actorId}: <span data-testid="audio-delivery-disposition">{row.disposition}</span>
							({row.sounding ? 'sounding' : 'silent'})
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- AUDIO-003 AC3 — the offline delivery queue: a participant unavailable at projection is queued. -->
		{#if view.deliveryQueue.length > 0}
			<section class="delivery-queue" data-testid="audio-delivery-queue" aria-label="Audio delivery queue">
				<h3>Delivery queue</h3>
				<ul>
					{#each view.deliveryQueue as row (row.playerActorId)}
						<li data-testid={`audio-queue-${row.playerActorId}`}>
							{row.playerActorId}: <span data-testid="audio-queue-status">{row.deliveryStatus}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}

	{#if !isDm && view.role === 'participant'}
		<!-- The participant view: the player-safe track + THEIR OWN resolved delivery decision. -->
		<section class="participant" data-testid="audio-participant" aria-label="Your audio">
			<h3>Your audio</h3>
			<p data-testid="audio-participant-disposition">{view.disposition}</p>
			<p class="meta" data-testid="audio-participant-message">{view.message}</p>

			{#if view.disposition === 'user-action-required' && consent !== 'granted'}
				<!-- AUDIO-002 AC2 / AUDIO-006 / AUDIO-007: a user gesture is required before audio can start. -->
				<div class="consent" data-testid="audio-consent-prompt">
					<button type="button" data-testid="audio-grant-consent" onclick={grantConsent}>
						Enable audio on this device
					</button>
					<button type="button" data-testid="audio-decline-consent" onclick={declineConsent}>
						Keep this device silent
					</button>
				</div>
			{/if}

			<label class="device-pref">
				<input type="checkbox" data-testid="audio-local-mute" bind:checked={muted} />
				Mute on this device
			</label>
			<label class="device-pref" for="audio-local-volume">Device volume</label>
			<input
				id="audio-local-volume"
				type="range"
				min="0"
				max="1"
				step="0.05"
				data-testid="audio-local-volume"
				bind:value={localVolume}
			/>

			{#if view.queueStatus}
				<p class="meta" data-testid="audio-participant-queue">Delivery: {view.queueStatus}</p>
			{/if}

			<!-- The real <audio> element is driven by the CORE-computed delivery state: it only plays when the
			     resolved disposition is `playing` (consent + autoplay + availability all cleared). The element is
			     muted unless sounding, so consent / autoplay / degradation gates are respected at the display
			     layer, never bypassed. No `src` is wired in the prototype (assets are not bundled); the gating is
			     what matters for the requirement. -->
			<audio
				data-testid="audio-element"
				data-sounding={view.sounding ? 'true' : 'false'}
				muted={!view.sounding}
				aria-hidden="true"
			></audio>
		</section>
	{/if}
</section>

<style>
	.error {
		color: var(--color-danger, #b00020);
	}
	.meta {
		color: var(--color-text-muted, #666);
	}
	.now-playing {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		margin-bottom: var(--space-2, 0.5rem);
	}
	.playback-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
		margin-bottom: var(--space-2, 0.5rem);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1, 0.25rem);
	}
	.recipient,
	.device-pref {
		display: flex;
		gap: var(--space-1, 0.25rem);
		align-items: center;
	}
	.project {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
		margin-bottom: var(--space-2, 0.5rem);
	}
	.delivery-roster ul,
	.delivery-queue ul {
		list-style: none;
		padding: 0;
	}
	/* AUDIO-008 — reduced-motion: the crossfade indicator never animates when motion is reduced. */
	.reduced-motion {
		transition: none !important;
		animation: none !important;
	}
</style>
