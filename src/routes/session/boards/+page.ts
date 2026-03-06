import type { PageLoad } from './$types';
import type { BreadcrumbItem } from '$lib/types/breadcrumb.js';

export const breadcrumb: BreadcrumbItem[] = [
	{ label: 'Session', href: '/session/boards' },
	{ label: 'Boards', href: null },
];

export const load: PageLoad = () => ({
	breadcrumb,
});
