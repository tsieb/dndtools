import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import type { MapObject } from '../../../src/lib/types/object.js';
import {
	estimateTravelTimeForRoute,
	summarizeRouteDistance,
} from '../../../src/lib/domain/map-routes.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerEstimateTravelTimeTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'estimate_travel_time',
		'Estimate D&D 5e travel time for a named route on a map.',
		{
			mapId: z.string().min(1),
			routeName: z.string().min(1),
		},
		async ({ mapId, routeName }) => {
			const object = await storage.getObject(mapId as never);
			if (!object || object.type !== 'map') {
				return errorResult(`Map "${mapId}" was not found.`, {
					code: 'MCP_NOT_FOUND',
					tool: 'estimate_travel_time',
					hint: 'Pass a valid map object id from list_objects or read_object.',
				});
			}
			const map = object as MapObject;
			const normalizedRouteName = routeName.trim().toLowerCase();
			const route = (map.data.routes ?? []).find(
				(entry) => entry.name.trim().toLowerCase() === normalizedRouteName,
			);
			if (!route) {
				return errorResult(`Route "${routeName}" was not found on map "${map.name}".`, {
					code: 'MCP_NOT_FOUND',
					tool: 'estimate_travel_time',
					hint: 'Use the exact route name saved in map metadata.',
				});
			}
			if (!map.data.width || !map.data.height || map.data.width <= 0 || map.data.height <= 0) {
				return errorResult('Map dimensions are required to estimate route distance.', {
					code: 'MCP_INVALID_INPUT',
					tool: 'estimate_travel_time',
					hint: 'Open and save the map once so width/height metadata is persisted.',
				});
			}
			const distance = summarizeRouteDistance(route, map.data);
			const estimate = estimateTravelTimeForRoute(route, map.data);
			if (!estimate) {
				return errorResult('Travel time requires map scale in a supported unit.', {
					code: 'MCP_INVALID_INPUT',
					tool: 'estimate_travel_time',
					hint: 'Set map scale using mi, ft, m, or km, then retry.',
				});
			}

			return jsonResult({
				map: {
					id: String(map.id),
					name: map.name,
				},
				route: {
					id: route.id,
					name: route.name,
					style: route.style,
					waypointCount: route.waypoints.length,
				},
				distance: {
					pixels: Number(distance.pixels.toFixed(2)),
					gridSquares:
						distance.gridSquares === null ? null : Number(distance.gridSquares.toFixed(3)),
					scaledDistance:
						distance.scaledDistance === null ? null : Number(distance.scaledDistance.toFixed(3)),
					unitLabel: distance.unitLabel,
					miles: Number(estimate.distanceMiles.toFixed(3)),
				},
				pace: estimate.pace,
				assumptions: {
					hoursPerTravelDay: 8,
					milesPerHour: {
						slow: 2,
						normal: 3,
						fast: 4,
					},
				},
			});
		},
	);
}
