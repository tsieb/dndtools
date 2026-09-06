// Typed facade for the design-system barrel. The DS components are authored as untyped `.jsx`; this
// declaration types every export as a permissive React component (props are `any`) so consuming
// `.tsx` screens get clean autocompletion without `tsc` inferring the components' destructured props
// as *required*. The runtime still loads the real `index.js`; this file only shapes the types.
import type { ComponentType } from 'react';

type DSComponent = ComponentType<Record<string, unknown>>;

// Core
export const Icon: DSComponent;
export const IconButton: DSComponent;
export const Avatar: DSComponent;
export const BrandMark: DSComponent;
export const BrandWordmark: DSComponent;
export const BrandLockup: DSComponent;
export const Breadcrumb: DSComponent;
export const Button: DSComponent;
export const Card: DSComponent;
export const CardHeader: DSComponent;
export const Popover: DSComponent;
export const Stepper: DSComponent;
export const Tabs: DSComponent;
/** ARIA tab/panel wiring for a `<Tabs idBase="…">`: spread onto the active tab's panel element. */
export function tabPanelProps(
	idBase: string | undefined,
	tabId: string,
): { role?: string; id?: string; 'aria-labelledby'?: string };
export const ICON_REGISTRY: Record<string, string>;

// Feedback
export const Badge: DSComponent;
export const Chip: DSComponent;
export const StatusDot: DSComponent;
export const VisibilityChip: DSComponent;

// Forms
export const Checkbox: DSComponent;
export const Field: DSComponent;
export const Input: DSComponent;
export const Textarea: DSComponent;
export const SegmentedControl: DSComponent;
export const Select: DSComponent;
export const Slider: DSComponent;
export const Switch: DSComponent;

// Data
export const DataTable: DSComponent;
export const DefinitionList: DSComponent;
export const Stat: DSComponent;

// Domain
export const DiceResult: DSComponent;
export const HPBar: DSComponent;
export const InitiativeRow: DSComponent;
export const StatPill: DSComponent;

// Creature
export const AbilityScore: DSComponent;
export const StatBlock: DSComponent;
export const abilityModifier: (score: number) => number;

// Campaign
export const NpcCard: DSComponent;
export const QuestCard: DSComponent;
export const SessionTimeline: DSComponent;

// Command
export const CommandPalette: DSComponent;

// Condition
export const ConditionBadge: DSComponent;
export const ConditionTracker: DSComponent;
export const CONDITIONS: Record<string, ConditionDef>;
export const DEFAULT_CONDITIONS: Record<string, ConditionDef>;
// RC-SYS-2.3 — the active system package's condition catalog, published at mount.
export interface ConditionDef {
	label: string;
	icon: string;
	tone: string;
}
export interface SystemConditionInput {
	key: string;
	label?: string;
	icon?: string;
	severity?: string;
}
export interface ConditionCatalog {
	/** The active package's conditions in authored order. EMPTY = the system declares none. */
	conditions: ReadonlyArray<SystemConditionInput>;
	/** key → label/icon/tone, for rendering. */
	registry: Record<string, ConditionDef>;
}
export const SystemProvider: DSComponent;
export function useConditionCatalog(): ConditionCatalog;
export function useConditionDef(key: string | undefined): ConditionDef | undefined;
export function conditionRegistry(
	conditions: ReadonlyArray<SystemConditionInput> | undefined,
): Record<string, ConditionDef>;

// Map
export const FogControls: DSComponent;
export const GenerationPanel: DSComponent;
export const ImportWizard: DSComponent;
export const LayerPanel: DSComponent;
export const LayerRow: DSComponent;
export const LayerTypeBadge: DSComponent;
export const LAYER_TYPES: Record<string, unknown>;
export const MapCreationForm: DSComponent;
export const Minimap: DSComponent;
export const POIMarker: DSComponent;
export const POIPopover: DSComponent;
export const ToolPalette: DSComponent;
export const DEFAULT_TOOLS: unknown[];

// Navigation
export const BottomTabBar: DSComponent;
export const NavItem: DSComponent;
export const NavRail: DSComponent;
export const NavSidebar: DSComponent;

// Overlay
export const Dialog: DSComponent;
export const Sheet: DSComponent;
export const Toast: DSComponent;
export interface ToastOptions {
	id?: string | number;
	status?: 'success' | 'warning' | 'error' | 'info';
	message?: string;
	title?: string;
	duration?: number;
	action?: string;
	onAction?: () => void;
}
export const Toaster: {
	show(input: string | ToastOptions): number;
	success(message: string, opts?: ToastOptions): number;
	warning(message: string, opts?: ToastOptions): number;
	error(message: string, opts?: ToastOptions): number;
	info(message: string, opts?: ToastOptions): number;
	dismiss(id: number): void;
	clear(): void;
	subscribe(fn: (items: unknown[]) => void): () => void;
};
export const ToastViewport: DSComponent;
export const Tooltip: DSComponent;

// Spell
export const SpellCard: DSComponent;
export const SpellSlots: DSComponent;

// System
export const EmptyState: DSComponent;
export const ProgressMeter: DSComponent;
export const Skeleton: DSComponent;
/* RC-SYS-3.1 */
export const SystemPackageCard: DSComponent;

/* RC-ENG-4.1 — typed form-control events.
   `Input`, `Textarea` and `Select` spread `{...rest}` straight onto the native element, so their
   `onChange` / `onKeyDown` really are the React DOM events. The facade above types every DS prop
   as `unknown` (see the header note), which means a handler's parameter has no contextual type and
   call sites must annotate it. These aliases are that annotation, so screens no longer reach for
   `any` at the seam. Type-only: nothing is emitted, `index.js` has no matching runtime export. */
export type DSFieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
export type DSChangeEvent = import('react').ChangeEvent<DSFieldElement>;
export type DSKeyboardEvent = import('react').KeyboardEvent<DSFieldElement>;
/** The `status` tones `Badge` paints (its `STATUS` map in `components/feedback/Badge.jsx`). */
export type DSBadgeStatus = 'success' | 'warning' | 'error' | 'info' | 'accent' | 'neutral';
