import * as React from 'react';

export interface Command {
  id: string;
  label: string;
  /** Section heading the command lives under (UPPERCASE-rendered). Defaults to "Commands". */
  group?: string;
  /** Semantic Icon registry name shown in the leading tile. */
  icon?: string;
  /** One-line secondary text under the label. */
  description?: React.ReactNode;
  /** Extra terms to match against beyond the label. */
  keywords?: string | string[];
  /** Keycaps rendered on the right, e.g. ['⌘', 'K'] or 'G'. */
  shortcut?: string | string[];
  /** Right-aligned plain meta text (alternative to a shortcut), e.g. "Session". */
  meta?: React.ReactNode;
  /** Arbitrary trailing node (a VisibilityChip, Badge, …). */
  trailing?: React.ReactNode;
  /** Tints the active-row icon tile. Defaults to accent. */
  tone?: 'accent' | 'danger' | 'warning' | 'success' | 'info' | 'dm-only';
  disabled?: boolean;
  /** Invoked on Enter / click; the palette closes afterward. */
  run?: () => void;
}

export interface CommandPaletteProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  open?: boolean;
  onClose?: () => void;
  commands?: Command[];
  /** Command ids surfaced under a "Recent" section when the query is empty. */
  recentIds?: string[];
  /** Explicit section order; groups not listed fall to the end in first-seen order. */
  groupOrder?: string[];
  placeholder?: string;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  /** Show the ↑↓ / ↵ / esc hint bar. Default true. */
  showFooter?: boolean;
}

/**
 * CommandPalette — the ⌘K overlay: type to jump to any destination or fire any action. Substring
 * match over label + keywords, a Recent section on empty query, full keyboard navigation
 * (↑/↓/Home/End/Enter/Esc), and the system's selected treatment (gold tint + gold rail) on the
 * active row. Renders inline at `--z-command`; no portal.
 */
export function CommandPalette(props: CommandPaletteProps): React.ReactElement | null;
