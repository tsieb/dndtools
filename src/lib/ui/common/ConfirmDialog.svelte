<script lang="ts">
	import Dialog from './Dialog.svelte';
	import Button from './Button.svelte';

	interface Props {
		open: boolean;
		title?: string;
		message: string;
		confirmText?: string;
		confirmLoading?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let {
		open,
		title = 'Confirm',
		message,
		confirmText = 'Delete',
		confirmLoading = false,
		onconfirm,
		oncancel,
	}: Props = $props();
</script>

<Dialog {open} {title} maxWidth="sm" onclose={oncancel}>
	<p class="mb-4 text-ink">{message}</p>
	<div class="flex justify-end gap-2">
		<Button variant="secondary" onclick={oncancel}>Cancel</Button>
		<Button variant="danger" onclick={onconfirm} loading={confirmLoading}>{confirmText}</Button>
	</div>
</Dialog>
