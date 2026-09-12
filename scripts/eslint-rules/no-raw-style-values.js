/**
 * ESLint rule `no-raw-style-values` — RC-DSN-1.1.
 *
 * In `apps/gm-react/src/app` and `apps/gm-react/src/screens`, avoid hard-coded layout/color style
 * values. Keep spacing, radius, z-index, duration, and shadow via tokenized values, and avoid raw
 * `#hex` / `rgba(...)` anywhere in those trees when a semantic token exists.
 *
 * Style objects are resolved through bindings (`style={rowStyle}`, `style={styles.row}`),
 * conditionals (`style={compact ? a : b}`) and spreads, so a finding does not depend on whether the
 * object literal happens to appear before or after its JSX use site.
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

/** Static text of a template literal, with interpolations blanked out. */
function templateText(node) {
	return node.quasis.map((part) => part.value.cooked ?? '').join(' \u0000 ');
}

function hasVar(raw) {
	return /\bvar\([^)]*\)/.test(raw);
}

const RAW_COLOR = /rgba?\s*\(|#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;

function hasRawColor(raw) {
	return RAW_COLOR.test(raw);
}

function firstRawColor(raw) {
	const match = raw.match(RAW_COLOR);
	return match ? match[0] : null;
}

function unwrapTypeExpression(node) {
	let current = node;
	while (
		current &&
		(current.type === 'TSAsExpression' ||
			current.type === 'TSSatisfiesExpression' ||
			current.type === 'TSNonNullExpression' ||
			current.type === 'TSTypeAssertion' ||
			current.type === 'ParenthesizedExpression')
	) {
		current = current.expression;
	}
	return current ?? null;
}

/** A single space-separated component of a spacing value, e.g. `8px` in `padding: '8px 12px'`. */
function isNumericComponent(part) {
	return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vh|vw|vmin|vmax|ch|cm|mm|in|pt|pc|q)?$/i.test(
		part,
	);
}

function isZeroComponent(part) {
	return /^-?0(?:\.0+)?(?:px|rem|em|%|vh|vw|vmin|vmax|ch|cm|mm|in|pt|pc|q)?$/i.test(part);
}

/**
 * Raw layout values are numeric literals and CSS shorthands made entirely of numeric components,
 * including multi-value forms like `8px 12px` that a single-value check misses. Keyword forms
 * (`auto`, `inherit`), `calc(...)` and `var(...)` are left alone.
 */
function isRawSpacingValue(raw) {
	if (raw === null || raw === undefined) return false;
	const parts = raw.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0 || parts.length > 4) return false;
	if (!parts.every(isNumericComponent)) return false;
	// A lone `0` still counts as a raw literal; a shorthand of nothing but zeros does not.
	if (parts.length > 1 && parts.every(isZeroComponent)) return false;
	return true;
}

