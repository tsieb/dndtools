const DICE_COUNT_LIMIT = 200;
const DICE_SIDES_LIMIT = 1000;
const MAX_EXPRESSION_LENGTH = 200;
const MAX_MACRO_LABEL_LENGTH = 80;
const MAX_MACRO_EXPRESSION_LENGTH = 200;
const MAX_DICE_MACROS = 80;

type TokenType =
	| 'number'
	| 'plus'
	| 'minus'
	| 'mul'
	| 'div'
	| 'lparen'
	| 'rparen'
	| 'd'
	| 'kh'
	| 'kl'
	| 'adv'
	| 'dis'
	| 'eof';

interface Token {
	type: TokenType;
	position: number;
	value?: number;
}

type DiceAstNode = DiceNumberNode | DiceUnaryNode | DiceBinaryNode | DiceRollNode;

interface DiceNumberNode {
	kind: 'number';
	value: number;
}

interface DiceUnaryNode {
	kind: 'unary';
	operator: '-';
	argument: DiceAstNode;
}

interface DiceBinaryNode {
	kind: 'binary';
	operator: '+' | '-' | '*' | '/';
	left: DiceAstNode;
	right: DiceAstNode;
}

type DiceKeepMode = 'highest' | 'lowest';

interface DiceRollNode {
	kind: 'roll';
	count: number;
	sides: number;
	keepMode: DiceKeepMode | null;
	keepCount: number | null;
	label?: 'adv' | 'dis';
}

export interface DiceRollDetail {
	notation: string;
	count: number;
	sides: number;
	rolls: number[];
	kept: number[];
	keptIndices: number[];
	dropped: number[];
	droppedIndices: number[];
	subtotal: number;
	keepMode: DiceKeepMode | null;
	keepCount: number | null;
}

export interface DiceRollResult {
	expression: string;
	total: number;
	totalText: string;
	breakdown: string;
	markdownLine: string;
	rolls: DiceRollDetail[];
}

export interface DiceMacro {
	id: string;
	label: string;
	expression: string;
	createdAt: string;
	updatedAt: string;
}

export class DiceExpressionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DiceExpressionError';
	}
}

interface EvaluateResult {
	value: number;
	breakdown: string;
	rolls: DiceRollDetail[];
}

function isDigit(char: string): boolean {
	return char >= '0' && char <= '9';
}

function isAlpha(char: string): boolean {
	return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
}

function normalizeExpression(expression: string): string {
	const trimmed = expression.trim();
	if (!trimmed) {
		throw new DiceExpressionError('Dice expression is empty.');
	}
	if (trimmed.length > MAX_EXPRESSION_LENGTH) {
		throw new DiceExpressionError(`Dice expression exceeds ${MAX_EXPRESSION_LENGTH} characters.`);
	}
	return trimmed;
}

function formatNumber(value: number): string {
	if (Number.isInteger(value)) return String(value);
	return Number.parseFloat(value.toFixed(2)).toString();
}

function buildRollNotation(node: DiceRollNode): string {
	if (node.label) return node.label;
	let notation = `${node.count}d${node.sides}`;
	if (node.keepMode && node.keepCount !== null) {
		notation += `${node.keepMode === 'highest' ? 'kh' : 'kl'}${node.keepCount}`;
	}
	return notation;
}

function tokenize(expression: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;

	while (index < expression.length) {
		const char = expression[index]!;
		if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
			index += 1;
			continue;
		}

		if (isDigit(char)) {
			let cursor = index + 1;
			while (cursor < expression.length && isDigit(expression[cursor]!)) {
				cursor += 1;
			}
			const raw = expression.slice(index, cursor);
			const value = Number.parseInt(raw, 10);
			tokens.push({ type: 'number', position: index, value });
			index = cursor;
			continue;
		}

		if (isAlpha(char)) {
			let cursor = index + 1;
			while (cursor < expression.length && isAlpha(expression[cursor]!)) {
				cursor += 1;
			}
			const raw = expression.slice(index, cursor).toLowerCase();
			if (raw === 'd' || raw === 'kh' || raw === 'kl' || raw === 'adv' || raw === 'dis') {
				tokens.push({ type: raw, position: index });
				index = cursor;
				continue;
			}
			throw new DiceExpressionError(`Unsupported token "${raw}" in dice expression.`);
		}

		switch (char) {
			case '+':
				tokens.push({ type: 'plus', position: index });
				break;
			case '-':
				tokens.push({ type: 'minus', position: index });
				break;
			case '*':
				tokens.push({ type: 'mul', position: index });
				break;
			case '/':
				tokens.push({ type: 'div', position: index });
				break;
			case '(':
				tokens.push({ type: 'lparen', position: index });
				break;
			case ')':
				tokens.push({ type: 'rparen', position: index });
				break;
			default:
				throw new DiceExpressionError(`Unexpected character "${char}" in dice expression.`);
		}
		index += 1;
	}

	tokens.push({ type: 'eof', position: expression.length });
	return tokens;
}

class DiceParser {
	private index = 0;

