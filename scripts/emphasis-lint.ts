import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// RC-ENG-8.4 emphasis and display-face lint.
//
// Two design rules the screens break today, checked statically over the GM app's source
// (`apps/gm-react/src`, tests excluded). Both read inline styles and DS props; neither renders.
//
//   display-face-below-24px    The display face (Cinzel: `--font-display`, screen-kit's `T.disp`)
//                              starts at --text-xl, 24px (styles/tokens/typography.css). Flags a
//                              style object whose `font` shorthand, or `fontFamily` + `fontSize`,
//                              sets it smaller. A size it cannot resolve (`${size}px`, `em`, an
//                              inherited size) is skipped, never guessed.
//
//   multiple-accent-primaries  "One primary (gold) action per region" (ds Button.jsx). Counts the
//                              accent-filled primaries that can show at once inside one region:
//                              `<Button variant="primary">`, `<SegmentedControl>` (its active
//                              segment is the gold fill) and a `<button>`/`<a>` whose inline
//                              background is the accent. The subtle accent (Button/IconButton
//                              `variant="accent"`, screen-kit `Seg`) is a tint, not a fill.
//
// A region is what the user sees as one surface: a screen, or a layer on top of it (Dialog, Modal,
// Sheet, Popover, Menu, a `<dialog>`/`<nav>`/`<aside>`, their ARIA roles, a Route). Cards, panels
// and headers inside a screen are not regions of their own — Session in Standby's Go live (a Card)
// and Build encounter (a Panel) sit on one screen. Components compose: a child that exposes a
// primary adds one to its parent's region (the child reports its own surplus itself), so the
// screen is judged across files. Alternatives never shown together are not summed: the branches
// of a ternary or if/else, an early return, switch cases, and sibling `tab === 'x' && …` panes.
//
// The lint warns on every finding and fails only when a file's count for a rule rises above
// scripts/emphasis-baseline.json. The baseline may only shrink: a fix does not have to touch it
// (the stories that fix these findings do not own it), and `--write` refuses to raise an entry.
// Run `pnpm lint:emphasis --write` to lower the entries after a fix; `--quiet` prints only
// regressions.

export const RULES = ['display-face-below-24px', 'multiple-accent-primaries'] as const;
export type RuleId = (typeof RULES)[number];

export interface Finding {
	rule: RuleId;
	/** Repo-relative, forward slashes. */
	file: string;
	line: number;
	message: string;
	/** What the finding adds to its file's count: 1, or a region's surplus primaries. */
	weight: number;
}

export interface EmphasisLintRoots {
	repoRoot: string;
	srcRoot: string;
	typographyFile: string;
	baselineFile: string;
}

/** rule → repo-relative file → count. */
export type Baseline = Record<RuleId, Record<string, number>>;