function rawSpacingFromNode(node) {
	if (!node) return null;
	if (node.type === 'Literal' && typeof node.value === 'number') return String(node.value);
	if (
		node.type === 'UnaryExpression' &&
		node.argument?.type === 'Literal' &&
		typeof node.argument.value === 'number'
	) {
		return `${node.operator === '-' ? '-' : ''}${node.argument.value}`;
	}
	const raw = asLiteralString(node);
	if (raw === null || hasVar(raw) || hasRawColor(raw)) return null;
	return raw.trim();
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Flag raw spacing and color values in app and screen sources so lint-driven token migration can progress.',
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
				'Raw color {{value}} in {{source}}. Prefer token-backed colors (for example `var(--color-...)`).',
			staleAllowance:
				'`{{file}}` allows {{allowed}} raw style values but has {{actual}}. Lower it in `scripts/eslint-rules/no-raw-style-values.allow.js` so the allow-list keeps shrinking.',
		},
	},
	create(context) {
		const options = context.options[0] ?? {};
		const allow = options.allow ?? {};
		const root = options.root ?? process.cwd();
		const sourceCode = context.sourceCode ?? context.getSourceCode();

		const filename = context.getFilename?.() ?? context.filename;
		const relative = filename.startsWith(root)
			? filename
					.slice(root.length)
					.replace(/^[\\/]/, '')
					.split('\\')
					.join('/')
			: filename.split('\\').join('/');
		const allowance = Object.prototype.hasOwnProperty.call(allow, relative)
			? allow[relative]
			: null;

		const findings = [];
		const reported = new Set();

		function addFinding(node, messageId, data) {
			const range = node.range ?? [node.start, node.end];
			const key = `${range[0]}:${range[1]}:${messageId}`;
			if (reported.has(key)) return;
			reported.add(key);
			findings.push({ node, messageId, data });
		}

		const recommendation = 'use `T.space.*`/`T.radius.*` or `var(--space-...)`/`var(--radius-...)`';

		/** Resolve an expression to the object literal(s) it can evaluate to. */
		function collectObjects(node, out, seen) {
			const current = unwrapTypeExpression(node);
			if (!current || seen.has(current) || out.length > 32) return;
			seen.add(current);
			switch (current.type) {
				case 'ObjectExpression':
					out.push(current);
					return;
				case 'ConditionalExpression':
					collectObjects(current.consequent, out, seen);
					collectObjects(current.alternate, out, seen);
					return;
				case 'LogicalExpression':
					collectObjects(current.left, out, seen);
					collectObjects(current.right, out, seen);
					return;
				case 'Identifier': {
					const init = resolveBindingInit(current);
					if (init) collectObjects(init, out, seen);
					return;
				}
				case 'MemberExpression': {
					if (current.computed) return;
					const key = keyName(current.property);
					if (!key) return;
					const owners = [];
					collectObjects(current.object, owners, seen);
					for (const owner of owners) {
						for (const prop of owner.properties) {
							if (prop.type !== 'Property') continue;
							if (keyName(prop.key) !== key) continue;
							collectObjects(prop.value, out, seen);
						}
					}
					return;
				}
				default:
			}
		}

		/**
		 * Look the identifier up through scope analysis, which is complete before this rule runs.
		 * A name map built during traversal would miss any binding declared after its use site.
		 */
		function resolveBindingInit(identifier) {
			let scope = sourceCode.getScope ? sourceCode.getScope(identifier) : null;
			while (scope) {
				const variable = scope.variables.find((entry) => entry.name === identifier.name);
				if (variable) {
					if (variable.defs.length !== 1) return null;
					const def = variable.defs[0];
					if (def.type !== 'Variable') return null;
					return def.node.init ?? null;
				}
				scope = scope.upper;
			}
			return null;
		}

		/** Raw layout values a property value can take, following conditionals. */
		function spacingValuesOf(node, out, depth) {
			const current = unwrapTypeExpression(node);
			if (!current || depth > 4) return;
			if (current.type === 'ConditionalExpression') {
				spacingValuesOf(current.consequent, out, depth + 1);
				spacingValuesOf(current.alternate, out, depth + 1);
				return;
			}
			if (current.type === 'LogicalExpression') {
				spacingValuesOf(current.left, out, depth + 1);
				spacingValuesOf(current.right, out, depth + 1);
				return;
			}
			const raw = rawSpacingFromNode(current);
			if (raw !== null && isRawSpacingValue(raw)) out.push({ node: current, raw });
		}

		function inspectStyleObject(node, seen) {
			for (const prop of node.properties) {
				if (prop.type === 'SpreadElement') {
					const spreadTargets = [];
					collectObjects(prop.argument, spreadTargets, seen);
					for (const target of spreadTargets) inspectStyleObject(target, seen);
					continue;
				}
				if (prop.type !== 'Property') continue;
				const name = keyName(prop.key);
				if (!name || !isSpacingProperty(name)) continue;
				const values = [];
				spacingValuesOf(prop.value, values, 0);
				for (const value of values) {
					addFinding(value.node, 'rawSpacing', {
						property: name,
						value: JSON.stringify(value.raw),
						recommendation,
					});
				}
			}
		}

		return {
			// Raw colors are debt wherever they appear in these trees, not only inside a style prop:
			// canvas fill styles, gradient template strings and mood tables all hard-code palette.
			Literal(node) {
				if (typeof node.value !== 'string') return;
				if (node.parent?.type === 'ImportDeclaration') return;
				const color = firstRawColor(node.value);
				if (color) {
					addFinding(node, 'rawColor', {
						value: JSON.stringify(color),
						source: 'a string literal',
					});
				}
			},
			TemplateLiteral(node) {
				const color = firstRawColor(templateText(node));
				if (color) {
					addFinding(node, 'rawColor', {
						value: JSON.stringify(color),
						source: 'a template string',
					});
				}
			},
			JSXAttribute(node) {
				if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'style') return;
				const value = node.value;
				if (!value || value.type !== 'JSXExpressionContainer') return;
				const objects = [];
				const seen = new Set();
				collectObjects(value.expression, objects, seen);
				for (const object of objects) inspectStyleObject(object, seen);
			},
			'Program:exit'() {
				if (allowance === null) {
					for (const finding of findings) context.report(finding);
					return;
				}
				// allow-list is ratcheting down; anything above the allowance is reported.
				if (findings.length > allowance) {
					for (const finding of findings.slice(allowance)) context.report(finding);
					return;
				}
				if (findings.length < allowance) {
					context.report({
						node: sourceCode.ast,
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