	constructor(private readonly tokens: Token[]) {}

	parseExpression(): DiceAstNode {
		const node = this.parseAdditive();
		this.expect('eof', 'Unexpected trailing tokens in dice expression.');
		return node;
	}

	private current(): Token {
		return this.tokens[this.index]!;
	}

	private match(type: TokenType): boolean {
		if (this.current().type === type) {
			this.index += 1;
			return true;
		}
		return false;
	}

	private expect(type: TokenType, message: string): Token {
		const token = this.current();
		if (token.type !== type) {
			throw new DiceExpressionError(message);
		}
		this.index += 1;
		return token;
	}

	private parseAdditive(): DiceAstNode {
		let node = this.parseMultiplicative();
		while (true) {
			if (this.match('plus')) {
				node = { kind: 'binary', operator: '+', left: node, right: this.parseMultiplicative() };
				continue;
			}
			if (this.match('minus')) {
				node = { kind: 'binary', operator: '-', left: node, right: this.parseMultiplicative() };
				continue;
			}
			return node;
		}
	}

	private parseMultiplicative(): DiceAstNode {
		let node = this.parseUnary();
		while (true) {
			if (this.match('mul')) {
				node = { kind: 'binary', operator: '*', left: node, right: this.parseUnary() };
				continue;
			}
			if (this.match('div')) {
				node = { kind: 'binary', operator: '/', left: node, right: this.parseUnary() };
				continue;
			}
			return node;
		}
	}

	private parseUnary(): DiceAstNode {
		if (this.match('minus')) {
			return {
				kind: 'unary',
				operator: '-',
				argument: this.parseUnary(),
			};
		}
		return this.parsePrimary();
	}

	private parsePrimary(): DiceAstNode {
		const token = this.current();

		if (this.match('number')) {
			const count = token.value ?? 0;
			if (this.match('d')) {
				return this.parseRoll(count);
			}
			return {
				kind: 'number',
				value: count,
			};
		}

		if (this.match('d')) {
			return this.parseRoll(1);
		}

		if (this.match('adv')) {
			return {
				kind: 'roll',
				count: 2,
				sides: 20,
				keepMode: 'highest',
				keepCount: 1,
				label: 'adv',
			};
		}

		if (this.match('dis')) {
			return {
				kind: 'roll',
				count: 2,
				sides: 20,
				keepMode: 'lowest',
				keepCount: 1,
				label: 'dis',
			};
		}

		if (this.match('lparen')) {
			const node = this.parseAdditive();
			this.expect('rparen', 'Missing closing parenthesis in dice expression.');
			return node;
		}

		throw new DiceExpressionError('Unable to parse dice expression.');
	}

	private parseRoll(count: number): DiceRollNode {
		if (!Number.isInteger(count) || count <= 0) {
			throw new DiceExpressionError('Dice count must be a positive integer.');
		}
		if (count > DICE_COUNT_LIMIT) {
			throw new DiceExpressionError(`Dice count cannot exceed ${DICE_COUNT_LIMIT}.`);
		}

		const sidesToken = this.expect('number', 'Expected dice sides after "d".');
		const sides = sidesToken.value ?? 0;
		if (!Number.isInteger(sides) || sides <= 0) {
			throw new DiceExpressionError('Dice sides must be a positive integer.');
		}
		if (sides > DICE_SIDES_LIMIT) {
			throw new DiceExpressionError(`Dice sides cannot exceed ${DICE_SIDES_LIMIT}.`);
		}

		let keepMode: DiceKeepMode | null = null;
		let keepCount: number | null = null;
		if (this.match('kh') || this.match('kl')) {
			const previous = this.tokens[this.index - 1];
			keepMode = previous?.type === 'kh' ? 'highest' : 'lowest';
			const countToken = this.expect(
				'number',
				'Expected keep count after keep-highest/keep-lowest modifier.',
			);
			keepCount = countToken.value ?? 0;
			if (!Number.isInteger(keepCount) || keepCount <= 0) {
				throw new DiceExpressionError('Keep count must be a positive integer.');
			}
			if (keepCount > count) {
				throw new DiceExpressionError('Keep count cannot exceed dice count.');
			}
		}

		return {
			kind: 'roll',
			count,
			sides,
			keepMode,
			keepCount,
		};
	}
}

function randomDieValue(sides: number, random: () => number): number {
	const sample = random();
	if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
		throw new DiceExpressionError('Random source produced an invalid sample.');
	}
	return Math.floor(sample * sides) + 1;
}

