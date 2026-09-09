/**
 * ESLint rule `no-raw-style-values` — RC-DSN-1.1.
 *
 * In `apps/gm-react/src/app` and `apps/gm-react/src/screens`, avoid hard-coded layout/color style
 * values in inline style objects. Keep spacing, radius, z-index, duration, and shadow via tokenized
 * values, and avoid raw `#hex` / `rgba(...)` when a semantic token exists.
 */

function isSpacingProperty(name) {
	if (!name) return false;
	if (name === 'gap' || name === 'borderRadius') return true;
	if (name === 'padding' || name === 'margin') return true;
	return /^padding[A-Z]/.test(name) || /^margin[A-Z]/.test(name);
}

function keyName(node) {
	if (node.type === 'Identifier') return node.name;
	if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
	return null;
}

function asLiteralString(node) {
	if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
	if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
		return node.quasis.map((part) => part.value.cooked ?? '').join('');
	}
	return null;
}

function hasVar(raw) {
	return /\bvar\([^)]*\)/.test(raw);
}

function hasRawColor(raw) {
	return /rgba?\s*\(/i.test(raw) || /#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(raw);
}

function rawSpacingFromNode(node) {
	if (node.type === 'Literal' && typeof node.value === 'number') return String(node.value);
	if (
		node.type === 'UnaryExpression' &&
		node.argument?.type === 'Literal' &&
		typeof node.argument.value === 'number'
	) {
		return `${node.operator === '-' ? '-' : ''}${node.argument.value}`;
	}
	const raw = asLiteralString(node);
	if (!raw || hasVar(raw) || hasRawColor(raw)) return null;
	if (/^var\(/i.test(raw)) return null;
	return raw.trim();
}

function isPureNumericValue(raw) {
	if (!raw) return false;
	const noUnits = raw.replace(/\s+/g, '');
	if (noUnits === '0' || noUnits === '0px' || noUnits === '0rem' || noUnits === '0em') return true;
	if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vh|vw|vmin|vmax|ch|cm|mm|in|pt|pc|q)?$/.test(noUnits))
		return false;
	return true;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Flag raw spacing and color values in inline style objects so lint-driven token migration can progress.',
		},
		schema: [
			{
				type: 'object',
				properties: {
					allow: { type: 'object', additionalProperties: { type: 'number' } },
					root: { type: 'string' },
				},
				additionalProperties: false,
			},
		],
		messages: {
			rawSpacing:
				'`{{property}}` has raw layout value {{value}} in an inline style object. Prefer token-backed values ({{recommendation}}).',
			rawColor:
				'Inline style uses raw color {{value}}. Prefer token-backed colors (for example `var(--color-...)`).',
			staleAllowance:
				'`{{file}}` allows {{allowed}} raw style values but has {{actual}}. Lower it in `scripts/eslint-rules/no-raw-style-values.allow.js` so the allow-list keeps shrinking.',
		},
	},
	create(context) {
		const options = context.options[0] ?? {};
		const allow = options.allow ?? {};
		const root = options.root ?? process.cwd();

		const filename = context.getFilename?.() ?? context.filename;
		const relative = filename.startsWith(root)
			? filename
					.slice(root.length)
					.replace(/^[\\/]/, '')
					.split('\\')
					.join('/')
			: filename.split('\\').join('/');
		const allowance = Object.prototype.hasOwnProperty.call(allow, relative) ? allow[relative] : null;

		const styleBuckets = new Map();
	const findings = [];

		function addFinding(node, data) {
			findings.push({ node, ...data });
		}

		const recommendation = {
			rawSpacing: 'use `T.space.*`/`T.radius.*` or `var(--space-...)`/`var(--radius-...)`.',
			rawColor: 'use a semantic color token or palette token.',
		};

		function inspectStyleObject(node) {
			if (!node || node.type !== 'ObjectExpression') return;
			for (const prop of node.properties) {
				if (prop.type !== 'Property') continue;
				const name = keyName(prop.key);
				if (!name) continue;

				const rawSpacing = rawSpacingFromNode(prop.value);
				if (isSpacingProperty(name) && rawSpacing !== null && isPureNumericValue(rawSpacing)) {
					addFinding(prop.value, {
						messageId: 'rawSpacing',
						property: name,
						value: JSON.stringify(rawSpacing),
						recommendation: recommendation.rawSpacing,
					});
				}

				const raw = asLiteralString(prop.value);
				if (raw && hasRawColor(raw)) {
					addFinding(prop.value, {
						messageId: 'rawColor',
						property: name,
						value: JSON.stringify(raw),
						recommendation: recommendation.rawColor,
					});
				}
			}
		}

		function unwrapStyleExpression(node) {
			if (!node) return null;
			if (node.type === 'ObjectExpression') return node;
			if (node.type === 'Identifier') return styleBuckets.get(node.name) ?? null;
			if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') {
				return unwrapStyleExpression(node.expression);
			}
			if (node.type === 'ParenthesizedExpression') return unwrapStyleExpression(node.expression);
			return null;
		}

		return {
			VariableDeclarator(node) {
				if (node.id.type !== 'Identifier') return;
				if (node.init?.type === 'ObjectExpression') {
					styleBuckets.set(node.id.name, node.init);
				}
			},
			JSXAttribute(node) {
				if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'style') return;
				const value = node.value;
				if (!value) return;
				if (value.type !== 'JSXExpressionContainer') return;
				const styleObject = unwrapStyleExpression(value.expression);
				inspectStyleObject(styleObject);
			},
			'Program:exit'() {
				if (allowance === null) {
					for (const finding of findings) context.report(finding);
					return;
				}
				// allow-list is ratcheting down; the first finding above allowance is reported.
				if (findings.length > allowance) {
					for (const finding of findings.slice(allowance)) context.report(finding);
					return;
				}
				if (findings.length < allowance) {
					context.report({
						node: context.getSourceCode().ast,
						messageId: 'staleAllowance',
						data: {
							file: relative,
							allowed: String(allowance),
							actual: String(findings.length),
						},
					});
				}
			},
		};
	},
};

export default rule;
