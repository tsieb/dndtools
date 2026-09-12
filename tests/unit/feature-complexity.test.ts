import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { SECTION_FEATURE_GATES, isFeatureVisible } from '../../packages/core/src/state/onboarding';
import { en } from '../../apps/gm-react/src/i18n/messages/en';
import { renderFeatureComplexity } from '../../scripts/feature-complexity';

const settings = resolve('apps/gm-react/src/screens/settings');
const keys = new Set(SECTION_FEATURE_GATES.map((gate) => gate.labelKey));
function parse(path: string) {
	return ts.createSourceFile(
		path,
		readFileSync(path, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
}
function visit(node: ts.Node, fn: (node: ts.Node) => void) {
	fn(node);
	ts.forEachChild(node, (child) => visit(child, fn));
}
/** Read the actual JSX, including conditional labels; never derive expectations from gate data. */
function sectionLabels(source: ts.SourceFile): string[] {
	const labels: string[] = [];
	visit(source, (node) => {
		if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
		const tag = node.tagName.getText(source);
		if (!['Panel', 'SetRow', 'Section'].includes(tag)) return;
		const prop = tag === 'SetRow' ? 'label' : 'title';
		const attr = node.attributes.properties.find(
			(p) => ts.isJsxAttribute(p) && p.name.getText(source) === prop,
		);
		if (!attr || !ts.isJsxAttribute(attr) || !attr.initializer)
			throw new Error(`Unclassified ${tag} in ${source.fileName}`);
		const found: string[] = [];
		visit(attr.initializer, (child) => {
			if (ts.isStringLiteral(child) && child.text.startsWith('settings.')) found.push(child.text);
		});
		if (!found.length)
			throw new Error(`Dynamic ${tag} label needs an explicit inventory in ${source.fileName}`);
		labels.push(...found);
	});
	return labels;
}

describe('RC-UX-5.1 feature complexity inventory', () => {
	it('enumerates every actual Settings tab and section, including conditional panels and rows', () => {
		const shell = parse(resolve(settings, 'index.tsx'));
		const tabs: { id: string; label: string }[] = [];
		visit(shell, (node) => {
			if (!ts.isVariableDeclaration(node) || node.name.getText(shell) !== 'SETTINGS_NAV') return;
			if (!node.initializer || !ts.isArrayLiteralExpression(node.initializer))
				throw new Error('Enumerate the new Settings navigation structure');
			for (const entry of node.initializer.elements) {
				if (!ts.isObjectLiteralExpression(entry)) throw new Error('Unclassified Settings tab');
				const literal = (name: string) => {
					const prop = entry.properties.find(
						(p) => ts.isPropertyAssignment(p) && p.name.getText(shell) === name,
					);
					if (!prop || !ts.isPropertyAssignment(prop) || !ts.isStringLiteral(prop.initializer))
						throw new Error(`Settings tab needs a literal ${name}`);
					return prop.initializer.text;
				};
				tabs.push({ id: literal('id'), label: literal('label') });
			}
		});
		expect(tabs.length).toBeGreaterThan(0);
		for (const tab of tabs) {
			const gate = SECTION_FEATURE_GATES.find((entry) => entry.labelKey === tab.label);
			expect(gate, tab.id).toBeDefined();
			expect(gate?.surface).toBe(`/settings?tab=${tab.id}`);
		}
		let sections = 0;
		for (const file of readdirSync(settings).filter(
			(file) =>
				file.endsWith('.tsx') &&
				!file.includes('.test.') &&
				!['index.tsx', 'shared.tsx'].includes(file),
		)) {
			for (const key of sectionLabels(parse(resolve(settings, file)))) {
				expect(keys.has(key), `${file}: missing section gate for ${key}`).toBe(true);
				sections++;
			}
		}
		expect(sections).toBeGreaterThan(50);
	});

	it('covers both builders and every map tool declared by the UI', () => {
		for (const file of [
			'app/widgetBuilder/draft.ts',
			'app/systemBuilder/draft.ts',
			'app/map/tools.ts',
		]) {
			const source = parse(resolve('apps/gm-react/src', file));
			visit(source, (node) => {
				if (
					ts.isStringLiteral(node) &&
					/^(builder\.step\.|systemBuilder\.step\.|mapTool\..+\.label$)/.test(node.text)
				)
					expect(keys.has(node.text), node.text).toBe(true);
			});
		}
	});

	it('covers Extensions and Community tabs from their actual navigation declarations', () => {
		for (const area of ['extensions', 'community']) {
			const source = parse(resolve('apps/gm-react/src/screens', area, 'index.tsx'));
			const labels: string[] = [];
			visit(source, (node) => {
				if (ts.isStringLiteral(node) && node.text.startsWith(`${area}.tab.`))
					labels.push(node.text);
			});
			expect(labels.length).toBeGreaterThan(0);
			for (const label of labels) expect(keys.has(label), label).toBe(true);
		}
	});

	it('detects new and conditional JSX sections independently of the inventory', () => {
		const source = ts.createSourceFile(
			'new-section.tsx',
			`<><Panel title={t('settings.new.title')} /><SetRow label={t(flag ? 'settings.new.on' : 'settings.new.off')} /></>`,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX,
		);
		const discovered = sectionLabels(source);
		expect(discovered).toEqual(['settings.new.title', 'settings.new.on', 'settings.new.off']);
		expect(discovered.filter((key) => !keys.has(key))).toEqual(discovered);
	});

	it('has unique stable gates, real translation keys and knowledge/risk reasons', () => {
		expect(new Set(SECTION_FEATURE_GATES.map((gate) => gate.id)).size).toBe(
			SECTION_FEATURE_GATES.length,
		);
		expect(
			new Set(SECTION_FEATURE_GATES.map((gate) => `${gate.surface}#${gate.sectionAnchor}`)).size,
		).toBe(SECTION_FEATURE_GATES.length);
		for (const gate of SECTION_FEATURE_GATES) {
			expect(en).toHaveProperty(gate.labelKey);
			expect(gate.assumes.length).toBeGreaterThan(15);
			expect(gate.misuse.length).toBeGreaterThan(15);
			expect(['core', 'intermediate', 'advanced']).toContain(gate.minTier);
		}
	});

	it('classifies Private E2EE as advanced and hides it below advanced', () => {
		expect(SECTION_FEATURE_GATES.find((gate) => gate.id === 'private-e2ee')?.minTier).toBe(
			'advanced',
		);
		expect(isFeatureVisible('private-e2ee', 'core', SECTION_FEATURE_GATES)).toBe(false);
		expect(isFeatureVisible('private-e2ee', 'intermediate', SECTION_FEATURE_GATES)).toBe(false);
		expect(isFeatureVisible('private-e2ee', 'advanced', SECTION_FEATURE_GATES)).toBe(true);
	});

	it('keeps the reference document byte-for-byte equal to the declared data', () => {
		expect(readFileSync('docs/reference/FEATURE_COMPLEXITY.md', 'utf8')).toBe(
			renderFeatureComplexity(),
		);
	});
});
