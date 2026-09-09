import React from 'react';
import { Icon } from '../core/Icon.jsx';

function normalizeTags(raw = []) {
	const seen = new Set();
	const out = [];
	for (const v of raw) {
		if (typeof v !== 'string') continue;
		const tag = v.trim();
		const lower = tag.toLowerCase();
		if (!tag || seen.has(lower)) continue;
		seen.add(lower);
		out.push(tag);
	}
	return out;
}

function splitTags(raw = '') {
	return String(raw)
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
}

function addUnique(base = [], next = [], maxTags = Infinity) {
	const seen = new Set(base.map((t) => t.toLowerCase()));
	const out = base.slice();
	for (const tag of next) {
		if (out.length >= maxTags) break;
		const value = tag.trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(value);
		if (out.length >= maxTags) break;
	}
	return out;
}

/**
 * TagInput — tokenized text input that emits discrete, de-duplicated tags.
 * Press Enter or comma to add the draft, Backspace on an empty draft to remove
 * the last tag, and blur to commit any pending draft value.
 */
export function TagInput({
	value = [],
	onChange,
	placeholder = 'Add a tag and press Enter',
	maxTags = Infinity,
	disabled = false,
	style,
	inputStyle,
	chipStyle,
	onBlur,
	onFocus,
	onKeyDown,
	...rest
}) {
	const tags = normalizeTags(value).slice(0, maxTags);
	const [draft, setDraft] = React.useState('');

	const push = (next) => {
		const nextTags = addUnique(tags, next, maxTags);
		if (nextTags.length === tags.length) return;
		onChange?.(nextTags);
	};

	const remove = (index) => {
		if (disabled) return;
		const next = tags.filter((_, i) => i !== index);
		onChange?.(next);
	};

	const commitDraft = () => {
		const next = splitTags(draft);
		if (!next.length) {
			setDraft('');
			return;
		}
		setDraft('');
		push(next);
	};

	const handleKeyDown = (event) => {
		if (disabled) return;
		if (event.nativeEvent.isComposing) return;
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			commitDraft();
		}
		if (event.key === 'Backspace' && !draft.trim() && tags.length > 0) {
			remove(tags.length - 1);
		}
		onKeyDown?.(event);
	};

	const handleFocus = (event) => {
		event.currentTarget.style.borderColor = 'var(--color-border-focus)';
		event.currentTarget.style.boxShadow = '0 0 0 3px var(--color-interactive-selected)';
		onFocus?.(event);
	};

	const handleBlur = (event) => {
		event.currentTarget.style.borderColor = 'var(--color-border-strong)';
		event.currentTarget.style.boxShadow = 'none';
		commitDraft();
		onBlur?.(event);
	};

	const handleChange = (event) => {
		setDraft(event.target.value);
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', ...style }}>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="list">
				{tags.map((tag, index) => (
					<div
						key={`${tag}-${index}`}
						role="listitem"
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 6,
							padding: '3px 8px',
							borderRadius: 'var(--radius-sm)',
							fontSize: 'var(--text-2xs)',
							fontFamily: 'var(--font-sans)',
							background: 'var(--color-accent-subtle)',
							border: '1px solid var(--color-accent-border)',
							color: 'var(--color-text-primary)',
							...chipStyle,
						}}
					>
						<span>{tag}</span>
						<button
							type="button"
							aria-label={`Remove ${tag}`}
							onClick={() => remove(index)}
							disabled={disabled}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 16,
								height: 16,
								border: 'none',
								borderRadius: 'var(--radius-sm)',
								background: 'transparent',
								padding: 0,
								color: 'var(--color-text-secondary)',
								cursor: disabled ? 'not-allowed' : 'pointer',
							}}
						>
							<Icon name="x" size={12} />
						</button>
					</div>
				))}
			</div>
			<input
				type="text"
				value={draft}
				placeholder={placeholder}
				disabled={disabled}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onFocus={handleFocus}
				onBlur={handleBlur}
				style={{
					width: '100%',
					fontFamily: 'var(--font-sans)',
					fontSize: 'var(--text-base)',
					color: 'var(--color-text-primary)',
					background: 'var(--color-surface-sunken)',
					border: '1px solid var(--color-border-strong)',
					borderRadius: 'var(--radius-sm)',
					padding: 'var(--component-input-py) var(--component-input-px)',
					minHeight: 'var(--density-input-height, 2.25rem)',
					transition:
						'border-color var(--duration-fast) var(--easing-standard), box-shadow var(--duration-fast) var(--easing-standard)',
					boxSizing: 'border-box',
					...inputStyle,
				}}
				{...rest}
			/>
			{maxTags !== Infinity && (
				<div style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-tertiary)' }}>
					{tags.length}/{maxTags}
				</div>
			)}
		</div>
	);
}
