<script lang="ts" module>
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Bookmark from 'lucide-svelte/icons/bookmark';
	import Check from 'lucide-svelte/icons/check';
	import CheckCircle from 'lucide-svelte/icons/check-circle';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Clock from 'lucide-svelte/icons/clock';
	import Copy from 'lucide-svelte/icons/copy';
	import Download from 'lucide-svelte/icons/download';
	import Ellipsis from 'lucide-svelte/icons/ellipsis';
	import Eye from 'lucide-svelte/icons/eye';
	import EyeOff from 'lucide-svelte/icons/eye-off';
	import FileText from 'lucide-svelte/icons/file-text';
	import Flag from 'lucide-svelte/icons/flag';
	import Hexagon from 'lucide-svelte/icons/hexagon';
	import Info from 'lucide-svelte/icons/info';
	import List from 'lucide-svelte/icons/list';
	import LoaderCircle from 'lucide-svelte/icons/loader-circle';
	import MapIcon from 'lucide-svelte/icons/map';
	import Menu from 'lucide-svelte/icons/menu';
	import Minus from 'lucide-svelte/icons/minus';
	import PanelLeft from 'lucide-svelte/icons/panel-left';
	import Pin from 'lucide-svelte/icons/pin';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Settings from 'lucide-svelte/icons/settings';
	import Square from 'lucide-svelte/icons/square';
	import Star from 'lucide-svelte/icons/star';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
	import XIcon from 'lucide-svelte/icons/x';

	/** Canonical icon name to Lucide component mapping. Only icons used in the application are
	 * included so the bundle stays tree-shakeable. */
	const ICON_MAP = {
		// Domain: navigation
		book: BookOpen,
		bookmark: Bookmark,
		'chevron-down': ChevronDown,
		'chevron-left': ChevronLeft,
		'chevron-right': ChevronRight,
		flag: Flag,
		hexagon: Hexagon,
		map: MapIcon,
		menu: Menu,
		'panel-left': PanelLeft,
		settings: Settings,
		// Domain: actions
		check: Check,
		copy: Copy,
		download: Download,
		ellipsis: Ellipsis,
		eye: Eye,
		'eye-off': EyeOff,
		minus: Minus,
		pin: Pin,
		plus: Plus,
		search: Search,
		square: Square,
		star: Star,
		trash: Trash2,
		x: XIcon,
		// Domain: status
		'alert-circle': AlertCircle,
		'check-circle': CheckCircle,
		'file-text': FileText,
		info: Info,
		loader: LoaderCircle,
		'triangle-alert': TriangleAlert,
		// Domain: browse
		clock: Clock,
		list: List,
	} as const;

	export type IconName = keyof typeof ICON_MAP;

	export { ICON_MAP };
</script>

<script lang="ts">
	const SIZE_PX: Record<string, number> = { xs: 12, sm: 16, md: 20, lg: 24 };

	interface Props {
		name: IconName;
		/** Token size: xs=12px, sm=16px, md=20px, lg=24px. Default: md. */
		size?: 'xs' | 'sm' | 'md' | 'lg';
		/** CSS color value. Inherits currentColor when omitted. */
		color?: string;
		/** SVG stroke-width override. Default: 2. */
		strokeWidth?: number;
		/** Extra CSS classes forwarded to the SVG element (e.g. "animate-spin"). */
		class?: string;
	}

	let { name, size = 'md', color, strokeWidth = 2, class: className }: Props = $props();

	const px = $derived(SIZE_PX[size] ?? 20);
	const Comp = $derived(ICON_MAP[name]);
</script>

<Comp size={px} {color} {strokeWidth} aria-hidden="true" class={className} />
