export interface TimelineEntry {
	time?: React.ReactNode;
	title: React.ReactNode;
	detail?: React.ReactNode;
	/** Semantic Icon name for the node. */
	icon?: string;
	tone?: 'default' | 'accent' | 'success' | 'warning' | 'error' | 'info';
	/** Emphasize this node (most recent beat). */
	active?: boolean;
}

export interface SessionTimelineProps extends React.HTMLAttributes<HTMLOListElement> {
	entries: TimelineEntry[];
	/** Arc strip for campaign prep; the default log remains suitable for live feeds. */
	layout?: 'log' | 'arc';
}

import React from 'react';
import { Icon } from '../core/Icon';

const TONES = {
	default: 'var(--color-border-strong)',
	accent: 'var(--color-accent)',
	success: 'var(--color-status-success)',
	warning: 'var(--color-status-warning)',
	error: 'var(--color-status-error)',
	info: 'var(--color-status-info)',
};

/**
 * SessionTimeline — a vertical log of what happened: the recap rail in the Campaign section and the
 * live event feed during a session. Each entry is a node on a connecting line with a mono
 * timestamp, a title, and optional detail; `tone` + `icon` mark the kind of beat (combat, loot,
 * NPC, milestone). The most recent entry can be emphasized with `active`. Reads top-down, newest
 * first or oldest first — you order the array.
 */
export function SessionTimeline({
	entries = [],
	layout = 'log',
	style,
	...rest
}: SessionTimelineProps) {
	const arc = layout === 'arc';
	return (
		<ol
			tabIndex={arc ? 0 : undefined}
			style={{
				margin: 0,
				padding: arc ? 'var(--space-1)' : 0,
				listStyle: 'none',
				display: arc ? 'flex' : undefined,
				overflowX: arc ? 'auto' : undefined,
				...style,
			}}
			{...rest}
		>
			{entries.map((e, i) => {
				const last = i === entries.length - 1;
				const color = TONES[e.tone!] || TONES.default;
				const active = e.active;
				return (
					<li
						key={i}
						aria-current={active ? 'step' : undefined}
						style={{
							display: 'grid',
							gridTemplateColumns: arc ? '1fr' : '28px 1fr',
							flex: arc ? '0 0 min(240px, 85%)' : undefined,
							minWidth: 0,
							columnGap: 'var(--space-3)',
						}}
					>
						<div
							style={{
								display: 'flex',
								flexDirection: arc ? 'row' : 'column',
								alignItems: 'center',
							}}
						>
							<span
								style={{
									width: 28,
									height: 28,
									flex: '0 0 auto',
									borderRadius: 'var(--radius-full)',
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: active ? color : 'var(--color-surface)',
									color: active ? 'var(--color-accent-foreground)' : color,
									border: `2px solid ${color}`,
									boxShadow: active ? 'var(--shadow-sm)' : 'none',
								}}
							>
								<Icon name={e.icon || 'recent'} size={14} aria-hidden="true" />
							</span>
							{!last && (
								<span
									aria-hidden="true"
									style={{
										flex: 1,
										width: arc ? undefined : 2,
										height: arc ? 2 : undefined,
										minHeight: arc ? undefined : 16,
										background: 'var(--color-border)',
										margin: '2px 0',
									}}
								/>
							)}
						</div>
						<div
							style={{
								paddingBottom: arc || last ? 0 : 'var(--space-4)',
								paddingTop: arc ? 'var(--space-3)' : undefined,
								paddingRight: arc ? 'var(--space-4)' : undefined,
								minWidth: 0,
								overflowWrap: 'anywhere',
							}}
						>
							{e.time && (
								<div
									style={{
										fontFamily: 'var(--font-mono)',
										fontSize: 'var(--text-2xs)',
										letterSpacing: 'var(--tracking-wide)',
										textTransform: 'uppercase',
										color: 'var(--color-text-tertiary)',
										marginBottom: 1,
									}}
								>
									{e.time}
								</div>
							)}
							<div
								style={{
									fontFamily: 'var(--font-sans)',
									fontSize: 'var(--text-base)',
									fontWeight: 'var(--font-weight-semibold)',
									color: 'var(--color-text-primary)',
									lineHeight: 1.3,
								}}
							>
								{e.title}
							</div>
							{e.detail && (
								<p
									style={{
										margin: '2px 0 0',
										fontFamily: 'var(--font-sans)',
										fontSize: 'var(--text-sm)',
										lineHeight: 1.5,
										color: 'var(--color-text-secondary)',
									}}
								>
									{e.detail}
								</p>
							)}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