export interface BaselineDelta {
	rule: RuleId;
	file: string;
	count: number;
	allowed: number;
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function defaultRoots(repoRoot: string = REPO_ROOT): EmphasisLintRoots {
	const srcRoot = path.join(repoRoot, 'apps', 'gm-react', 'src');
	return {
		repoRoot,
		srcRoot,
		typographyFile: path.join(srcRoot, 'styles', 'tokens', 'typography.css'),
		baselineFile: path.join(repoRoot, 'scripts', 'emphasis-baseline.json'),
	};
}

// --- display face ---------------------------------------------------------------------------

const DISPLAY_MIN_PX = 24;
const REM_PX = 16;
const MAX_VARIANTS = 32;
/** Stands in for any part of a style value the lint cannot evaluate statically. */
const UNKNOWN = '\u0000';
const DISPLAY_FACE = /--font-display|\bCinzel\b/i;
const DISPLAY_FACE_START = /var\(\s*--font-display|['"]?\bCinzel\b/i;
// screen-kit's `T` aliases (app/screen-kit.tsx), which most screens use instead of the var() form.
const T_ALIASES: Record<string, string> = {
	disp: 'var(--font-display)',
	sans: 'var(--font-sans)',
	mono: 'var(--font-mono)',
};

// --- emphasis -------------------------------------------------------------------------------

type ElementCheck = (element: ts.JsxOpeningLikeElement) => boolean;

// DS props that paint a solid accent fill, keyed by tag name.
const PRIMARY_PROPS = new Map<string, { label: string; check: ElementCheck }>([
	[
		'Button',
		{ label: '<Button variant="primary">', check: (el) => attrCanBe(el, 'variant', 'primary') },
	],
	['SegmentedControl', { label: '<SegmentedControl> (active segment)', check: () => true }],
]);
const INTERACTIVE_TAGS = new Set(['button', 'a']);
const INTERACTIVE_ROLES = new Set([
	'button',
	'link',
	'tab',
	'radio',
	'switch',
	'checkbox',
	'menuitem',
	'menuitemradio',
	'option',
]);
const ACCENT_FILL = /^var\(\s*--color-accent\s*(?:,[^)]*)?\)$/;
const BOUNDARY_COMPONENTS = new Set([
	'Dialog',
	'Modal',
	'Sheet',
	'BottomSheet',
	'Drawer',
	'Popover',
	'Menu',
	'Overlay',
	'Route',
]);
const BOUNDARY_TAGS = new Set(['dialog', 'nav', 'aside']);
const BOUNDARY_ROLES = new Set(['dialog', 'alertdialog', 'menu', 'navigation', 'complementary']);

// --- source model ---------------------------------------------------------------------------

type FunctionLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

interface Component {
	name: string;
	fn: FunctionLike;
	module: Module;
}

interface Scope {
	name: string;
	fn: FunctionLike;
	component?: Component;
}

interface Module {
	file: string;
	rel: string;
	sf: ts.SourceFile;
	/** Name → first component of that name (for JSX tag resolution). */
	components: Map<string, Component>;
	componentFns: Set<ts.Node>;
	/** Every component plus top-level lowercase render helpers: the units a finding is judged in. */
	scopes: Scope[];
	importSpecs: Map<string, { spec: string; name: string }>;
	imports: Map<string, { file: string; name: string }>;
	exports: Map<string, string>;
	reexportSpecs: { spec: string; names?: Map<string, string> }[];
	reexports: { file: string; names?: Map<string, string> }[];
}

interface Contributor {
	line: number;
	label: string;
}

interface Exposure {
	count: number;
	contributors: Contributor[];
}

const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

function isUpper(name: string): boolean {
	return /^[A-Z]/.test(name);
}

/** Code-unit order, so `--write` produces the same file on every machine and locale. */
function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
	return (
		ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false)
	);
}

function skipOuter(node: ts.Expression): ts.Expression {
	let current = node;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isSatisfiesExpression(current) ||
		ts.isNonNullExpression(current) ||
		ts.isTypeAssertionExpression(current)
	) {
		current = current.expression;
	}
	return current;
}

/** `memo(forwardRef(() => …))` → the inner function; a bare arrow/function expression → itself. */
function unwrapFunction(
	node: ts.Expression | undefined,
	throughCalls: boolean,
): FunctionLike | undefined {
	let current = node;
	while (current) {
		current = skipOuter(current);
		if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) return current;
		if (throughCalls && ts.isCallExpression(current) && current.arguments.length > 0) {
			current = current.arguments[0];
			continue;
		}
		return undefined;
	}
	return undefined;
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
	return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function scriptKind(file: string): ts.ScriptKind {
	if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
	if (file.endsWith('.ts')) return ts.ScriptKind.TS;
	return ts.ScriptKind.JSX;
}

function walk(dir: string, files: string[] = []): string[] {
	if (!fs.existsSync(dir)) return files;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'dist')
			continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, files);
		else if (
			/\.(tsx|ts|jsx|js)$/.test(entry.name) &&
			!/\.(test|spec)\.[jt]sx?$/.test(entry.name) &&
			!entry.name.endsWith('.d.ts')
		) {
			files.push(full);
		}
	}
	return files;
}

