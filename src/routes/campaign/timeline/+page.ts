import type { PageLoad } from './$types';
import type { BreadcrumbItem } from '$lib/types/breadcrumb.js';

export const breadcrumb: BreadcrumbItem[] = [
	{ label: 'Campaign', href: '/campaign/timeline' },
	{ label: 'Timeline', href: null },
];

export const load: PageLoad = () => ({
	breadcrumb,
});
