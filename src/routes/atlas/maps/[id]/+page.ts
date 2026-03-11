import type { PageLoad } from './$types';
import type { BreadcrumbItem } from '$lib/types/breadcrumb.js';

export const load: PageLoad = ({ params }) => {
	const mapId = decodeURIComponent(params.id);
	const breadcrumb: BreadcrumbItem[] = [
		{ label: 'Atlas', href: '/atlas/maps' },
		{ label: 'Maps', href: '/atlas/maps' },
		{ label: `Map ${mapId}`, href: null },
	];

	return {
		mapId,
		breadcrumb,
	};
};