function buildModule(file: string, repoRoot: string): Module {
	const sf = ts.createSourceFile(
		file,
		fs.readFileSync(file, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		scriptKind(file),
	);
	const mod: Module = {
		file,
		rel: path.relative(repoRoot, file).split(path.sep).join('/'),
		sf,
		components: new Map(),
		componentFns: new Set(),
		scopes: [],
		importSpecs: new Map(),
		imports: new Map(),
		exports: new Map(),
		reexportSpecs: [],
		reexports: [],
	};
	const addComponent = (name: string, fn: FunctionLike) => {
		const component: Component = { name, fn, module: mod };
		if (!mod.components.has(name)) mod.components.set(name, component);
		mod.componentFns.add(fn);
		mod.scopes.push({ name, fn, component });
	};
	const visit = (node: ts.Node) => {
		if (ts.isFunctionDeclaration(node) && node.name && node.body && isUpper(node.name.text)) {
			addComponent(node.name.text, node);
		} else if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			isUpper(node.name.text)
		) {
			const fn = unwrapFunction(node.initializer, true);
			if (fn) addComponent(node.name.text, fn);
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);

	for (const statement of sf.statements) {
		if (ts.isFunctionDeclaration(statement)) {
			const name = statement.name?.text ?? 'default';
			if (statement.body && !isUpper(name)) mod.scopes.push({ name, fn: statement });
			if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
				mod.exports.set(
					hasModifier(statement, ts.SyntaxKind.DefaultKeyword) ? 'default' : name,
					name,
				);
			}
		} else if (ts.isVariableStatement(statement)) {
			const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
			for (const decl of statement.declarationList.declarations) {
				if (!ts.isIdentifier(decl.name)) continue;
				const name = decl.name.text;
				if (exported) mod.exports.set(name, name);
				const fn = isUpper(name) ? undefined : unwrapFunction(decl.initializer, false);
				if (fn) mod.scopes.push({ name, fn });
			}
		} else if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
			const spec = statement.moduleSpecifier.text;
			const clause = statement.importClause;
			if (!clause || clause.isTypeOnly) continue;
			if (clause.name) mod.importSpecs.set(clause.name.text, { spec, name: 'default' });
			if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
				for (const element of clause.namedBindings.elements) {
					const imported = (element.propertyName ?? element.name).text;
					mod.importSpecs.set(element.name.text, { spec, name: imported });
				}
			}
		} else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
			const names = new Map<string, string>();
			if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
				for (const element of statement.exportClause.elements) {
					names.set(element.name.text, (element.propertyName ?? element.name).text);
				}
			}
			if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
				mod.reexportSpecs.push({
					spec: statement.moduleSpecifier.text,
					names: statement.exportClause ? names : undefined,
				});
			} else {
				for (const [exported, local] of names) mod.exports.set(exported, local);
			}
		} else if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
			mod.exports.set('default', statement.expression.text);
		}
	}
	return mod;
}

// --- evaluation helpers ---------------------------------------------------------------------

/** Every string a style value can take; unevaluable parts become UNKNOWN. */
function evaluate(node: ts.Expression): string[] {
	const e = skipOuter(node);
	if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
	if (ts.isNumericLiteral(e)) return [e.text];
	if (ts.isConditionalExpression(e)) {
		return [...evaluate(e.whenTrue), ...evaluate(e.whenFalse)].slice(0, MAX_VARIANTS);
	}
	if (ts.isTemplateExpression(e)) {
		let variants = [e.head.text];
		for (const span of e.templateSpans) {
			const parts = evaluate(span.expression);
			variants = variants
				.flatMap((prefix) => parts.map((part) => prefix + part + span.literal.text))
				.slice(0, MAX_VARIANTS);
		}
		return variants;
	}
	if (
		ts.isPropertyAccessExpression(e) &&
		ts.isIdentifier(e.expression) &&
		e.expression.text === 'T'
	) {
		const alias = T_ALIASES[e.name.text];
		if (alias) return [alias];
	}
	return [UNKNOWN];
}

