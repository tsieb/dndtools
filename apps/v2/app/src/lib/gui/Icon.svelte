<script lang="ts">
	import { ICON_REGISTRY, resolveIconA11y, type IconName, type IconSize } from './icons';

	/**
	 * UX-VIS-009: the shared icon primitive. Renders one Lucide glyph from the registry at a
	 * token-driven size, with a single accessibility rule (decorative => aria-hidden; meaningful =>
	 * role="img" + aria-label). Every surface uses this component, so the app has one icon family at
	 * one stroke weight. Colour is `currentColor` by default; pass a status/dm class to add a colour
	 * cue on top of the icon's shape + adjacent text (A11Y-011), never as the sole signal.
	 */
	interface Props {
		name: IconName;
		/** One of the named icon-size tokens. Defaults to `md` (24px). */
		size?: IconSize;
		/**
		 * Accessible name. Provide for any icon that conveys meaning on its own (e.g. an icon-only
		 * button). Omit ONLY when the icon is decorative and sits next to visible text.
		 */
		label?: string;
		/** Extra classes (e.g. `icon-status-error`, `icon-dm-only`). */
		class?: string;
	}

	let { name, size = 'md', label, class: className }: Props = $props();

	const Glyph = $derived(ICON_REGISTRY[name]);
	const a11y = $derived(resolveIconA11y(label));
	const classes = $derived(['icon', `icon-${size}`, className].filter(Boolean).join(' '));
</script>

<Glyph class={classes} focusable="false" {...a11y} />
