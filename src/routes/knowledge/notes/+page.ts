import type { PageLoad } from './$types';
import type { BreadcrumbItem } from '$lib/types/breadcrumb.js';

const baseBreadcrumb: BreadcrumbItem[] = [
	{ label: 'Knowledge', href: '/knowledge' },
	{ label: 'Notes', href: null },
];

export const breadcrumb = baseBreadcrumb;

export const load: PageLoad = ({ url }) => {
	const scoped = [...baseBreadcrumb];
	const folder = url.searchParams.get('folder');
	const tag = url.searchParams.get('tag');
	if (folder) {
		scoped.push({ label: folder, href: null });
	}
	if (tag) {
		scoped.push({ label: `#${tag}`, href: null });
	}
	return {
		breadcrumb: scoped,
	};
};
