/**
 * The Session baselines' serialisations (as in `CommandCenter.baseline.test.tsx`), moved out of
 * `Session.baseline.test.tsx` for size (RC-POL-1.4). A test file cannot import another without
 * running its tests, so the shared serialisers live in this plain module. Unchanged.
 *
 * - `domSkeleton` — the semantic DOM skeleton: headings, controls, images, landmarks and every
 *   element with a role, with their accessibility attributes and text, in document order.
 * - `ariaTree` — the accessibility tree, in the shape `ariaSnapshot()` prints.
 * - `headingOutline` and `focusOrder` — the heading outline and every tab stop by role and name.
 */

const KEPT_TAGS = new Set(
	'h1 h2 h3 h4 h5 h6 button a input select textarea img svg section main nav ul ol li'.split(' '),
);
const KEPT_ATTRIBUTES = (
	'role aria-label aria-current aria-pressed aria-disabled aria-hidden aria-busy' +
	' title type tabindex disabled data-widget-region'
).split(' ');

export const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

export function domSkeleton(root: Element): string {
	const lines: string[] = [];
	const walk = (node: Node, depth: number) => {
		let text = '';
		const flush = () => {
			if (squash(text)) lines.push(`${'  '.repeat(depth)}"${squash(text)}"`);
			text = '';
		};
		for (const child of node.childNodes) {
			if (child.nodeType === 3) {
				text += child.textContent ?? '';
				continue;
			}
			if (!(child instanceof Element)) continue;
			const tag = child.tagName.toLowerCase();
			if (!KEPT_TAGS.has(tag) && !child.hasAttribute('role')) {
				flush();
				walk(child, depth);
				continue;
			}
			flush();
			const attributes = KEPT_ATTRIBUTES.filter((name) => child.hasAttribute(name)).map(
				(name) => `${name}=${JSON.stringify(child.getAttribute(name))}`,
			);
			lines.push(`${'  '.repeat(depth)}<${tag}${attributes.map((a) => ` ${a}`).join('')}>`);
			if (tag !== 'svg') walk(child, depth + 1);
		}
		flush();
	};
	walk(root, 0);
	return lines.join('\n');
}

const HIDDEN = (el: Element) =>
	el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden');

export function roleOf(el: Element): string | null {
	const explicit = el.getAttribute('role');
	if (explicit) return explicit;
	const tag = el.tagName.toLowerCase();
	if (/^h[1-6]$/.test(tag)) return 'heading';
	if (tag === 'button') return 'button';
	if (tag === 'a' && el.hasAttribute('href')) return 'link';
	if (tag === 'img') return 'img';
	if (tag === 'main') return 'main';
	if (tag === 'nav') return 'navigation';
	if (tag === 'section' && el.hasAttribute('aria-label')) return 'region';
	if (tag === 'ul' || tag === 'ol') return 'list';
	if (tag === 'li') return 'listitem';
	if (tag === 'input') return el.getAttribute('type') === 'checkbox' ? 'checkbox' : 'textbox';
	if (tag === 'textarea') return 'textbox';
	if (tag === 'select') return 'combobox';
	return null;
}

function contentText(el: Element): string {
	const parts: string[] = [];
	const walk = (node: Node) => {
		for (const child of node.childNodes) {
			if (child.nodeType === 3) parts.push(child.textContent ?? '');
			else if (child instanceof Element && !HIDDEN(child)) {
				parts.push(' ');
				walk(child);
				parts.push(' ');
			}
		}
	};
	walk(el);
	return squash(parts.join(''));
}

const NAME_FROM_CONTENT = new Set(['button', 'heading', 'link', 'listitem']);
const LEAF_ROLES = new Set(['img', 'textbox', 'checkbox', 'combobox']);

export function ariaTree(root: Element): string {
	const lines: string[] = [];
	const walk = (node: Node, depth: number) => {
		let text = '';
		const flush = () => {
			if (squash(text)) lines.push(`${'  '.repeat(depth)}- text: ${squash(text)}`);
			text = '';
		};
		for (const child of node.childNodes) {
			if (child.nodeType === 3) {
				text += child.textContent ?? '';
				continue;
			}
			if (!(child instanceof Element) || HIDDEN(child)) continue;
			const role = roleOf(child);
			if (!role) {
				text += ' ';
				walk(child, depth);
				continue;
			}
			flush();
			const label = child.getAttribute('aria-label');
			const name = label ?? (NAME_FROM_CONTENT.has(role) ? contentText(child) : '');
			const level = role === 'heading' ? ` [level=${child.tagName.slice(1)}]` : '';
			const head = `${'  '.repeat(depth)}- ${role}${name ? ` ${JSON.stringify(name)}` : ''}${level}`;
			if (NAME_FROM_CONTENT.has(role) || LEAF_ROLES.has(role)) {
				lines.push(head);
				continue;
			}
			const before = lines.length;
			lines.push(`${head}:`);
			walk(child, depth + 1);
			if (lines.length === before + 1) lines[before] = head;
		}
		flush();
	};
	walk(root, 0);
	return lines.join('\n');
}

export function headingOutline(root: Element): string {
	return [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')]
		.filter((el) => !el.closest('[aria-hidden="true"]'))
		.map((el) => `${el.tagName.toLowerCase()} ${squash(el.textContent)}`)
		.join('\n');
}

export function focusOrder(root: Element): string {
	const stops = [
		...root.querySelectorAll<HTMLElement>(
			'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		),
	].filter((el) => !el.hasAttribute('disabled') && !el.closest('[aria-hidden="true"],[hidden]'));
	return stops
		.map(
			(el) =>
				`${roleOf(el) ?? el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? contentText(el)}`,
		)
		.join('\n');
}
