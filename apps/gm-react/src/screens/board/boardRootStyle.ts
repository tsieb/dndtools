import type { CSSProperties } from 'react';
import { PHONE_TEXT_FLOOR } from '../../app/canvas/PhoneNavigator';

/** RC-POL-1.2 — the board root's box, out of `Board.tsx`. */
export function boardRootStyle(phone: boolean, stacked: boolean): CSSProperties {
	return {
		display: 'flex',
		flexDirection: 'column',
		gap: 'var(--space-3)',
		// `<main>` is ALREADY the bounded pane: `flex:1; min-height:0; overflow-y:auto`
		// (AppShell.tsx), i.e. the viewport minus the top bar and, on a phone, minus the tab
		// bar. Sizing off `--app-viewport-height` measured from the WHOLE window instead, so a
		// constant allowance could only ever be right at one window size — desktop overflowed
		// `<main>` by ~43px (a second, nested scrollbar) while a phone left space unused.
		// `100%` tracks the pane exactly at every size. Locked by responsive.spec.ts.
		height: '100%',
		minHeight: stacked ? 0 : 360,
		// `/board` and `/scene/:id` are the only two screens that bypass `<Page>`, so without
		// this they rendered flush against the pane edges — heading, toolbar and the canvas's
		// own rounded border all touching, so the border read as a crop. `border-box` keeps
		// `height:'100%'` exact.
		// NOT on phone: the bounded canvas derives its fit scale from the AVAILABLE WIDTH
		// (SceneBoardCanvas `boundedScale`), which on a 375px handset is already ~0.45 and too
		// small to read. A gutter there would shrink it further to buy whitespace it cannot
		// afford — and it measurably tipped the phone board out of its own scroll range.
		boxSizing: 'border-box',
		padding: phone ? 'var(--space-0)' : 'var(--space-4) var(--space-6)',
		...(phone && PHONE_TEXT_FLOOR),
	};
}
