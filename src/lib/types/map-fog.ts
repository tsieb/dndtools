export type MapFogBrushShape = 'circle' | 'rectangle' | 'polygon';
export type MapFogOperationMode = 'reveal' | 'refog';
export type MapFogColorTheme = 'black' | 'smoky_gray';

export interface MapFogPoint {
	x: number;
	y: number;
}

export interface MapFogPolygonOperation {
	id: string;
	mode: MapFogOperationMode;
	shape: MapFogBrushShape;
	points: MapFogPoint[];
	createdAt: string;
}

export interface MapFogState {
	colorTheme: MapFogColorTheme;
	freeExplore: boolean;
	polygons: MapFogPolygonOperation[];
	updatedAt: string;
}
