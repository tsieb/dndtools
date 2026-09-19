/** Keep keyboard order aligned with DOM order; never reorder it with a positive tabindex. */
export default {
	meta: {
		type: 'problem',
		schema: [],
		messages: { positive: 'Use tabIndex 0 or -1; positive values break document focus order.' },
	},
	create(context) {
		function check(node, value) {
			if (value?.type === 'JSXExpressionContainer') value = value.expression;
			if (value?.type === 'UnaryExpression' && value.operator === '+') value = value.argument;
			if (value?.type === 'Literal' && Number(value.value) > 0)
				context.report({ node, messageId: 'positive' });
		}
		return {
			JSXAttribute(node) {
				if (node.name.name?.toLowerCase() === 'tabindex') check(node, node.value);
			},
			Property(node) {
				if ((node.key.name ?? node.key.value)?.toLowerCase?.() === 'tabindex')
					check(node, node.value);
			},
			AssignmentExpression(node) {
				if (
					node.left.type === 'MemberExpression' &&
					(node.left.property.name ?? node.left.property.value)?.toLowerCase?.() === 'tabindex'
				)
					check(node, node.right);
			},
			CallExpression(node) {
				if (
					node.callee.type === 'MemberExpression' &&
					node.callee.property.name === 'setAttribute' &&
					node.arguments[0]?.value?.toLowerCase?.() === 'tabindex'
				)
					check(node, node.arguments[1]);
			},
		};
	},
};
