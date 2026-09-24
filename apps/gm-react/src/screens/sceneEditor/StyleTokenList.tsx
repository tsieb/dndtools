import type { CSSProperties } from 'react';
import { resolveWidgetStyleVariables } from '@dndtools/core';
import { SEMANTIC_TOKEN_VALUES } from '../../app/widgetBuilder/vocabulary';
import type { BoardWidget } from '../../app/board-helpers';
import { useI18n } from '../../i18n';
import { Section } from './fields';

const COLUMN: CSSProperties = { display: 'flex', flexDirection: 'column', minWidth: 0 };

/**
 * RC-WID-2.4 — the `--widget-*` tokens a package declared, in the Inspector's Style tab. A system
 * widget's default accent/text pair is consumed by no host body, so listing it would present knobs
 * that do nothing; the group shows what a package AUTHOR declared. Split out of `Inspector.tsx`.
 */
export function StyleTokenList({ widget }: { widget: BoardWidget }) {
	const { t } = useI18n();
	const styleTokens = widget.tier === 'system' ? [] : (widget.styleTokens ?? []);
	if (styleTokens.length === 0) return null;
	// Resolved the way the frame resolves them (instance overrides included), and set on the group so
	// each swatch reads the same `var()` the placed widget does and re-themes with `data-theme`.
	const styleVariables = resolveWidgetStyleVariables(
		{ style: { isolation: 'host-scoped', tokens: styleTokens } },
		widget.configuration,
	);
	const valueLabel = (value: string) => {
		const semantic = SEMANTIC_TOKEN_VALUES.find((option) => option.value === value);
		return semantic ? t(semantic.label) : value;
	};
	return (
		<Section label={t('builder.style.title')}>
			<div
				role="list"
				aria-label={t('builder.style.tokens')}
				data-testid="widget-inspector-style"
				style={{ ...COLUMN, gap: 'var(--space-2)', ...styleVariables } as CSSProperties}
			>
				{styleTokens.map((token) => {
					const variable = `--widget-${token.name}`;
					return (
						<div
							key={token.name}
							role="listitem"
							style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
						>
							<span
								aria-hidden="true"
								data-testid={`widget-style-swatch-${token.name}`}
								style={{
									width: 16,
									height: 16,
									flex: '0 0 auto',
									borderRadius: 'var(--radius-sm)',
									border: '1px solid var(--color-border)',
									background: `var(${variable})`,
								}}
							/>
							<div style={{ ...COLUMN, gap: 'var(--space-1)' }}>
								<span
									style={{
										font: '600 var(--text-xs) var(--font-mono)',
										color: 'var(--color-text-primary)',
										overflowWrap: 'anywhere',
									}}
								>
									{variable}
								</span>
								<span
									style={{
										font: 'var(--text-xs) var(--font-sans)',
										color: 'var(--color-text-secondary)',
									}}
								>
									{valueLabel(styleVariables[variable] ?? token.value)}
								</span>
								{token.description && (
									<span
										style={{
											font: 'var(--text-xs)/1.4 var(--font-sans)',
											color: 'var(--color-text-secondary)',
										}}
									>
										{token.description}
									</span>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</Section>
	);
}
