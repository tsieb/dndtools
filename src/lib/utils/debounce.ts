/**
 * Creates a debounced version of the given function.
 * The function will only be called after `ms` milliseconds
 * have passed since the last invocation.
 */
export function debounce<T extends (...args: never[]) => void>(
	fn: T,
	ms: number,
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	return (...args: Parameters<T>): void => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			timeoutId = null;
			fn(...args);
		}, ms);
	};
}
