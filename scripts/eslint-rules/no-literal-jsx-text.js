/**
 * ESLint rule `no-literal-jsx-text` — RC-UX-1.2.
 *
 * Every user-visible string in the GM app has to come out of a message catalog, so that a locale
 * other than English renders a translation instead of hard-coded English. This rule catches the
 * two places a literal survives a migration: text between JSX tags, and the handful of JSX
 * attributes a screen reader or tooltip reads aloud.
 *
 * It is deliberately narrow about what counts as user-visible text. Punctuation, arithmetic
 * symbols, single glyphs and bare numbers carry no language and are never flagged, so a migrated
 * screen does not have to route `·` or `%` through the catalog to satisfy the gate.
 *
 * The allow-list (`no-literal-jsx-text.allow.mjs`) is a ratchet, not an exemption list: a file on
 * it may keep at most the number of violations recorded there, and reporting fewer is itself an
 * error until the entry is lowered. That is what makes the list shrink instead of drift.
 */

const TRANSLATABLE_ATTRIBUTES = new Set([
	'alt',
	'aria-description',
	'aria-label',
	'aria-placeholder',
	'aria-roledescription',
	'aria-valuetext',
	'label',
	'placeholder',
	'title',
]);

/** Elements whose text content is code, markup or data rather than prose. */
const VERBATIM_ELEMENTS = new Set(['code', 'kbd', 'pre', 'samp', 'script', 'style', 'var']);

/**
 * Does this string carry language a translator would change?
 *
 * Anything without two consecutive letters is a symbol, a number or a single glyph — `·`, `—`,
 * `%`, `1d20`, `+`. Those read the same in every locale and routing them through a catalog would
 * make the catalog worse, not the app more translatable.
 */
function carriesLanguage(raw) {
	const text = raw.trim();
	if (text.length === 0) return false;
	return /\p{L}\p{L}/u.test(text);
}

function elementNameOf(node) {
	const name = node?.openingElement?.name;
	if (!name) return null;
	if (name.type === 'JSXIdentifier') return name.name;
	return null;
}

function insideVerbatimElement(node) {
	for (let parent = node.parent; parent; parent = parent.parent) {
		if (parent.type !== 'JSXElement') continue;
		const name = elementNameOf(parent);
		if (name && VERBATIM_ELEMENTS.has(name.toLowerCase())) return true;
	}
	return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Require user-visible JSX text and label attributes to come from the message catalog.',
		},
		schema: [
			{
				type: 'object',
				properties: {
					/** file path (repo-relative, POSIX) -> violations that file may still have. */
					allow: { type: 'object', additionalProperties: { type: 'number' } },
					/** Root the allow-list paths are relative to. */
					root: { type: 'string' },
					attributes: { type: 'boolean' },
				},
				additionalProperties: false,
			},
		],
		messages: {
			literalText:
				'Untranslated user-visible text {{text}}. Add a key to `src/i18n/messages/en.ts` and render `t(key)`.',
			literalAttribute:
				'Untranslated `{{attribute}}` text {{text}}. Add a key to `src/i18n/messages/en.ts` and pass `t(key)`.',
			staleAllowance:
				'`{{file}}` is allowed {{allowed}} untranslated string(s) but has {{actual}}. Lower it to {{actual}} in `scripts/eslint-rules/no-literal-jsx-text.allow.js` (delete the entry at 0) so the allow-list keeps shrinking.',
		},
	},
	create(context) {
		const options = context.options[0] ?? {};
		const allow = options.allow ?? {};
		const root = options.root ?? process.cwd();
		const checkAttributes = options.attributes !== false;

		const filename = context.filename ?? context.getFilename();
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

		/** Deferred so an allow-listed file can be counted before anything is reported. */
		const found = [];

		function record(node, messageId, data) {
			found.push({ node, messageId, data });
		}

		return {
			JSXText(node) {
				if (!carriesLanguage(node.value)) return;
				if (insideVerbatimElement(node)) return;
				record(node, 'literalText', { text: JSON.stringify(node.value.trim().slice(0, 40)) });
			},
			JSXAttribute(node) {
				if (!checkAttributes) return;
				if (node.name.type !== 'JSXIdentifier' && node.name.type !== 'JSXNamespacedName') return;
				const name =
					node.name.type === 'JSXIdentifier'
						? node.name.name
						: `${node.name.namespace.name}-${node.name.name.name}`;
				if (!TRANSLATABLE_ATTRIBUTES.has(name)) return;
				const value = node.value;
				let text = null;
				if (value?.type === 'Literal' && typeof value.value === 'string') text = value.value;
				else if (
					value?.type === 'JSXExpressionContainer' &&
					value.expression.type === 'Literal' &&
					typeof value.expression.value === 'string'
				)
					text = value.expression.value;
				if (text === null || !carriesLanguage(text)) return;
				record(node, 'literalAttribute', {
					attribute: name,
					text: JSON.stringify(text.trim().slice(0, 40)),
				});
			},
			'Program:exit'(program) {
				if (allowance === null) {
					for (const finding of found) context.report(finding);
					return;
				}
				if (found.length > allowance) {
					// Report the ones over budget, newest last, so the message points at real text.
					for (const finding of found.slice(allowance)) context.report(finding);
					return;
				}
				if (found.length < allowance) {
					context.report({
						node: program,
						messageId: 'staleAllowance',
						data: { file: relative, allowed: String(allowance), actual: String(found.length) },
					});
				}
			},
		};
	},
};

export default rule;