function evaluateRollNode(node: DiceRollNode, random: () => number): EvaluateResult {
	const rolls = Array.from({ length: node.count }, () => randomDieValue(node.sides, random));
	let kept = [...rolls];
	let keptIndices = rolls.map((_value, index) => index);
	let dropped: number[] = [];
	let droppedIndices: number[] = [];
	if (node.keepMode && node.keepCount !== null) {
		const sorted = rolls
			.map((value, index) => ({ value, index }))
			.sort((a, b) => {
				if (node.keepMode === 'highest') {
					if (b.value !== a.value) return b.value - a.value;
				} else if (a.value !== b.value) {
					return a.value - b.value;
				}
				return a.index - b.index;
			});
		const keepSet = new Set(sorted.slice(0, node.keepCount).map((entry) => entry.index));
		keptIndices = rolls.map((_value, index) => index).filter((index) => keepSet.has(index));
		droppedIndices = rolls.map((_value, index) => index).filter((index) => !keepSet.has(index));
		kept = rolls.filter((_value, index) => keepSet.has(index));
		dropped = rolls.filter((_value, index) => !keepSet.has(index));
	}

	const subtotal = kept.reduce((acc, value) => acc + value, 0);
	const breakdown = kept.length > 0 ? kept.join(' + ') : '0';
	const detail: DiceRollDetail = {
		notation: buildRollNotation(node),
		count: node.count,
		sides: node.sides,
		rolls,
		kept,
		keptIndices,
		dropped,
		droppedIndices,
		subtotal,
		keepMode: node.keepMode,
		keepCount: node.keepCount,
	};
	return {
		value: subtotal,
		breakdown,
		rolls: [detail],
	};
}

function evaluateNode(node: DiceAstNode, random: () => number): EvaluateResult {
	if (node.kind === 'number') {
		return {
			value: node.value,
			breakdown: formatNumber(node.value),
			rolls: [],
		};
	}

	if (node.kind === 'roll') {
		return evaluateRollNode(node, random);
	}

	if (node.kind === 'unary') {
		const inner = evaluateNode(node.argument, random);
		return {
			value: -inner.value,
			breakdown: `-${inner.breakdown}`,
			rolls: inner.rolls,
		};
	}

	const left = evaluateNode(node.left, random);
	const right = evaluateNode(node.right, random);
	let value = 0;
	if (node.operator === '+') value = left.value + right.value;
	if (node.operator === '-') value = left.value - right.value;
	if (node.operator === '*') value = left.value * right.value;
	if (node.operator === '/') {
		if (right.value === 0) {
			throw new DiceExpressionError('Division by zero is not allowed in dice expressions.');
		}
		value = left.value / right.value;
	}
	if (!Number.isFinite(value)) {
		throw new DiceExpressionError('Dice expression evaluated to a non-finite number.');
	}
	return {
		value,
		breakdown: `${left.breakdown} ${node.operator} ${right.breakdown}`,
		rolls: [...left.rolls, ...right.rolls],
	};
}

function parseDiceExpression(expression: string): { normalized: string; ast: DiceAstNode } {
	const normalized = normalizeExpression(expression);
	const parser = new DiceParser(tokenize(normalized));
	const ast = parser.parseExpression();
	return { normalized, ast };
}

export function validateDiceExpression(expression: string): string {
	return parseDiceExpression(expression).normalized;
}

export function rollDiceExpression(
	expression: string,
	options?: { random?: () => number },
): DiceRollResult {
	const { normalized, ast } = parseDiceExpression(expression);
	const evaluated = evaluateNode(ast, options?.random ?? Math.random);
	const totalText = formatNumber(evaluated.value);
	const markdownLine = `> 🎲 ${normalized} = **${totalText}** (${evaluated.breakdown})`;
	return {
		expression: normalized,
		total: evaluated.value,
		totalText,
		breakdown: evaluated.breakdown,
		markdownLine,
		rolls: evaluated.rolls,
	};
}

export function parseInlineRollCommand(line: string): string | null {
	const match = line.match(/^\s*\/roll\s+(.+?)\s*$/i);
	const expression = match?.[1]?.trim() ?? '';
	return expression.length > 0 ? expression : null;
}

function normalizeMacroId(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim();
}

function normalizeMacroLabel(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim().slice(0, MAX_MACRO_LABEL_LENGTH);
}

function normalizeMacroExpression(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim().slice(0, MAX_MACRO_EXPRESSION_LENGTH);
}

function normalizeMacroTimestamp(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeDiceMacro(raw: unknown, fallbackAt: string): DiceMacro | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const record = raw as Record<string, unknown>;
	const id = normalizeMacroId(record.id);
	const label = normalizeMacroLabel(record.label);
	const expression = normalizeMacroExpression(record.expression);
	if (!id || !label || !expression) return null;
	return {
		id,
		label,
		expression,
		createdAt: normalizeMacroTimestamp(record.createdAt, fallbackAt),
		updatedAt: normalizeMacroTimestamp(record.updatedAt, fallbackAt),
	};
}

export function normalizeDiceMacros(value: unknown): DiceMacro[] {
	if (!Array.isArray(value)) return [];
	const now = new Date().toISOString();
	const byId = new Map<string, DiceMacro>();
	for (const entry of value) {
		const macro = normalizeDiceMacro(entry, now);
		if (!macro) continue;
		byId.set(macro.id, macro);
	}
	return [...byId.values()]
		.sort((a, b) => a.label.localeCompare(b.label))
		.slice(0, MAX_DICE_MACROS);
}
