import type { PopoverProps } from '../core/Popover';

export interface MenuProps extends Omit<PopoverProps, 'role'> {
	/** Forwarded to the role="menu" wrapper. */
	role?: never;
}

import React from 'react';
import { Popover } from './Popover';

/** Action menu. Popover owns dismissal/focus return; children supply menuitem roles. */
export function Menu({ open = true, width = 320, title, children, onKeyDown, ...rest }: MenuProps) {
	function navigate(event: React.KeyboardEvent<HTMLDivElement>) {
		onKeyDown?.(event);
		if (event.defaultPrevented) return;
		const items = Array.from(
			event.currentTarget.querySelectorAll<HTMLElement & { disabled?: boolean }>(
				'[role^="menuitem"]',
			),
		).filter((item) => !item.disabled && item.getAttribute('aria-disabled') !== 'true');
		const index = items.indexOf(document.activeElement as HTMLElement);
		let next;
		if (event.key === 'ArrowDown') next = (index + 1) % items.length;
		else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = items.length - 1;
		else return;
		event.preventDefault();
		items[next]?.focus();
	}
	return (
		<Popover open={open} width={width} title={title} {...rest}>
			<div
				role="menu"
				aria-label={typeof title === 'string' ? title : undefined}
				onKeyDown={navigate}
			>
				{children}
			</div>
		</Popover>
	);
}
