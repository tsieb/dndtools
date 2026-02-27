import { z } from 'zod';

export const resourceContentSchema = z
	.object({
		uri: z.string().min(1),
		mimeType: z.string().min(1),
		text: z.string(),
	})
	.strict();

export const resourceResponseSchema = z
	.object({
		contents: z.array(resourceContentSchema).min(1),
	})
	.strict();

export function textResourceResult(
	uri: string,
	mimeType: string,
	text: string,
): z.infer<typeof resourceResponseSchema> {
	return resourceResponseSchema.parse({
		contents: [{ uri, mimeType, text }],
	});
}

export function jsonResourceResult<T>(
	uri: string,
	payload: T,
	schema: z.ZodType<T>,
): z.infer<typeof resourceResponseSchema> {
	const validated = schema.parse(payload);
	return textResourceResult(uri, 'application/json', JSON.stringify(validated, null, 2));
}