/** Split on whitespace outside parentheses, so `clamp(30px, 5vw, 76px)` stays one token. */
function splitTopLevel(value: string): string[] {
	const tokens: string[] = [];
	let depth = 0;
	let current = '';
	for (const char of value) {
		if (char === '(') depth += 1;
		if (char === ')') depth -= 1;
		if (/\s/.test(char) && depth === 0) {
			if (current) tokens.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	if (current) tokens.push(current);
	return tokens;
}

/** A CSS length in px, or undefined when it cannot be resolved statically. */
export function cssSizePx(
	token: string,
	textTokens: Map<string, number>,
	bareIsPx = false,
): number | undefined {
	const value = token.trim();
	if (value.includes(UNKNOWN)) return undefined;
	let match: RegExpExecArray | null;
	if (bareIsPx && (match = /^(\d*\.?\d+)$/.exec(value))) return Number(match[1]);
	if ((match = /^(\d*\.?\d+)px$/.exec(value))) return Number(match[1]);
	if ((match = /^(\d*\.?\d+)rem$/.exec(value))) return Number(match[1]) * REM_PX;
	if ((match = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value))) {
		const known = textTokens.get(match[1]);
		if (known !== undefined) return known;
		return match[2] ? cssSizePx(match[2], textTokens) : undefined;
	}
	// clamp() never renders below its minimum.
	if ((match = /^clamp\(([^,]+),/.exec(value))) return cssSizePx(match[1], textTokens);
	return undefined;
}

/** The font-size of a `font` shorthand that names the display face. */
function shorthandSizePx(value: string, textTokens: Map<string, number>): number | undefined {
	const at = value.search(DISPLAY_FACE_START);
	if (at < 0) return undefined;
	// The slash may have whitespace on either side. Ignore the entire line-height,
	// while retaining slashes nested in CSS functions.
	const prefix = value.slice(0, at);
	let depth = 0;
	let end = prefix.length;
	for (let i = 0; i < prefix.length; i += 1) {
		if (prefix[i] === '(') depth += 1;
		if (prefix[i] === ')') depth -= 1;
		if (prefix[i] === '/' && depth === 0) {
			end = i;
			break;
		}
	}
	const size = splitTopLevel(prefix.slice(0, end)).at(-1);
	if (!size) return undefined;
	return cssSizePx(size, textTokens);
}

export function loadTextTokens(typographyFile: string): Map<string, number> {
	const tokens = new Map<string, number>();
	if (!fs.existsSync(typographyFile)) return tokens;
	const css = fs.readFileSync(typographyFile, 'utf8');
	for (const match of css.matchAll(/(--text-[\w-]+)\s*:\s*(\d*\.?\d+)(rem|px)\s*;/g)) {
		tokens.set(match[1], Number(match[2]) * (match[3] === 'rem' ? REM_PX : 1));
	}
	return tokens;
}

function propertyName(name: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
	return undefined;
}

function jsxAttribute(
	element: ts.JsxOpeningLikeElement,
	name: string,
): ts.JsxAttribute | undefined {
	for (const attr of element.attributes.properties) {
		if (ts.isJsxAttribute(attr) && attr.name.getText() === name) return attr;
	}
	return undefined;
}

/** String literals an expression can produce (through ternaries and `||`/`??`). */
function literalLeaves(node: ts.Expression): string[] {
	const e = skipOuter(node);
	if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
	if (ts.isConditionalExpression(e))
		return [...literalLeaves(e.whenTrue), ...literalLeaves(e.whenFalse)];
	if (
		ts.isBinaryExpression(e) &&
		(e.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
			e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
	) {
		return [...literalLeaves(e.left), ...literalLeaves(e.right)];
	}
	return [];
}

function attrLeaves(element: ts.JsxOpeningLikeElement, name: string): string[] {
	const init = jsxAttribute(element, name)?.initializer;
	if (!init) return [];
	if (ts.isStringLiteral(init)) return [init.text];
	if (ts.isJsxExpression(init) && init.expression) return literalLeaves(init.expression);
	return [];
}

function attrCanBe(element: ts.JsxOpeningLikeElement, name: string, value: string): boolean {
	return attrLeaves(element, name).includes(value);
}

function canBeAccentFill(node: ts.Expression): boolean {
	const e = skipOuter(node);
	if (ts.isConditionalExpression(e))
		return canBeAccentFill(e.whenTrue) || canBeAccentFill(e.whenFalse);
	if (ts.isPropertyAccessExpression(e)) return e.getText() === 'T.acc';
	if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
		return ACCENT_FILL.test(e.text.trim());
	return false;
}

function hasInlineAccentFill(element: ts.JsxOpeningLikeElement): boolean {
	const init = jsxAttribute(element, 'style')?.initializer;
	if (!init || !ts.isJsxExpression(init) || !init.expression) return false;
	const style = skipOuter(init.expression);
	if (!ts.isObjectLiteralExpression(style)) return false;
	return style.properties.some((prop) => {
		if (!ts.isPropertyAssignment(prop)) return false;
		const name = propertyName(prop.name);
		return (
			(name === 'background' || name === 'backgroundColor') && canBeAccentFill(prop.initializer)
		);
	});
}

function tagOf(element: ts.JsxOpeningLikeElement): { name: string; member: boolean } | undefined {
	const tag = element.tagName;
	if (ts.isIdentifier(tag)) return { name: tag.text, member: false };
	if (ts.isPropertyAccessExpression(tag)) return { name: tag.name.text, member: true };
	return undefined;
}

function isIntrinsic(tag: { name: string; member: boolean }): boolean {
	return !tag.member && /^[a-z]/.test(tag.name);
}

function isBoundary(element: ts.JsxOpeningLikeElement): boolean {
	const tag = tagOf(element);
	if (!tag) return false;
	if (isIntrinsic(tag) ? BOUNDARY_TAGS.has(tag.name) : BOUNDARY_COMPONENTS.has(tag.name))
		return true;
	return attrLeaves(element, 'role').some((role) => BOUNDARY_ROLES.has(role));
}

function primaryLabel(element: ts.JsxOpeningLikeElement): string | undefined {
	const tag = tagOf(element);
	if (!tag) return undefined;
	const prop = PRIMARY_PROPS.get(tag.name);
	if (prop && !isIntrinsic(tag)) {
		if (tag.name === 'Button' && hasInlineAccentFill(element))
			return '<Button> with an accent fill';
		return prop.check(element) ? prop.label : undefined;
	}
	if (!isIntrinsic(tag)) return undefined;
	// A skip link sits off-viewport until focused; the app marks it `data-skip-link`.
	if (jsxAttribute(element, 'data-skip-link')) return undefined;
	const interactive =
		INTERACTIVE_TAGS.has(tag.name) ||
		attrLeaves(element, 'role').some((role) => INTERACTIVE_ROLES.has(role));
	return interactive && hasInlineAccentFill(element)
		? `<${tag.name}> with an accent fill`
		: undefined;
}

function terminates(statement: ts.Statement): boolean {
	if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
	if (ts.isBlock(statement)) {
		const last = statement.statements.at(-1);
		return last !== undefined && terminates(last);
	}
	return false;
}

/** `tab === 'notes' && <Pane/>` → the subject and the literal it is compared against. */
function discriminant(child: ts.JsxChild): { subject: string; value: string } | undefined {
	if (!ts.isJsxExpression(child) || !child.expression) return undefined;
	const e = skipOuter(child.expression);
	if (!ts.isBinaryExpression(e) || e.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) {
		return undefined;
	}
	let left = skipOuter(e.left);
	while (
		ts.isBinaryExpression(left) &&
		left.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
	) {
		left = skipOuter(left.left);
	}
	if (
		!ts.isBinaryExpression(left) ||
		(left.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
			left.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsToken)
	) {
		return undefined;
	}
	const isLiteral = (n: ts.Expression) =>
		ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);
	const [subject, value] = isLiteral(left.right)
		? [left.left, left.right]
		: isLiteral(left.left)
			? [left.right, left.left]
			: [undefined, undefined];
	if (!subject || !value) return undefined;
	return { subject: subject.getText(), value: value.getText() };
}

// --- the project ----------------------------------------------------------------------------

class Project {
	readonly modules = new Map<string, Module>();
	private readonly exposures = new Map<Component, Exposure>();
	private readonly inProgress = new Set<Component>();

	constructor(
		private readonly roots: EmphasisLintRoots,
		private readonly textTokens: Map<string, number>,
	) {
		for (const file of walk(roots.srcRoot))
			this.modules.set(file, buildModule(file, roots.repoRoot));
		for (const mod of this.modules.values()) {
			for (const [local, { spec, name }] of mod.importSpecs) {
				const file = this.resolveSpec(mod.file, spec);
				if (file) mod.imports.set(local, { file, name });
			}
			for (const { spec, names } of mod.reexportSpecs) {
				const file = this.resolveSpec(mod.file, spec);
				if (file) mod.reexports.push({ file, names });
			}
		}
	}

	findings(): Finding[] {
		const findings: Finding[] = [];
		for (const mod of this.modules.values()) {
			this.scanDisplayFace(mod, findings);
			this.scanEmphasis(mod, findings);
		}
		return findings.sort(
			(a, b) => compareText(a.file, b.file) || a.line - b.line || compareText(a.rule, b.rule),
		);
	}

	private resolveSpec(fromFile: string, spec: string): string | undefined {
		if (!spec.startsWith('.')) return undefined;
		const base = path.resolve(path.dirname(fromFile), spec);
		const stem = base.replace(/\.(?:[cm]?js|jsx|tsx?)$/, '');
		const candidates = [
			base,
			...SOURCE_EXTENSIONS.map((ext) => stem + ext),
			...SOURCE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
		];
		return candidates.find((candidate) => this.modules.has(candidate));
	}

	private resolveExport(file: string, name: string, depth: number): Component | undefined {
		const mod = this.modules.get(file);
		if (!mod || depth > 8) return undefined;
		const local = mod.exports.get(name);
		if (local) return this.resolveBinding(mod, local, depth + 1);
		for (const re of mod.reexports) {
			const source = re.names ? re.names.get(name) : name === 'default' ? undefined : name;
			if (!source) continue;
			const hit = this.resolveExport(re.file, source, depth + 1);
			if (hit) return hit;
		}
		return undefined;
	}

	private resolveBinding(mod: Module, local: string, depth: number): Component | undefined {
		const own = mod.components.get(local);
		if (own) return own;
		const imported = mod.imports.get(local);
		return imported ? this.resolveExport(imported.file, imported.name, depth) : undefined;
	}

	/** How many primaries a component can put into the region it is rendered in. */
	private exposure(component: Component): Exposure {
		const cached = this.exposures.get(component);
		if (cached) return cached;
		if (this.inProgress.has(component)) return { count: 0, contributors: [] };
		this.inProgress.add(component);
		const contributors: Contributor[] = [];
		const count = this.count(component.fn.body, component.module, contributors);
		this.inProgress.delete(component);
		const exposure = { count, contributors };
		this.exposures.set(component, exposure);
		return exposure;
	}

	/** The most primaries the subtree can show at once, not crossing into a nested region. */
	private count(node: ts.Node | undefined, mod: Module, out: Contributor[]): number {
		if (!node) return 0;
		if (ts.isJsxElement(node))
			return this.countElement(node.openingElement, node.children, mod, out);
		if (ts.isJsxSelfClosingElement(node)) return this.countElement(node, undefined, mod, out);
		if (ts.isJsxFragment(node)) return this.countChildren(node.children, mod, out);
		if (ts.isConditionalExpression(node)) {
			return (
				this.count(node.condition, mod, out) +
				Math.max(this.count(node.whenTrue, mod, out), this.count(node.whenFalse, mod, out))
			);
		}
		if (ts.isIfStatement(node)) {
			return (
				this.count(node.expression, mod, out) +
				Math.max(this.count(node.thenStatement, mod, out), this.count(node.elseStatement, mod, out))
			);
		}
		if (ts.isBlock(node)) return this.countStatements(node.statements, mod, out);
		if (ts.isSwitchStatement(node)) {
			let most = 0;
			for (const clause of node.caseBlock.clauses) {
				most = Math.max(most, this.countStatements(clause.statements, mod, out));
			}
			return this.count(node.expression, mod, out) + most;
		}
		// A component defined inside another is its own scope; it counts where it is rendered.
		if (mod.componentFns.has(node)) return 0;
		let total = 0;
		ts.forEachChild(node, (child) => {
			total += this.count(child, mod, out);
		});
		return total;
	}

	private countStatements(
		statements: ts.NodeArray<ts.Statement>,
		mod: Module,
		out: Contributor[],
	): number {
		let total = 0;
		for (let i = 0; i < statements.length; i += 1) {
			const statement = statements[i];
			if (ts.isReturnStatement(statement))
				return total + this.count(statement.expression, mod, out);
			// `if (loading) return <Spinner/>;` — what follows renders only when that branch did not.
			if (
				ts.isIfStatement(statement) &&
				!statement.elseStatement &&
				terminates(statement.thenStatement)
			) {
				const rest = ts.factory.createNodeArray(statements.slice(i + 1));
				return (
					total +
					this.count(statement.expression, mod, out) +
					Math.max(
						this.count(statement.thenStatement, mod, out),
						this.countStatements(rest, mod, out),
					)
				);
			}
			total += this.count(statement, mod, out);
		}
		return total;
	}

	private countChildren(
		children: ts.NodeArray<ts.JsxChild>,
		mod: Module,
		out: Contributor[],
	): number {
		let total = 0;
		// subject → compared literal → primaries; panes keyed by different literals never coexist.
		const panes = new Map<string, Map<string, number>>();
		for (const child of children) {
			const key = discriminant(child);
			const count = this.count(child, mod, out);
			if (!key) {
				total += count;
				continue;
			}
			const byValue = panes.get(key.subject) ?? new Map<string, number>();
			byValue.set(key.value, (byValue.get(key.value) ?? 0) + count);
			panes.set(key.subject, byValue);
		}
		for (const byValue of panes.values()) total += Math.max(...byValue.values());
		return total;
	}

	private countInside(
		element: ts.JsxOpeningLikeElement,
		children: ts.NodeArray<ts.JsxChild> | undefined,
		mod: Module,
		out: Contributor[],
	): number {
		let total = 0;
		for (const attr of element.attributes.properties) {
			if (ts.isJsxAttribute(attr) && attr.initializer)
				total += this.count(attr.initializer, mod, out);
		}
		return total + (children ? this.countChildren(children, mod, out) : 0);
	}

	private countElement(
		element: ts.JsxOpeningLikeElement,
		children: ts.NodeArray<ts.JsxChild> | undefined,
		mod: Module,
		out: Contributor[],
	): number {
		if (isBoundary(element)) return 0;
		const inside = this.countInside(element, children, mod, out);
		const line = lineOf(mod.sf, element);
		const label = primaryLabel(element);
		if (label) {
			out.push({ line, label });
			return inside + 1;
		}
		const tag = tagOf(element);
		if (!tag || tag.member || isIntrinsic(tag) || PRIMARY_PROPS.has(tag.name)) return inside;
		const component = this.resolveBinding(mod, tag.name, 0);
		if (!component) return inside;
		const exposed = this.exposure(component);
		if (exposed.count === 0) return inside;
		const first = [...exposed.contributors].sort((a, b) => a.line - b.line)[0];
		out.push({
			line,
			label: `<${tag.name}> (${first ? `${component.module.rel}:${first.line}` : component.module.rel})`,
		});
		return inside + 1;
	}

	private scanEmphasis(mod: Module, findings: Finding[]): void {
		const report = (where: string, count: number, contributors: Contributor[]) => {
			if (count < 2) return;
			const sorted = [...contributors].sort((a, b) => a.line - b.line);
			const listed = sorted.map((c) => `${c.label} at line ${c.line}`).join(', ');
			findings.push({
				rule: 'multiple-accent-primaries',
				file: mod.rel,
				line: (sorted[1] ?? sorted[0]).line,
				weight: count - 1,
				message: `${count} accent-filled primaries can show at once in ${where} (${listed}). Keep one; make the rest secondary.`,
			});
		};
		for (const scope of mod.scopes) {
			if (scope.component) {
				const exposed = this.exposure(scope.component);
				report(scope.name, exposed.count, exposed.contributors);
			} else {
				const contributors: Contributor[] = [];
				report(scope.name, this.count(scope.fn.body, mod, contributors), contributors);
			}
		}
		const visit = (node: ts.Node) => {
			const element = ts.isJsxElement(node)
				? node.openingElement
				: ts.isJsxSelfClosingElement(node)
					? node
					: undefined;
			if (element && isBoundary(element)) {
				const contributors: Contributor[] = [];
				const children = ts.isJsxElement(node) ? node.children : undefined;
				const count = this.countInside(element, children, mod, contributors);
				const role = attrLeaves(element, 'role')[0];
				const tag = `${tagOf(element)?.name}${role ? ` role="${role}"` : ''}`;
				report(`the <${tag}> at line ${lineOf(mod.sf, element)}`, count, contributors);
			}
			ts.forEachChild(node, visit);
		};
		visit(mod.sf);
	}

	private scanDisplayFace(mod: Module, findings: Finding[]): void {
		const visit = (node: ts.Node) => {
			if (ts.isObjectLiteralExpression(node)) this.checkFontObject(mod, node, findings);
			ts.forEachChild(node, visit);
		};
		visit(mod.sf);
	}

	private checkFontObject(
		mod: Module,
		object: ts.ObjectLiteralExpression,
		findings: Finding[],
	): void {
		// Apply shorthand resets and longhand overrides in declaration order, as React does.
		let states: { display: boolean; size?: number }[] = [{ display: false }];
		let anchor: ts.Node | undefined;
		for (const prop of object.properties) {
			if (!ts.isPropertyAssignment(prop)) continue;
			const name = propertyName(prop.name);
			if (name !== 'font' && name !== 'fontFamily' && name !== 'fontSize') continue;
			anchor = prop;
			const values = evaluate(prop.initializer);
			states = states
				.flatMap((state) =>
					values.map((value) => {
						if (name === 'font')
							return {
								display: DISPLAY_FACE.test(value),
								size: shorthandSizePx(value, this.textTokens),
							};
						if (name === 'fontFamily') return { ...state, display: DISPLAY_FACE.test(value) };
						return { ...state, size: cssSizePx(value, this.textTokens, true) };
					}),
				)
				.slice(0, MAX_VARIANTS);
		}
		const sizes = states.flatMap((state) =>
			state.display && state.size !== undefined ? [state.size] : [],
		);
		const small = sizes.filter((px) => px < DISPLAY_MIN_PX);
		if (!anchor || small.length === 0) return;
		const px = Math.round(Math.min(...small) * 100) / 100;
		findings.push({
			rule: 'display-face-below-24px',
			file: mod.rel,
			line: lineOf(mod.sf, anchor),
			weight: 1,
			message: `The display face (Cinzel) is set at ${px}px; it starts at --text-xl (${DISPLAY_MIN_PX}px). Use var(--font-sans) here, or make it a heading.`,
		});
	}
}

// --- public API -----------------------------------------------------------------------------

/**
 * Run both rules over the roots and return every finding. Exported so the fixture tests can plant
 * violations in a temp tree and prove each rule fires (and stays quiet on the exemptions).
 */
export function collectFindings(roots: EmphasisLintRoots): Finding[] {
	return new Project(roots, loadTextTokens(roots.typographyFile)).findings();
}

function emptyBaseline(): Baseline {
	return { 'display-face-below-24px': {}, 'multiple-accent-primaries': {} };
}

export function tally(findings: Finding[]): Baseline {
	const counts = emptyBaseline();
	for (const finding of findings) {
		counts[finding.rule][finding.file] = (counts[finding.rule][finding.file] ?? 0) + finding.weight;
	}
	return counts;
}

export function loadBaseline(file: string): Baseline | undefined {
	if (!fs.existsSync(file)) return undefined;
	const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
	const baseline = emptyBaseline();
	for (const [key, entries] of Object.entries(raw)) {
		if (key.startsWith('$')) continue;
		if (!(RULES as readonly string[]).includes(key))
			throw new Error(`Unknown rule "${key}" in ${file}.`);
		if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
			throw new Error(`"${key}" in ${file} must map files to counts.`);
		}
		for (const [source, count] of Object.entries(entries)) {
			if (!Number.isInteger(count) || (count as number) < 0) {
				throw new Error(`${key} → ${source} in ${file} must be a non-negative integer.`);
			}
			baseline[key as RuleId][source] = count as number;
		}
	}
	return baseline;
}

export function compareToBaseline(
	current: Baseline,
	baseline: Baseline,
): { regressions: BaselineDelta[]; shrinkable: BaselineDelta[] } {
	const regressions: BaselineDelta[] = [];
	const shrinkable: BaselineDelta[] = [];
	for (const rule of RULES) {
		const files = new Set([...Object.keys(current[rule]), ...Object.keys(baseline[rule])]);
		for (const file of [...files].sort()) {
			const count = current[rule][file] ?? 0;
			const allowed = baseline[rule][file] ?? 0;
			if (count > allowed) regressions.push({ rule, file, count, allowed });
			else if (count < allowed) shrinkable.push({ rule, file, count, allowed });
		}
	}
	return { regressions, shrinkable };
}

export function formatBaseline(counts: Baseline): string {
	const body: Record<string, unknown> = {
		$comment:
			'RC-ENG-8.4 emphasis lint baseline (scripts/emphasis-lint.ts). Counts may only go down: lower them with `pnpm lint:emphasis --write` after a fix; a raise fails the lint.',
	};
	for (const rule of RULES) {
		body[rule] = Object.fromEntries(
			Object.entries(counts[rule]).sort(([a], [b]) => compareText(a, b)),
		);
	}
	return `${JSON.stringify(body, null, '\t')}\n`;
}

function total(counts: Record<string, number>): number {
	return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

function summary(counts: Baseline): string {
	return RULES.map((rule) => `${rule} ${total(counts[rule])}`).join(', ');
}

function runCli(argv: string[]): number {
	const roots = defaultRoots();
	const findings = collectFindings(roots);
	const current = tally(findings);
	const baseline = loadBaseline(roots.baselineFile);
	const baselineRel = path.relative(roots.repoRoot, roots.baselineFile);

	if (argv.includes('--write')) {
		const raised = baseline ? compareToBaseline(current, baseline).regressions : [];
		if (raised.length > 0) {
			console.error(`emphasis lint: refusing to raise ${baselineRel}; fix these first:`);
			for (const d of raised) console.error(`  ${d.file}  ${d.rule}  ${d.count} > ${d.allowed}`);
			return 1;
		}
		fs.writeFileSync(roots.baselineFile, formatBaseline(current));
		console.log(`emphasis lint: wrote ${baselineRel} (${summary(current)}).`);
		return 0;
	}

	if (!baseline) {
		console.error(`emphasis lint: ${baselineRel} is missing. Run \`pnpm lint:emphasis --write\`.`);
		return 1;
	}
	if (!argv.includes('--quiet')) {
		for (const f of findings) console.warn(`warning  ${f.file}:${f.line}  ${f.rule}  ${f.message}`);
	}
	const { regressions, shrinkable } = compareToBaseline(current, baseline);
	console.log(`emphasis lint: ${summary(current)} (baseline ${summary(baseline)}).`);
	if (shrinkable.length > 0) {
		console.log(
			`emphasis lint: ${shrinkable.length} baseline entr${shrinkable.length === 1 ? 'y is' : 'ies are'} above the current count; lower ${baselineRel} with \`pnpm lint:emphasis --write\`.`,
		);
	}
	if (regressions.length > 0) {
		console.error('emphasis lint failed: counts above the baseline, which may only shrink:');
		for (const d of regressions) {
			console.error(`  ${d.file}  ${d.rule}  ${d.count} > ${d.allowed}`);
			for (const f of findings.filter((x) => x.file === d.file && x.rule === d.rule)) {
				console.error(`    ${f.file}:${f.line}  ${f.message}`);
			}
		}
		return 1;
	}
	return 0;
}

// Run only when invoked directly as a CLI, not when imported by tests.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
	process.exitCode = runCli(process.argv.slice(2));
}
