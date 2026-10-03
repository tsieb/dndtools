import { useLayoutEffect, useRef } from 'react';

/** Reserve the fixed phone navigation's actual height, including wrapping and safe areas. */
export function useNavigationInset() {
	const ref = useRef<HTMLElement>(null);
	useLayoutEffect(() => {
		const navigation = ref.current;
		if (!navigation) return;
		const root = document.documentElement;
		const property = '--player-navigation-height';
		const previous = root.style.getPropertyValue(property);
		const update = () => {
			root.style.setProperty(property, `${navigation.getBoundingClientRect().height}px`);
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(navigation);
		return () => {
			observer.disconnect();
			if (previous) root.style.setProperty(property, previous);
			else root.style.removeProperty(property);
		};
	}, []);
	return ref;
}
