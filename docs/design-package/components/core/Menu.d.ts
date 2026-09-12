import * as React from 'react';
import { PopoverProps } from '../core/Popover.d.ts';

export interface MenuProps extends Omit<PopoverProps, 'role'> {
  /** Forwarded to the role="menu" wrapper. */
  role?: never;
}

/** Menu — role="menu" wrapper around Popover. */
export function Menu(props: MenuProps): React.ReactElement;
