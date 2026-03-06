import type { PageLoad } from './$types';
import type { BreadcrumbItem } from '$lib/types/breadcrumb.js';

export const breadcrumb: BreadcrumbItem[] = [{ label: 'Knowledge', href: null }];

export const load: PageLoad = () => ({
	breadcrumb,
});
