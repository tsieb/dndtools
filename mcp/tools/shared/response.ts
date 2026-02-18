export interface ToolResult {
	content: Array<{ type: 'text'; text: string }>;
	isError?: boolean;
}

export function jsonResult(payload: unknown): ToolResult {
	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify(payload, null, 2),
			},
		],
	};
}

export function textResult(text: string): ToolResult {
	return {
		content: [
			{
				type: 'text',
				text,
			},
		],
	};
}

export function errorResult(message: string): ToolResult {
	return {
		content: [
			{
				type: 'text',
				text: message,
			},
		],
		isError: true,
	};
}