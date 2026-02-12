<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	interface Props {
		open: boolean;
		title?: string;
		message: string;
		confirmText?: string;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let {
		open,
		title = 'Confirm',
		message,
		confirmText = 'Delete',
		onconfirm,
		oncancel,
	}: Props = $props();
</script>

<Modal {open} {title} onclose={oncancel}>
	<p class="text-ink dark:text-tavern-text mb-4">{message}</p>
	<div class="flex justify-end gap-2">
		<Button variant="secondary" onclick={oncancel}>Cancel</Button>
		<Button variant="danger" onclick={onconfirm}>{confirmText}</Button>
	</div>
</Modal>
