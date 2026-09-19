import { RuleTester } from 'eslint';
import rule from './no-positive-tabindex.js';

new RuleTester({ languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } }).run(
	'no-positive-tabindex',
	rule,
	{
		valid: [
			'<button tabIndex={0} />',
			'<button tabIndex={-1} />',
			'<button tabIndex={value} />',
			'node.tabIndex = -1',
		],
		invalid: [
			'<button tabIndex="2" />',
			'<button tabIndex={1} />',
			'<button tabIndex={+2} />',
			'({ tabIndex: 3 })',
			'node.tabIndex = 4',
			'node.setAttribute("tabindex", "5")',
		].map((code) => ({ code, errors: [{ messageId: 'positive' }] })),
	},
);
